import { HATHRENS_MERE, GREYFEN_WATER_TABLE } from '../../../terrain/shape/greyfen';
import type { PathPoint } from '../large/flightPath';
import type { HathrenCalmOutcome, HathrenPlayback } from './events';
import { HathrenScene, type HathrenPlace, type HathrenScenePorts } from './scene';
import { HATHREN, HathrenSequence, type HathrenBeat, type HathrenState } from './sequence';

/** Ids Hathren reads (K3's anchors, K12's flags). K12 is the only writer of the `story.m26.*` flags. */
export const HATHREN_IDS = {
  quest: 'm26',
  completeFlag: 'story.m26.complete',
  /** K12 writes it true when net n (1..4) is cut. */
  netFlag: (n: number) => `story.m26.net.${n}`,
  /** K12 writes it true once the warmth rite is paid: a load restarts the calm, never the rite. */
  riteFlag: 'story.m26.riteDone',
  shoreAnchor: 'greyfen.mere.shore',
  netAnchor: (n: number) => `greyfen.mere.net.${n}`,
  scaleBedAnchor: 'greyfen.m26.scale-bed',
  scaleItem: 'hathrens-scale',
  codexId: 'hathren',
} as const;

/** Her loop centre: at least this far out from the shore point, toward the Mere's centre, and in water this deep. */
export const HATHREN_PLACE = { offshore: 55, minDepth: 2.2, searchStep: 10, searchMax: 200 } as const;

/** While she waits unwoken in the nets and the player is further than this from the shore, her rig is not stepped. */
export const HATHREN_IDLE_RADIUS = 400;

export interface HathrenDirectorPorts extends HathrenScenePorts {
  questState(id: string): string | undefined;
  getBool(key: string): boolean;
  /** The player's feet (world). */
  playerFeet(): PathPoint;
  anchor(id: string): PathPoint | undefined;
  heightAt(x: number, z: number): number;
  /** True once the player holds Hathren's Scale (hides the glint). */
  holdsScale(): boolean;
  emit(beat: HathrenBeat): void;
  unlockCodex(id: string): void;
  warn(message: string): void;
}

/**
 * Runs Hathren's set piece in the world (plans/act3-K6a.md 2): derives her presence from the quest and K12's flags every
 * tick and on load, builds and tears down the scene, routes K12's calls, and emits the beats. Never saved: a load always
 * re-derives (back to the nets), which is the brief's "restart from the nets" rule.
 */
export class HathrenDirector {
  readonly seq = new HathrenSequence();
  private scene: HathrenScene | null = null;
  private place: HathrenPlace | null = null;
  private glint: HathrenScene['glint'] | null = null;
  private playback: { handle: HathrenPlayback; resolve: (o: HathrenCalmOutcome) => void } | null = null;
  private warned = false;
  private posed = false;

  constructor(private readonly ports: HathrenDirectorPorts) {}

  get state(): HathrenState {
    return this.seq.state;
  }

  get current(): HathrenScene | null {
    return this.scene;
  }

  /** M26 is active and not complete. */
  wanted(): boolean {
    return this.ports.questState(HATHREN_IDS.quest) === 'active' && !this.ports.getBool(HATHREN_IDS.completeFlag);
  }

  /** The nets K12 saved as cut. */
  savedCuts(): number[] {
    const out: number[] = [];
    for (let n = 1; n <= HATHREN.nets; n++) if (this.ports.getBool(HATHREN_IDS.netFlag(n))) out.push(n);
    return out;
  }

  /** Presence from the quest and the flags. Cheap; called every tick. */
  derive(): void {
    const want = this.wanted();
    const st = this.seq.state;
    if (!want) {
      // Calming plays out even if K12 completes the quest mid-sequence; anything else leaves.
      if (st === 'nets') this.clear();
      else if (st === 'gone' && !this.scene) this.seq.reset();
      return;
    }
    if (st === 'absent') {
      if (!this.build()) return;
      this.seq.enterNets(this.savedCuts());
    } else if (st === 'nets') {
      // A flag written by K12 without the live call still drops its net.
      for (const n of this.savedCuts()) this.seq.netCut(n);
    }
    // The rite is paid (K12's flag): the calm plays, also after a load, without K12 charging it again.
    if (this.seq.state === 'nets' && this.ports.getBool(HATHREN_IDS.riteFlag)) this.startCalm();
  }

  /**
   * `save.loaded`: drop whatever was playing (no beats) and re-derive from the saved quest and flags. A calm K12 is
   * awaiting keeps its promise when the re-derive restarts the calm (rite paid); otherwise it settles 'cancelled'.
   */
  onLoaded(): void {
    const held = this.playback;
    this.playback = null;
    this.clear();
    this.glint?.dispose();
    this.glint = null;
    this.playback = held;
    this.derive();
    if (this.seq.state !== 'calming') this.settle('cancelled');
  }

  netCut(n: number): boolean {
    if (this.seq.state !== 'nets') return false;
    return this.seq.netCut(n);
  }

  calm(): HathrenPlayback | null {
    if (this.seq.state === 'gone') return null;
    return this.startCalm();
  }

  dismiss(): void {
    this.seq.dismiss();
    this.teardownScene();
    this.settle('cancelled');
  }

  /** Starts the calm (or returns the running one's playback). */
  private startCalm(): HathrenPlayback | null {
    if (this.seq.state !== 'calming') {
      if (this.seq.state === 'gone') return null;
      if (!this.scene && !this.build()) return null;
      if (!this.seq.calm()) return null;
    }
    if (!this.playback) {
      let resolve!: (o: HathrenCalmOutcome) => void;
      const done = new Promise<HathrenCalmOutcome>((r) => (resolve = r));
      this.playback = { handle: { done, skip: () => this.skip() }, resolve };
    }
    return this.playback.handle;
  }

