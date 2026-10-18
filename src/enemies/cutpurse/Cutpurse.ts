import { ENEMY_CLIPS } from '../clips';
import type { EventsPort, InventoryPort, StatePort, VfxLike } from '../ports';
import type { AiState, MoveDef } from '../types';
import { CUTPURSE_MOVES } from './def';
import { CUTPURSE, theftAmount } from './tuning';

/** What the controller asks of the Enemy that owns it. */
export interface CutpurseLink {
  readonly actorId: string;
  feet(): { x: number; y: number; z: number };
  /** Brain: run away now (the grab landed). */
  startFlee(): void;
  /** Plays a one-shot clip (the hand-to-belt telegraph). */
  playClip(clip: string, seconds: number): void;
  /** Hides or shows the model (the smoke puff). */
  setHidden(hidden: boolean): void;
  /** Removes the cutpurse from the world without any mercy exit (its gold, if any, is lost). */
  despawn(): void;
}

export interface CutpurseDeps {
  inventory(): InventoryPort | undefined;
  vfx(): VfxLike | undefined;
  events: EventsPort;
  state: StatePort;
  warn(message: string): void;
}

/** idle: not fleeing yet; smoke: the 0.4 s tell; hidden: inside the puff. */
type Phase = 'idle' | 'smoke' | 'hidden';

/**
 * The Alley Cutpurse's own rules (plans/slice-2-enemies.md 3.3), kept out of Brain and Enemy: the coin grab
 * through the inventory service, the pouch it carries, the flee window, the smoke bomb, and what happens to
 * the pouch when it is spared (returned exactly), killed (dropped as gold) or lost (despawned: gone).
 * `Enemy` owns one for a def with `thief: true` and feeds it the brain state each tick.
 */
export class Cutpurse {
  /** Gold taken and not yet returned or lost. */
  private held = 0;
  private phase: Phase = 'idle';
  private phaseTime = 0;
  private fleeTime = 0;
  private unseen = 0;
  private smokeUsed = false;
  private caughtSent = false;
  private warnedNoInventory = false;

  constructor(
    private readonly link: CutpurseLink,
    private readonly deps: CutpurseDeps,
  ) {}

  /** The pouch it holds. */
  get stolenGold(): number {
    return this.held;
  }

  /** True while the hand-to-belt telegraph runs: the thief stands still. */
  get holdStill(): boolean {
    return this.phase === 'smoke';
  }

  /** Inside the smoke puff (model hidden). */
  get hidden(): boolean {
    return this.phase === 'hidden';
  }

  /** A grab may start: the player has gold and this thief holds none. */
  canGrab(): boolean {
    const inv = this.deps.inventory();
    if (!inv) return false;
    return this.held === 0 && theftAmount(inv.gold) > 0;
  }

  /** The moves the brain may pick from: without gold to take, no grab (the thief just slashes). */
  availableMoves(moves: readonly MoveDef[]): readonly MoveDef[] {
    return this.canGrab() ? moves : moves.filter((m) => m.id !== CUTPURSE_MOVES.grab);
  }

  /**
   * The grab hit the player: takes `min(gold, 10% rounded up, 40)` through `takeGold(n, 'theft')`, keeps it and
   * starts the flee. Returns what was taken; 0 when it already holds a pouch or the player has nothing.
   */
  grabHit(): number {
    if (this.held > 0) return 0;
    const inv = this.deps.inventory();
    if (!inv) {
      if (!this.warnedNoInventory) {
        this.warnedNoInventory = true;
        this.deps.warn('enemies: the cutpurse grab needs the inventory service; nothing was stolen');
      }
      return 0;
    }
    const want = theftAmount(inv.gold);
    if (want <= 0) return 0;
    const taken = Math.floor(inv.takeGold(want, 'theft'));
    if (!(taken > 0)) return 0;
    this.held = taken;
    this.deps.events.emit('enemies.cutpurse.robbed', { actorId: this.link.actorId, amount: taken });
    this.link.startFlee();
    return taken;
  }

