// Act 4 L4 (plans/act4-L4.md sections 1.1, 1.3, 1.4): the people of one escort. Each is an ally-team actor with
// hurtboxes (the militia pattern of src/waves/defenders.ts) that walks where the run places it. Nobody dies:
//   - any hostile hit kneels a member, and lethal damage is floored at 1 HP (it kneels too);
//   - a kneeling member rises once no standing hostile is within ESCORT_KNEEL_CLEAR_RADIUS (8 m). Standing means alive,
//     not dead and not mercied (`groupStanding.isMercied`): a spared foe walking off counts as gone, a yielding one that
//     is not yet spared still stands;
//   - while up, each member is a taunter (the shipped `enemies.taunts` registry, the Iron Familiar's hook), so hostiles
//     that come within THREAT_RADIUS go for it instead of Cael; a kneeling member is no longer a taunter, so they turn
//     back to Cael, who must clear them.
// A `fighter` (Rook, the watch, the delegations' guards) also swings like the militia: only at a hostile already fighting
// Cael or an ally and in no mercy state, never the killing blow.
import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import type { GameContext } from '../core/Game';
import { HurtboxSet } from '../combat/HurtboxSet';
import { KNIGHT_HURTBOX_DEFS } from '../combat/hurtboxLayout';
import type { HurtboxDef } from '../combat/types';
import { EnemyAnimator } from '../enemies/EnemyAnimator';
import { ENEMY_CLIPS } from '../enemies/clips';
import { prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../npcs/types';
import type { EscortPose } from './EscortRun';

export const ESCORT_MEMBER = {
  /** Rise when no standing hostile is this close to the kneeling member (contracts v0.8 ESCORT_KNEEL_CLEAR_RADIUS). */
  clearRadius: 8,
  /** How often a kneeling member checks the clear rule. */
  clearCheckSeconds: 0.25,
  /** A hostile this close to a standing member is drawn to it (the taunt radius). */
  threatRadius: 4,
  maxHealth: 120,
  /** The fighter's swing, the militia's numbers. */
  swingRange: 2.5,
  swingDamage: 6,
  swingCooldown: 1.6,
  swingScanSeconds: 0.25,
  swingAttackId: 'escort.ally-swing',
  hurtRadius: 0.45,
  lethalHandlerId: 'escort.member-floor',
  noKillHandlerId: 'escort.member-no-kill',
  kind: 'escort-member',
} as const;

export type EscortRole = 'walker' | 'fighter';
export type EscortMemberState = 'up' | 'kneeling';
export type EscortBodyAnim = 'idle' | 'walk' | 'kneel' | 'rise' | 'swing';

/** A member's body behind a port, so tests need no model. */
export interface EscortBody {
  root: THREE.Object3D;
  hurtboxDefs: HurtboxDef[];
  play(anim: EscortBodyAnim): void;
  update(dt: number): void;
  dispose(): void;
}

export type EscortBodyFactory = () => EscortBody;

/** A capsule and a nose: headless runs and before the model has loaded. Kneeling lowers it. */
export function placeholderEscortBody(color = 0x9a8a6a): EscortBody {
  const root = new THREE.Group();
  root.name = 'escort-placeholder';
  const mat = new THREE.MeshStandardMaterial({ color });
  const geo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
  const body = new THREE.Mesh(geo, mat);
  body.name = 'escort-torso';
  body.position.y = 0.9;
  root.add(body);
  return {
    root,
    hurtboxDefs: [{ name: 'torso', bone: 'escort-torso', start: { x: 0, y: -0.4, z: 0 }, end: { x: 0, y: 0.4, z: 0 }, radius: ESCORT_MEMBER.hurtRadius }],
    play(a) {
      body.position.y = a === 'kneel' ? 0.5 : 0.9;
    },
    update() {},
    dispose() {
      root.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}

const SWING_CLIP = '1H_Melee_Attack_Slice_Horizontal';

/** The NPC's own model on the KayKit rig, or the placeholder when it is not loaded (headless, or still loading). */
export function npcEscortBodyFactory(loader: NpcModelLoader | null, npcDef: NpcDef, decorate?: (model: THREE.Object3D) => void): EscortBodyFactory {
  return () => {
    if (!loader) return placeholderEscortBody(npcDef.tint ?? undefined);
    try {
      const { model, clips } = prepareNpcModel(loader, npcDef);
      decorate?.(model);
      const root = new THREE.Group();
      root.name = `escort-${npcDef.id}`;
      root.add(model);
      const animator = new EnemyAnimator(root, clips, { warn: (m) => console.warn(`[escort] ${m}`) });
      animator.play(ENEMY_CLIPS.idle, { loop: true, fade: 0 });
      const owned = new Set<THREE.Material>();
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) owned.add(mm);
      });
      let current: EscortBodyAnim = 'idle';
      const self: EscortBody = {
        root,
        hurtboxDefs: KNIGHT_HURTBOX_DEFS,
        play(a) {
          if (a === current && a !== 'swing') return;
          current = a;
          if (a === 'idle') animator.play(ENEMY_CLIPS.idle, { loop: true });
          else if (a === 'walk') animator.play(ENEMY_CLIPS.walk, { loop: true });
          else if (a === 'kneel') animator.play(ENEMY_CLIPS.kneel);
          else if (a === 'rise') animator.play(ENEMY_CLIPS.rise);
          else animator.play(SWING_CLIP);
        },
        update(dt) {
          animator.fixedUpdate(dt);
        },
        dispose() {
          animator.dispose();
          root.removeFromParent();
          owned.forEach((m) => m.dispose());
        },
      };
      animator.onClipEnd = (clip, interrupted) => {
        if (interrupted) return;
        if (clip === ENEMY_CLIPS.kneel && current === 'kneel') animator.play(ENEMY_CLIPS.kneelIdle, { loop: true });
        if ((clip === ENEMY_CLIPS.rise || clip === SWING_CLIP) && (current === 'rise' || current === 'swing')) self.play('idle');
      };
      return self;
    } catch {
      return placeholderEscortBody(npcDef.tint ?? undefined);
    }
  };
}

