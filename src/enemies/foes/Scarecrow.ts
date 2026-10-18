import * as THREE from 'three';
import { WeaponTracer } from '../../combat/WeaponTracer';
import type { AttackWindowSource } from '../../combat/types';
import type { DamageResultLike } from '../ports';
import { HeightfieldMover, SwitchingMover, type EnemyMover } from '../steering/movers';
import { turnToward, yawTo } from '../steering/steering';
import type { AiState } from '../types';
import { Foe } from './Foe';
import { SCARECROW } from './tuning';
import type { FoeEnv, FoeSpawnInfo } from './types';
import { buildScarecrowVisual, type ScarecrowVisual } from './visuals';

export type ScarecrowState = 'dormant' | 'lurch' | 'windup' | 'swing' | 'recover' | 'down' | 'burning' | 'cleared';

const ARM_REST = 0.3;
const ARM_RAISED = 2.8;
const ARM_STRUCK = 1.0;
const FALL_ANGLE = 1.45;
const FLAME = new THREE.Color(0xff5a10);
const CHAR = new THREE.Color(0x24160c);

/**
 * R01's ash-possessed scarecrow. Dormant until the player is within 14 m, then it lurches at the
 * player and claws (0.7 s windup, 10 damage). A sword only knocks it down for 2.5 s; only the carried
 * torch (burns 4 s) or the Surge clears it, announced once by `scarecrow.cleared`.
 */
export class Scarecrow extends Foe {
  private readonly v: ScarecrowVisual;
  private readonly mover: EnemyMover;
  private readonly tmp = new THREE.Vector3();
  private readonly torchAt = { x: 0, y: 0, z: 0 };
  private current: ScarecrowState = 'dormant';
  private stateTime = 0;
  private cooldown = 0;
  private yaw: number;
  private clock = 0;
  private fall = 0;
  private swingSerial = 0;
  /** The swing id of a telegraph that has not yet been closed by the swing ending or cancelling. */
  private openTelegraph: number | null = null;
  private aggroed = false;
  private calmed = false;
  private clearedEmitted = false;

  constructor(env: FoeEnv, info: FoeSpawnInfo) {
    const visual = buildScarecrowVisual(info.slug);
    super(env, info, visual);
    this.v = visual;
    const host = env.host;
    this.yaw = info.yaw;
    try {
      this.mover = host.physics
        ? new SwitchingMover(host.physics, host.heightAt, info.feet)
        : new HeightfieldMover(host.heightAt, info.feet);
      this.placeRoot(this.mover.feet);
      visual.root.updateMatrixWorld(true);
      const tracer = new WeaponTracer({
        attacker: visual.root,
        weapon: visual.arm,
        hilt: visual.hilt,
        tip: visual.tip,
        ownHurtboxes: this.hurtboxes,
        bus: host.combat.bus,
      });
      this.removers.push(host.combat.addAttacker(this.actor.id, tracer, this.windowSource()));
      if (info.aggro) this.startLurch();
    } catch (err) {
      (this as unknown as { mover?: EnemyMover }).mover?.dispose();
      this.abort();
      throw err;
    }
  }

  get state(): ScarecrowState {
    return this.current;
  }

  /** Simulated feet. */
  get feet(): THREE.Vector3 {
    return this.mover.feet;
  }

  /** The id the quest counts: the spawner slot's anchor id (e.g. 'r01.scarecrow.3'). */
  get scarecrowId(): string {
    return this.info.anchorId ?? this.info.spawnerId ?? this.info.slug;
  }

  protected override aiState(): AiState {
    switch (this.current) {
      case 'lurch':
        return 'chase';
      case 'windup':
        return 'telegraph';
      case 'swing':
        return 'attack';
      case 'recover':
        return 'recover';
      case 'down':
        return 'stagger';
      case 'cleared':
        return 'dead';
      default:
        return 'idle';
    }
  }

  // ---- fixed phases ------------------------------------------------------------------------------

