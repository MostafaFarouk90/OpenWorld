import type { ActorId } from '../ports';
import type { AiState } from '../types';
import { Foe } from './Foe';
import { BLOOM } from './tuning';
import type { FoeEnd, FoeEnv, FoeSpawnInfo } from './types';
import { buildBloomVisual, type BloomVisual } from './visuals';

const PETAL_CLOSED = 0.25;
const PETAL_OPEN = 1.15;
const TELEGRAPH_ID = 'blightbloom.open';

/**
 * The vault's Blightbloom: stationary, no poise. Every 8 s while the player is within 25 m and fewer
 * than 3 of its wraiths live it opens (1 s telegraph) and raises one ash wraith at the nearest unspent,
 * unoccupied pile within 10 m. Two regular hits, or any fire, the torch or the Surge, destroy it.
 */
export class Blightbloom extends Foe {
  private readonly v: BloomVisual;
  private readonly torchAt = { x: 0, y: 0, z: 0 };
  /** Live wraiths this bloom raised, by actor id, with the pile each rose from. */
  private readonly raised = new Map<ActorId, string>();
  /** Piles with a wraith alive or being raised right now. */
  private readonly occupied = new Set<string>();
  private timer = 0;
  private opening: { left: number; pile: string } | null = null;
  private swingSerial = 0;
  private open = 0;
  private puffLeft = 0;
  private clock = 0;
  private warnedNoPile = false;

  constructor(env: FoeEnv, info: FoeSpawnInfo) {
    const visual = buildBloomVisual(info.slug);
    super(env, info, visual);
    this.v = visual;
  }

  /** Live wraiths raised from this bloom. */
  get liveWraiths(): number {
    let n = 0;
    for (const id of this.raised.keys()) if (this.env.host.actors.get(id)?.dead === false) n++;
    return n;
  }

  get isOpening(): boolean {
    return this.opening !== null;
  }

  /** The piles currently holding a wraith of this bloom. */
  occupiedPiles(): string[] {
    return [...this.occupied];
  }

  protected override aiState(): AiState {
    return this.opening ? 'telegraph' : 'idle';
  }

  override think(dt: number): void {
    if (this.phase !== 'alive') return;
    this.checkTorch();
    if (this.phase !== 'alive') return;
    const host = this.env.host;
    if (this.opening) {
      // The 8 s cadence runs start to start: the opening counts towards the next interval.
      this.timer += dt;
      this.opening.left -= dt;
      if (this.opening.left <= 0) this.finishOpening();
      return;
    }
    const player = host.actors.player;
    const near = !player.dead && this.distanceTo(host.player.feet) <= BLOOM.playerRange;
    if (!near || this.liveWraiths >= BLOOM.maxWraiths) return;
    this.timer += dt;
    if (this.timer < BLOOM.castInterval) return;
    const pile = this.nearestFreePile();
    if (!pile) {
      // Nothing to raise from: stay closed and look again next interval.
      this.timer = 0;
      return;
    }
    this.timer = 0;
    this.startOpening(pile);
  }