export type EscortMemberHost = Pick<GameContext, 'scene' | 'actors' | 'combat' | 'damage' | 'events' | 'services'>;

export interface EscortMemberSpec {
  id: string;
  role: EscortRole;
  makeBody: EscortBodyFactory;
}

/** One escorted person. */
export class EscortMember {
  readonly actor: Actor;
  private readonly hurtboxes: HurtboxSet;
  private readonly body: EscortBody;
  private readonly removers: Array<() => void> = [];
  private _state: EscortMemberState = 'up';
  private walking = false;
  private cooldown = 0;
  private scan = 0;

  constructor(
    private readonly host: EscortMemberHost,
    readonly spec: EscortMemberSpec,
    at: EscortPose,
  ) {
    this.body = spec.makeBody();
    const root = this.body.root;
    host.scene.add(root);
    root.position.set(at.x, at.y, at.z);
    root.rotation.set(0, at.yaw, 0);
    root.updateMatrixWorld(true);
    let hurtboxes: HurtboxSet | null = null;
    let actor: Actor | null = null;
    try {
      hurtboxes = new HurtboxSet(root, this.body.hurtboxDefs, root);
      // Untargetable for lock-on and AI picks (a taunt still draws hostiles to it); a tracer that overlaps it hits it.
      actor = host.actors.spawn({ kind: ESCORT_MEMBER.kind, team: 'ally', maxHealth: ESCORT_MEMBER.maxHealth, maxPoise: 0, root, owner: root, untargetable: true });
      actor.data['escortMember'] = spec.id;
      this.removers.push(host.combat.addTarget(hurtboxes, actor.id));
    } catch (err) {
      for (const r of this.removers.splice(0)) r();
      if (actor) host.actors.despawn(actor.id);
      hurtboxes?.dispose();
      this.body.dispose();
      throw err;
    }
    this.hurtboxes = hurtboxes;
    this.actor = actor;
  }

