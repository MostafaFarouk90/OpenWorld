// R02's blocking dummies (slice 2 thread 10). They swing for real damage, so they stand only while R02 is active: in
// the Practice Yard, or in the Halvard Bastion yard once Stane has moved there (from M06 on, the density pass).
// Derived from quest state like PostDirector: dirty on any quest change or load, applied on the next rules tick,
// retried while the dummies service is not wired yet.
import type { BlockingDummyHandle } from '../world/BlockingDummies';
import type { DummySpot } from '../world/TrainingDummies';

export const R02_DUMMY_ANCHORS = ['yard.blocking-dummy-1', 'yard.blocking-dummy-2', 'yard.blocking-dummy-3'] as const;
export const R02_BASTION_DUMMY_ANCHORS = ['bastion.r02.dummy-1', 'bastion.r02.dummy-2', 'bastion.r02.dummy-3'] as const;

export interface R02YardDummies {
  placeBlocking(spots: readonly DummySpot[]): BlockingDummyHandle[];
  disposeBlocking?(): void;
}

export interface R02YardDeps {
  active(): boolean;
  /** true once R02 runs in the Bastion yard (absent: always the Practice Yard) */
  atBastion?(): boolean;
  /** null when the anchor is missing */
  spot(anchorId: string): DummySpot | null;
  dummies(): R02YardDummies | undefined;
  warn(message: string): void;
}

export class R02Yard {
  private dirty = true;
  private placed = false;
  /** where the standing dummies are (meaningful while placed) */
  private placedBastion = false;
  private warned = false;

  constructor(private readonly deps: R02YardDeps) {}

  markDirty(): void { this.dirty = true; }

  get standing(): boolean { return this.placed; }

  update(): void {
    if (!this.dirty) return;
    const want = this.deps.active();
    const bastion = this.deps.atBastion?.() ?? false;
    if (want === this.placed && (!want || bastion === this.placedBastion)) { this.dirty = false; return; }
    const dummies = this.deps.dummies();
    if (!dummies) return; // not provided yet: retry next tick
    if (!want) {
      this.remove(dummies);
      this.dirty = false;
      return;
    }
    // placing replaces whatever stood before, so a move between the yards is one call
    const spots: DummySpot[] = [];
    for (const id of bastion ? R02_BASTION_DUMMY_ANCHORS : R02_DUMMY_ANCHORS) {
      const s = this.deps.spot(id);
      if (s) spots.push(s);
      else this.warnOnce(`r02 yard: anchor ${id} is missing`);
    }
    if (spots.length === 0) { this.dirty = false; return; }
    // [] means the game is not wired yet (placeBlocking warns): stay dirty and retry.
    if (dummies.placeBlocking(spots).length > 0) {
      this.placed = true;
      this.placedBastion = bastion;
      this.dirty = false;
    }
  }

  dispose(): void {
    const dummies = this.deps.dummies();
    if (this.placed && dummies) this.remove(dummies);
    this.placed = false;
  }

  private remove(dummies: R02YardDummies): void {
    if (dummies.disposeBlocking) dummies.disposeBlocking();
    else dummies.placeBlocking([]);
    this.placed = false;
  }

  private warnOnce(m: string): void {
    if (this.warned) return;
    this.warned = true;
    this.deps.warn(m);
  }
}