  override animate(dt: number): void {
    if (this.phase === 'gone') return;
    this.clock += dt;
    const target = this.opening ? 1 : 0;
    this.open += Math.max(-dt * 3, Math.min(dt * 3, target - this.open));
    const tilt = PETAL_CLOSED + (PETAL_OPEN - PETAL_CLOSED) * this.open;
    for (const hinge of this.v.petals) {
      hinge.rotation.x = tilt;
      hinge.scale.setScalar(1 + 0.35 * this.open);
    }
    // Emissive pulse, brighter while opening.
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 3);
    this.v.coreMaterial.emissiveIntensity = 0.35 + 0.5 * pulse + 0.8 * this.open;
    this.v.petalMaterial.emissiveIntensity = 0.25 + 0.3 * pulse + 0.5 * this.open;
    if (this.puffLeft > 0) {
      this.puffLeft = Math.max(0, this.puffLeft - dt);
      const k = 1 - this.puffLeft / BLOOM.puffSeconds;
      this.v.puff.visible = this.puffLeft > 0;
      this.v.puff.scale.setScalar(0.4 + 2.6 * k);
      this.v.puffMaterial.opacity = 0.55 * (1 - k);
    }
    this.visual.root.updateMatrixWorld(true);
  }

  /** Any hit that lands: two regular hits, or one fire hit, destroy it (see the foe manager's damage modifier). */
  protected override deathFadeSeconds(): number {
    return BLOOM.fadeSeconds;
  }

  override died(): void {
    if (this.phase !== 'alive') return;
    this.cancelOpening();
    super.died();
  }

  protected override onCleanup(): void {
    this.cancelOpening();
  }

  // ---- internals ------------------------------------------------------------------------------------

  private startOpening(pile: string): void {
    this.swingSerial++;
    this.opening = { left: BLOOM.openSeconds, pile };
    this.occupied.add(pile);
    this.env.host.events.emit('telegraph', {
      actorId: this.actor.id,
      kind: 'dodge',
      attackId: TELEGRAPH_ID,
      moveId: TELEGRAPH_ID,
      swingId: this.swingSerial,
      leadSeconds: BLOOM.openSeconds,
    });
  }

  /** The bloom died or was removed mid-opening: the reserved pile is free again and nothing rises. */
  private cancelOpening(): void {
    const o = this.opening;
    if (!o) return;
    this.opening = null;
    this.occupied.delete(o.pile);
    this.env.host.events.emit('telegraph.cancelled', { actorId: this.actor.id, swingId: this.swingSerial });
  }

  private finishOpening(): void {
    const o = this.opening!;
    this.opening = null;
    this.puffLeft = BLOOM.puffSeconds;
    this.v.puff.visible = true;
    const env = this.env;
    const anchor = env.host.anchors.find(o.pile);
    // A pile spent in the meantime (it cannot be, but a load may have changed it) is not used.
    if (!anchor || env.isPileSpent(o.pile)) {
      this.occupied.delete(o.pile);
      return;
    }
    const pile = o.pile;
    const early: { id: ActorId | null; ended: FoeEnd | null } = { id: null, ended: null };
    early.id = env.raiseWraith({
      feet: { ...anchor.position },
      yaw: anchor.yaw,
      spawnerId: this.spawnerId ?? this.info.slug,
      spawnTag: this.info.spawnTag,
      level: this.info.level,
      // Independent of this bloom: a Release after the bloom is destroyed still spends the pile.
      onReleased: () => this.env.markPileSpent(pile),
      onReleaseRevoked: () => this.env.unmarkPileSpent(pile),
      onGone: (how) => {
        if (early.id === null) {
          early.ended = how;
          return;
        }
        this.wraithGone(early.id, pile, how);
      },
    });
    const wraithId = early.id;
    if (wraithId === null) {
      this.occupied.delete(pile);
      env.host.warn(`enemies: bloom ${this.actor.id} could not raise a wraith at ${pile}`);
      return;
    }
    if (early.ended !== null) {
      this.wraithGone(wraithId, pile, early.ended);
      return;
    }
    this.raised.set(wraithId, pile);
  }

  private wraithGone(id: ActorId, pile: string, how: FoeEnd): void {
    this.raised.delete(id);
    this.occupied.delete(pile);
    if (how === 'released') this.env.markPileSpent(pile);
  }

  private nearestFreePile(): string | null {
    const host = this.env.host;
    const self = this.visual.root.position;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of this.info.piles) {
      if (this.occupied.has(id) || this.env.isPileSpent(id)) continue;
      const a = host.anchors.find(id);
      if (!a) {
        if (!this.warnedNoPile) {
          this.warnedNoPile = true;
          host.warn(`enemies: bloom pile anchor '${id}' not found; skipped`);
        }
        continue;
      }
      const d = Math.hypot(a.position.x - self.x, a.position.z - self.z);
      if (d <= BLOOM.pileRange && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  /** The carried torch touching the bloom destroys it (through the normal death path). */
  private checkTorch(): void {
    const torch = this.env.host.torch?.carried();
    if (!torch || !torch.lit) return;
    torch.position(this.torchAt);
    const self = this.visual.root.position;
    if (
      Math.hypot(this.torchAt.x - self.x, this.torchAt.z - self.z) <= torch.radius + BLOOM.contactRadius &&
      Math.abs(this.torchAt.y - self.y) <= BLOOM.contactHeight
    ) {
      this.destroy();
    }
  }

  /** Kills the bloom with `damage.kill` so `actor.died` fires; without it, removes it as a death. */
  private destroy(): void {
    const host = this.env.host;
    if (host.damage.kill) host.damage.kill(this.actor.id, host.actors.player.id);
    else this.died();
  }
}