  get id(): ActorId {
    return this.actor.id;
  }

  get state(): EscortMemberState {
    return this._state;
  }

  get kneeling(): boolean {
    return this._state === 'kneeling';
  }

  get position(): THREE.Vector3 {
    return this.body.root.position;
  }

  kneel(): void {
    if (this._state === 'kneeling') return;
    this._state = 'kneeling';
    this.body.play('kneel');
  }

  rise(): void {
    if (this._state === 'up') return;
    this._state = 'up';
    if (this.actor.dead) this.host.damage.revive(this.actor.id, 1, 'script');
    this.actor.health = this.actor.maxHealth;
    this.body.play('rise');
  }

  /** Stands at `p` facing its yaw; `moving` picks the walk or idle clip (a kneeling member stays where it knelt). */
  place(p: EscortPose, moving: boolean): void {
    if (this._state === 'kneeling') return;
    const root = this.body.root;
    root.position.set(p.x, p.y, p.z);
    root.rotation.set(0, p.yaw, 0);
    if (moving !== this.walking) {
      this.walking = moving;
      this.body.play(moving ? 'walk' : 'idle');
    }
  }

  fixedUpdate(dt: number): void {
    this.body.update(dt);
    this.body.root.updateMatrixWorld(true);
    if (this.spec.role !== 'fighter' || this._state !== 'up') return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.scan -= dt;
    if (this.scan > 0 || this.cooldown > 0) return;
    this.scan = ESCORT_MEMBER.swingScanSeconds;
    this.swing();
  }

  dispose(): void {
    for (const r of this.removers.splice(0)) {
      try {
        r();
      } catch {
        // gone with the actor
      }
    }
    this.host.actors.despawn(this.actor.id);
    this.hurtboxes.dispose();
    this.body.dispose();
  }

  private swing(): void {
    const engage = this.host.services.get('allyEngagement');
    if (!engage) return;
    const here = this.body.root.position;
    let best: Actor | null = null;
    let bestD: number = ESCORT_MEMBER.swingRange;
    const p = new THREE.Vector3();
    for (const a of this.host.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.root) continue;
      a.root.getWorldPosition(p);
      const d = Math.hypot(p.x - here.x, p.z - here.z);
      if (d <= bestD && engage.mayEngage(a.id)) {
        best = a;
        bestD = d;
      }
    }
    if (!best) return;
    const amount = Math.min(ESCORT_MEMBER.swingDamage, best.health - 1);
    if (!(amount > 0)) return;
    this.cooldown = ESCORT_MEMBER.swingCooldown;
    this.walking = false;
    this.body.play('swing');
    this.host.damage.apply({ attackerId: this.actor.id, targetId: best.id, amount, poise: 0, kind: 'melee', attackId: ESCORT_MEMBER.swingAttackId });
  }
}