  /**
   * Staggered or cornered while fleeing: the smoke bomb is cancelled, the model shows again, and `caught` is sent
   * once. (The brain then yields, so Spare opens, or staggers when Spare is not unlocked.)
   */
  caught(_how: 'staggered' | 'cornered'): void {
    this.smokeUsed = true; // no second chance to vanish
    this.endSmoke();
    if (this.caughtSent) return;
    this.caughtSent = true;
    this.deps.events.emit('enemies.cutpurse.caught', { actorId: this.link.actorId, amount: this.held });
  }

  /** Each fixed tick while alive. `state` is the brain state; `visible` says the player can see the thief. */
  tick(dt: number, state: AiState, visible: boolean): void {
    if (!(dt > 0)) return;
    if (this.phase === 'smoke') {
      this.phaseTime += dt;
      if (this.phaseTime >= CUTPURSE.smokeTelegraphSeconds) this.hide();
      return;
    }
    if (this.phase === 'hidden') {
      this.phaseTime += dt;
      if (this.phaseTime >= CUTPURSE.smokeHiddenSeconds) this.blinkOut();
      return;
    }
    if (state !== 'flee') return;
    this.fleeTime += dt;
    this.unseen = visible ? 0 : this.unseen + dt;
    if (this.fleeTime >= CUTPURSE.fleeSeconds || this.unseen >= CUTPURSE.outOfSightSeconds) {
      this.link.despawn(); // the pouch is lost
      return;
    }
    if (!this.smokeUsed && this.fleeTime >= CUTPURSE.smokeAfterFleeSeconds) this.beginSmoke();
  }

  /** A status stun cancels the smoke tell (a thief in the puff already stays hidden). */
  stunned(): void {
    if (this.phase === 'smoke') this.endSmoke();
  }

  /** Killed: shows again and drops the pouch as gold (the player picks it up at once). */
  died(): void {
    this.endSmoke();
    const gold = this.held;
    this.held = 0;
    if (gold <= 0) return;
    const inv = this.deps.inventory();
    if (inv) inv.addGold(gold);
    else this.deps.warn(`enemies: the cutpurse died holding ${gold} gold but there is no inventory service`);
  }

  /** Spared: the exact pouch goes back, the flag is set, and it is sent off. Returns the gold returned. */
  spared(): number {
    this.endSmoke();
    const gold = this.held;
    this.held = 0;
    if (gold > 0) {
      const inv = this.deps.inventory();
      if (inv) inv.addGold(gold);
      else this.deps.warn(`enemies: a spared cutpurse held ${gold} gold but there is no inventory service`);
    }
    this.deps.state.setFlag(CUTPURSE.sparedFlag, true);
    return gold;
  }

  /** The spare was revoked (the thief was struck down on its way out): the mercy did not happen, the flag goes. */
  spareRevoked(): void {
    this.deps.state.setFlag(CUTPURSE.sparedFlag, false);
  }

  // ---- smoke ---------------------------------------------------------------------------------------

  private beginSmoke(): void {
    this.smokeUsed = true;
    this.phase = 'smoke';
    this.phaseTime = 0;
    this.link.playClip(ENEMY_CLIPS.useItem, CUTPURSE.smokeTelegraphSeconds);
    this.deps.events.emit('telegraph', {
      actorId: this.link.actorId,
      kind: 'block',
      attackId: ENEMY_CLIPS.useItem,
      moveId: CUTPURSE_MOVES.smoke,
      swingId: -1,
      leadSeconds: CUTPURSE.smokeTelegraphSeconds,
    });
  }

  private hide(): void {
    this.phase = 'hidden';
    this.phaseTime = 0;
    this.puff();
    this.link.setHidden(true);
  }

  private blinkOut(): void {
    this.phase = 'idle';
    this.puff();
    this.link.despawn(); // unless caught, the pouch is lost
  }

  private endSmoke(): void {
    if (this.phase === 'smoke') this.deps.events.emit('telegraph.cancelled', { actorId: this.link.actorId, swingId: -1 });
    if (this.phase === 'hidden') this.puff();
    if (this.phase !== 'idle') this.link.setHidden(false);
    this.phase = 'idle';
    this.phaseTime = 0;
  }

  private puff(): void {
    const at = this.link.feet();
    this.deps.vfx()?.spawnEffect?.('smoke-puff', { position: { x: at.x, y: at.y, z: at.z } });
  }
}