  override think(dt: number): void {
    if (this.phase !== 'alive') return;
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.checkTorch();
    if (this.phase !== 'alive' || this.current === 'cleared') return;
    const host = this.env.host;
    const player = host.actors.player;
    const p = host.player.feet;
    const self = this.mover.feet;
    const dist = Math.hypot(p.x - self.x, p.z - self.z);
    let velocity = { x: 0, z: 0 };

    switch (this.current) {
      case 'dormant':
        if (dist <= SCARECROW.wakeRange && !player.dead) this.startLurch();
        break;
      case 'lurch': {
        this.faceTarget(self, p, dt);
        if (player.dead) break;
        if (dist <= SCARECROW.swingRange && this.cooldown <= 0) this.startWindup();
        else if (dist > SCARECROW.stopRange && dist > 1e-6) {
          velocity = { x: ((p.x - self.x) / dist) * SCARECROW.speed, z: ((p.z - self.z) / dist) * SCARECROW.speed };
        }
        break;
      }
      case 'windup':
        this.faceTarget(self, p, dt);
        if (this.stateTime >= SCARECROW.windupSeconds) this.enter('swing');
        break;
      case 'swing':
        if (this.stateTime >= SCARECROW.swingSeconds) {
          this.closeTelegraph(false);
          this.cooldown = 0.5;
          this.enter('recover');
        }
        break;
      case 'recover':
        if (this.stateTime >= SCARECROW.recoverSeconds) this.enter('lurch');
        break;
      case 'down':
        if (this.stateTime >= SCARECROW.knockdownSeconds) this.startLurch();
        break;
      case 'burning':
        if (this.stateTime >= SCARECROW.burnSeconds) this.clear('torch');
        break;
      default:
        break;
    }
    this.mover.move(velocity, dt);
  }

  override animate(dt: number): void {
    if (this.phase === 'gone') return;
    this.clock += dt;
    this.placeRoot(this.mover.feet);
    this.pose(dt);
    this.visual.root.updateMatrixWorld(true);
  }

  override render(alpha: number): void {
    if (this.phase === 'gone') return;
    this.mover.interpolatedFeet(alpha, this.tmp);
    this.placeRoot(this.tmp);
  }

  // ---- events --------------------------------------------------------------------------------------

  override damaged(result: DamageResultLike): void {
    if (this.phase !== 'alive' || result.outcome !== 'hit') return;
    if (this.current === 'cleared' || this.current === 'burning') return;
    if (result.attackId === SCARECROW.surgeId) {
      this.clear('surge');
      return;
    }
    this.knockDown();
  }

  /** actor.died is not expected (the damage clamp keeps it alive); a scripted kill still counts once. */
  override died(): void {
    if (this.phase !== 'alive') return;
    this.closeTelegraph(true);
    if (!this.clearedEmitted) this.emitCleared('strike');
    this.current = 'cleared';
    this.calm();
    super.died();
  }

  protected override onCleanup(): void {
    this.closeTelegraph(true);
    this.calm();
    this.mover.dispose();
  }

  protected override deathFadeSeconds(): number {
    return SCARECROW.clearFadeSeconds;
  }

  // ---- internals ------------------------------------------------------------------------------------

  private windowSource(): AttackWindowSource {
    const self = this;
    return {
      clipName: SCARECROW.clawId,
      start: 0.25,
      end: 0.75,
      currentTime: () => (self.current === 'swing' ? 0.5 : null),
      get swingId() {
        return self.swingSerial;
      },
    };
  }

  private enter(state: ScarecrowState): void {
    this.current = state;
    this.stateTime = 0;
  }

  private startLurch(): void {
    if (!this.aggroed) {
      this.aggroed = true;
      this.env.host.events.emit('ai.aggro', { actorId: this.actor.id, targetId: this.env.host.actors.player.id });
    }
    this.enter('lurch');
  }