/** The members of the running escort, their never-die handlers, the kneel and rise rules and their taunts. */
export class EscortMembers {
  private readonly list: EscortMember[] = [];
  private readonly byActor = new Map<ActorId, EscortMember>();
  private readonly offs: Array<() => void> = [];
  private readonly untaunt = new Map<ActorId, () => void>();
  private clearClock = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly host: EscortMemberHost) {}

  get all(): readonly EscortMember[] {
    return this.list;
  }

  /** Any member kneeling (the run's `down`). */
  get anyDown(): boolean {
    return this.list.some((m) => m.kneeling);
  }

  build(specs: readonly EscortMemberSpec[], poses: readonly EscortPose[]): void {
    this.despawnAll();
    specs.forEach((spec, i) => {
      try {
        const m = new EscortMember(this.host, spec, poses[i] ?? poses[poses.length - 1]);
        this.list.push(m);
        this.byActor.set(m.id, m);
      } catch (err) {
        console.warn(`[escort] could not build member "${spec.id}": ${String(err)}`);
      }
    });
    if (this.list.length === 0) return;
    const d = this.host.damage;
    // Never dies: 1 HP and a kneel.
    this.offs.push(
      d.addLethalHandler(ESCORT_MEMBER.lethalHandlerId, (target) => {
        const m = this.byActor.get(target.id);
        if (!m) return false;
        target.health = Math.min(1, target.maxHealth);
        m.kneel();
        return true;
      }),
    );
    // A fighter's swing never kills: credit, XP and mercy stay with the player.
    this.offs.push(
      d.addLethalHandler(
        ESCORT_MEMBER.noKillHandlerId,
        (target, r) => {
          if (!r.attackerId || !this.byActor.has(r.attackerId) || this.byActor.has(target.id)) return false;
          target.health = Math.min(1, target.maxHealth);
          return true;
        },
        -1,
      ),
    );
    // Any hostile hit kneels.
    this.offs.push(
      this.host.events.on('damage.dealt', (r) => {
        if (r.outcome !== 'hit') return;
        const m = this.byActor.get(r.targetId);
        if (!m) return;
        const attacker = r.attackerId ? this.host.actors.get(r.attackerId) : undefined;
        if (attacker?.team !== 'hostile') return;
        m.kneel();
      }),
    );
    this.syncTaunts();
  }

  /** Places each standing member at its pose (kneeling ones stay put). */
  place(poses: readonly EscortPose[], moving: boolean): void {
    this.list.forEach((m, i) => {
      const p = poses[i];
      if (p) m.place(p, moving);
    });
  }

  /** Stands everyone up at full health (a load, a restart). */
  riseAll(): void {
    for (const m of this.list) m.rise();
    this.syncTaunts();
  }

  fixedUpdate(dt: number): void {
    for (const m of this.list) m.fixedUpdate(dt);
    this.syncTaunts();
    if (!this.anyDown) {
      this.clearClock = 0;
      return;
    }
    this.clearClock -= dt;
    if (this.clearClock > 0) return;
    this.clearClock = ESCORT_MEMBER.clearCheckSeconds;
    let rose = false;
    for (const m of this.list) {
      if (m.kneeling && !this.hostileNear(m.position, ESCORT_MEMBER.clearRadius)) {
        m.rise();
        rose = true;
      }
    }
    if (rose) this.syncTaunts();
  }

  /** True when a standing hostile (alive, not mercied) is within `radius` m (horizontal) of `at`. */
  hostileNear(at: { x: number; z: number }, radius: number): boolean {
    const gs = this.host.services.get('groupStanding');
    for (const a of this.host.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.root) continue;
      if (gs?.isMercied(a.id)) continue;
      a.root.getWorldPosition(this.tmp);
      if (Math.hypot(this.tmp.x - at.x, this.tmp.z - at.z) <= radius) return true;
    }
    return false;
  }

  despawnAll(): void {
    for (const off of this.untaunt.values()) off();
    this.untaunt.clear();
    for (const off of this.offs.splice(0)) off();
    for (const m of this.list) m.dispose();
    this.list.length = 0;
    this.byActor.clear();
    this.clearClock = 0;
  }

  /** Standing members are taunters, kneeling ones are not. */
  private syncTaunts(): void {
    const taunts = this.host.services.get('enemies')?.taunts;
    if (!taunts) return;
    for (const m of this.list) {
      const has = this.untaunt.has(m.id);
      if (m.kneeling && has) {
        this.untaunt.get(m.id)!();
        this.untaunt.delete(m.id);
      } else if (!m.kneeling && !has) {
        this.untaunt.set(
          m.id,
          taunts.register({
            id: m.id,
            position: () => m.position,
            alive: () => !m.kneeling && !m.actor.dead,
            radius: ESCORT_MEMBER.threatRadius,
            seconds: Number.POSITIVE_INFINITY,
          }),
        );
      }
    }
  }
}