  private settle(outcome: HathrenCalmOutcome): void {
    const p = this.playback;
    this.playback = null;
    p?.resolve(outcome);
  }

  /** One fixed tick. */
  tick(dt: number): void {
    this.derive();
    if (this.seq.state === 'nets' && this.place) {
      const f = this.ports.playerFeet();
      this.seq.playerDistance(Math.hypot(f.x - this.place.shore.x, f.z - this.place.shore.z));
    }
    const beats = this.seq.step(dt);
    this.fire(beats);
    // Always the first step after a build, so the rig is posed (under the water) before it idles.
    if (this.scene && !this.scene.disposedYet && (!this.posed || !this.idle())) {
      this.scene.update(dt, this.seq);
      this.posed = true;
    }
    this.updateGlint(dt);
  }

  /** Unwoken in the nets with the player far from the shore: nothing to see, the rig is not stepped. */
  private idle(): boolean {
    if (this.seq.state !== 'nets' || this.seq.phase !== 'waiting' || !this.place) return false;
    const f = this.ports.playerFeet();
    return Math.hypot(f.x - this.place.shore.x, f.z - this.place.shore.z) > HATHREN_IDLE_RADIUS;
  }

  /** Teardown (plugin dispose). */
  dispose(): void {
    this.clear();
    this.glint?.dispose();
    this.glint = null;
  }

  private skip(): void {
    if (this.seq.state !== 'calming') return;
    this.fire(this.seq.skip());
  }

  private fire(beats: readonly HathrenBeat[]): void {
    for (const b of beats) {
      this.scene?.onBeat(b);
      if (b === 'quiet') this.ports.unlockCodex(HATHREN_IDS.codexId);
      try {
        this.ports.emit(b);
      } catch (err) {
        this.ports.warn(`a wyrm.hathren listener threw (${String(err)})`);
      }
      if (b === 'gone') this.finishCalm();
    }
  }

  private finishCalm(): void {
    this.teardownScene();
    this.settle('finished');
  }

  /** Back to absent without beats (a load, the quest left). */
  private clear(): void {
    this.teardownScene();
    this.seq.reset();
    this.settle('cancelled');
  }

  private teardownScene(): void {
    if (!this.scene) return;
    // The glint stays (it waits for the pick-up) only once the scale beat has fired.
    const keep = this.scene.glint.visible;
    if (!keep) this.scene.glint.dispose();
    else {
      this.glint?.dispose();
      this.glint = this.scene.glint;
    }
    this.scene.dispose();
    this.scene = null;
  }

  private updateGlint(dt: number): void {
    if (!this.glint) return;
    if (this.ports.holdsScale() || this.ports.getBool(HATHREN_IDS.completeFlag) || !this.wanted()) {
      this.glint.dispose();
      this.glint = null;
      return;
    }
    this.glint.update(dt);
  }

  private build(): boolean {
    if (this.scene) return true;
    const place = this.place ?? this.resolvePlace();
    if (!place) return false;
    this.place = place;
    this.scene = new HathrenScene(this.ports, place);
    this.posed = false;
    return true;
  }

  /** From K3's anchors and K1's Mere; null (one warning) until they exist. */
  resolvePlace(): HathrenPlace | null {
    const shore = this.ports.anchor(HATHREN_IDS.shoreAnchor);
    const scaleBed = this.ports.anchor(HATHREN_IDS.scaleBedAnchor);
    const nets: PathPoint[] = [];
    for (let n = 1; n <= HATHREN.nets; n++) {
      const a = this.ports.anchor(HATHREN_IDS.netAnchor(n));
      if (a) nets.push(a);
    }
    if (!shore || !scaleBed || nets.length < HATHREN.nets) {
      if (!this.warned) {
        this.warned = true;
        this.ports.warn('Hathren waits for the Mere anchors (greyfen.mere.shore, .net.1-4, greyfen.m26.scale-bed)');
      }
      return null;
    }
    const centre = hathrenCentre(shore, (x, z) => this.ports.heightAt(x, z));
    const floor = this.ports.heightAt(centre.x, centre.z);
    return { centre, shore, nets, scaleBed, water: { surface: GREYFEN_WATER_TABLE, floor } };
  }
}

/**
 * Her loop centre: from the shore point toward the Mere's centre, `offshore` metres out, then on in steps until the water is
 * at least `minDepth` deep (K1's bowl: floor y 3 under a y 6 table inside 330 m). Clamped to the Mere's centre.
 */
export function hathrenCentre(shore: { x: number; z: number }, heightAt: (x: number, z: number) => number): { x: number; z: number } {
  const dx = HATHRENS_MERE.x - shore.x;
  const dz = HATHRENS_MERE.z - shore.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: HATHRENS_MERE.x, z: HATHRENS_MERE.z };
  const ux = dx / len;
  const uz = dz / len;
  for (let d = HATHREN_PLACE.offshore; d <= Math.min(len, HATHREN_PLACE.offshore + HATHREN_PLACE.searchMax); d += HATHREN_PLACE.searchStep) {
    const x = shore.x + ux * d;
    const z = shore.z + uz * d;
    if (GREYFEN_WATER_TABLE - heightAt(x, z) >= HATHREN_PLACE.minDepth) return { x, z };
  }
  const d = Math.min(len, HATHREN_PLACE.offshore);
  return { x: shore.x + ux * d, z: shore.z + uz * d };
}