  private startWindup(): void {
    this.swingSerial++;
    this.openTelegraph = this.swingSerial;
    this.enter('windup');
    this.env.host.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: 'block',
      attackId: SCARECROW.clawId,
      moveId: SCARECROW.clawId,
      swingId: this.swingSerial,
      leadSeconds: SCARECROW.windupSeconds,
    });
  }

  /** Ends the open telegraph; `cancelled` also announces it. */
  private closeTelegraph(cancelled: boolean): void {
    const swing = this.openTelegraph;
    this.openTelegraph = null;
    if (cancelled && swing !== null) {
      this.env.host.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId: swing });
    }
  }

  private knockDown(): void {
    if (this.current === 'down') return;
    this.closeTelegraph(true);
    this.enter('down');
  }

  private ignite(): void {
    if (this.current === 'burning' || this.current === 'cleared') return;
    this.closeTelegraph(true);
    this.enter('burning');
  }

  /** Clears the scarecrow exactly once: the event, then a dissolve and removal that count it as gone. */
  private clear(method: 'torch' | 'surge'): void {
    if (this.clearedEmitted || this.phase !== 'alive') return;
    this.closeTelegraph(true);
    this.emitCleared(method);
    this.enter('cleared');
    this.calm();
    // 'released' spends the slot, so a cleared scarecrow does not come back on reload.
    this.goneHow = 'released';
    this.disarm();
    this.startFade(SCARECROW.clearFadeSeconds);
  }

  private emitCleared(method: 'torch' | 'surge' | 'strike'): void {
    this.clearedEmitted = true;
    this.env.host.events.emit('scarecrow.cleared', { actorId: this.actor.id, scarecrowId: this.scarecrowId, method });
  }

  private calm(): void {
    if (!this.aggroed || this.calmed) return;
    this.calmed = true;
    this.env.host.events.emit('ai.calm', { actorId: this.actor.id });
  }

  /** The lit torch the player carries touching the scarecrow ignites it. */
  private checkTorch(): void {
    if (this.current === 'burning' || this.current === 'cleared') return;
    const torch = this.env.host.torch?.carried();
    if (!torch || !torch.lit) return;
    torch.position(this.torchAt);
    const self = this.mover.feet;
    const horizontal = Math.hypot(this.torchAt.x - self.x, this.torchAt.z - self.z);
    if (horizontal <= torch.radius + SCARECROW.contactRadius && Math.abs(this.torchAt.y - self.y) <= SCARECROW.contactHeight) {
      this.ignite();
    }
  }

  private faceTarget(self: THREE.Vector3, p: { x: number; z: number }, dt: number): void {
    this.yaw = turnToward(this.yaw, yawTo(self, p), SCARECROW.turnRate * dt);
  }

  private placeRoot(feet: THREE.Vector3): void {
    this.visual.root.position.copy(feet);
    this.visual.root.rotation.set(0, this.yaw, 0);
  }

  /** Procedural pose: the arm swing, the fall and the burn glow. */
  private pose(dt: number): void {
    const v = this.v;
    const t = this.stateTime;
    let arm = ARM_REST;
    switch (this.current) {
      case 'dormant':
        arm = 0.12 + 0.03 * Math.sin(this.clock * 1.3);
        break;
      case 'lurch':
        arm = ARM_REST + 0.25 * Math.sin(this.clock * 5);
        break;
      case 'windup': {
        const k = Math.min(1, t / SCARECROW.windupSeconds);
        arm = ARM_REST + (ARM_RAISED - ARM_REST) * (k * k * (3 - 2 * k));
        break;
      }
      case 'swing': {
        const k = Math.min(1, t / SCARECROW.swingSeconds);
        arm = ARM_RAISED + (ARM_STRUCK - ARM_RAISED) * k;
        break;
      }
      case 'recover': {
        const k = Math.min(1, t / SCARECROW.recoverSeconds);
        arm = ARM_STRUCK + (ARM_REST - ARM_STRUCK) * k;
        break;
      }
      case 'down':
        arm = 0.2;
        break;
      case 'burning':
      case 'cleared':
        arm = 1.6 + 0.5 * Math.sin(this.clock * 9);
        break;
    }
    v.armPivot.rotation.x = arm;

    const wantFall = this.current === 'down' ? FALL_ANGLE : 0;
    const step = 6 * dt;
    this.fall += Math.max(-step, Math.min(step, wantFall - this.fall));
    v.body.rotation.x = this.fall;
    v.body.rotation.z = this.current === 'burning' ? 0.08 * Math.sin(this.clock * 12) : 0;

    // Burn glow: emissive ramps to orange and the cloth chars over the burn.
    const burn = this.current === 'burning' ? Math.min(1, t / SCARECROW.burnSeconds) : this.current === 'cleared' ? 1 : 0;
    for (const g of v.glow) {
      g.material.emissive.copy(g.base).lerp(FLAME, burn);
      g.material.emissiveIntensity = burn > 0 ? 0.4 + 1.4 * burn * (0.85 + 0.15 * Math.sin(this.clock * 17)) : 1;
      g.material.color.copy(g.baseColor).lerp(CHAR, burn * 0.7);
    }
  }
}
