// Act 4 L3 (plans/act4-L3.md 2.2, 2.3, 2.5 to 2.7): the `weather` service and its fixed-step rules, behind ports so
// tests drive it without booting plugins. The plugin (weather.plugin.ts) builds the ports from the game context.
//
// - The clock runs only while the player is outdoors in a storm region (the Waste); a dialogue holds its next storm.
// - `state()` is the weather where the player stands: outside the Waste, or indoors, it is always clear.
// - In a storm: the `storm` movement mode is pushed (its safe point is the live position on a rope, else the last
//   shelter passed, else the nearest rope point), walking drops to 3 m/s with no sprint, and exposure ticks off the
//   rope-lines and shelters (2% of maximum health per 3 s, never below 10%).
import type { MovementSafePoint, MovementSafePointSource, PushedMovementMode } from '../movement/types';
import type { MoveModifier } from '../core/MoveModifiers';
import { WeatherClock } from './clock';
import { ExposureClock, exposureDamage } from './exposure';
import { RopeIndex, ShelterTracker, type RopeLike, type ShelterLike, type XZ } from './lanes';
import { resolveWeather } from './precedence';
import { EXPOSURE, STORM_WALK, WEATHER_SEED } from './tuning';
import { PLAYER } from '../config/constants';
import { inStormArea, type StormArea, type WeatherKind, type WeatherService, type WeatherState } from './types';

export interface WeatherPorts {
  /** The player's simulated feet. */
  player(): { x: number; y: number; z: number; yaw: number };
  /** Inside an interior (or moving through a door). */
  indoors(): boolean;
  /** The player stands in a region with `weather: 'ash-storm'`. */
  stormRegion(x: number, z: number): boolean;
  /**
   * The player stands in a storm region or its look band outside (150 m): the clock runs there too, so a player who
   * walks out to Ashgate mid-storm sees it pass instead of a storm frozen on the horizon.
   */
  stormBand(x: number, z: number): boolean;
  /** A dialogue is open. */
  dialogue(): boolean;
  /** The input context is gameplay (no dialogue, menu or cutscene on top). */
  gameplay(): boolean;
  /** The player's health; dead stops exposure. */
  vitals(): { health: number; max: number; dead: boolean };
  /** Applies exposure damage (a script hit, no attacker, poise 0). */
  damage(amount: number): void;
  /** Heals the player by `amount` (the floor guard). */
  heal(amount: number): void;
  emit(name: 'weather.changed', payload: { kind: WeatherKind; from: WeatherKind }): void;
  emit(name: 'storm.exposed', payload: { seconds: number }): void;
  emit(name: 'shelter.entered' | 'shelter.left', payload: { id: string }): void;
  toast(textKey: string): void;
  pushMode(mode: PushedMovementMode, safePoint: MovementSafePointSource): () => void;
  addMoveModifier(source: string, mod: MoveModifier): () => void;
  groundAt(x: number, z: number): number;
  warn(message: string): void;
}

export interface WeatherData {
  ropes: readonly RopeLike[];
  shelters: readonly ShelterLike[];
}

export interface WeatherSave {
  seed: number;
  t: number;
  lastShelterId: string | null;
}

export const STORM_TOAST_KEYS = { warning: 'weather.toast.warning', exposed: 'weather.toast.exposed' } as const;

const STORM_MODIFIER: MoveModifier = { speedScale: STORM_WALK.speed / PLAYER.walkSpeed, noSprint: true };

export class WeatherRuntime implements WeatherService {
  private readonly _clock: WeatherClock;
  private ropes: RopeIndex;
  private shelters: ShelterTracker;
  /** The loaded last-shelter id, kept until the shelters resolve (it may name a shelter not resolved yet). */
  private loadedLast: string | null = null;
  private readonly forced = new Map<string, number>();
  private readonly held = new Map<string, number>();
  private readonly exposure = new ExposureClock();
  private kind: WeatherKind = 'clear';
  private kindT = 0;
  /** The resolved weather of the region before this tick (L0's precedence needs it), independent of where the player is. */
  private regionKind: WeatherKind = 'clear';
  private releaseMode: (() => void) | null = null;
  private releaseSpeed: (() => void) | null = null;
  private toastedExposure = false;
  private toastedWarning = false;
  private floorWarned = false;
  /** The player is outdoors in a storm region this tick. */
  private _inRegion = false;
  /** N4: areas that count as a storm region while their force stands. */
  private readonly areas = new Map<number, StormArea>();
  private nextArea = 1;
  /** N4: shelter zones (the siege's lee ring). */
  private readonly zones = new Map<string, { x: number; z: number; r: number }>();

  constructor(private readonly ports: WeatherPorts, data: WeatherData, seed = WEATHER_SEED) {
    this._clock = new WeatherClock(seed);
    this.ropes = new RopeIndex(data.ropes);
    this.shelters = new ShelterTracker(data.shelters);
  }

  // ------------------------------------------------------------------ the port (L0's WeatherService)

  state(): WeatherState {
    return { kind: this.kind, t: this.kindT, forced: this.forced.size > 0, held: this.held.size > 0 };
  }

  forceStorm(reason: string, opts?: { area: StormArea }): () => void {
    const off = this.addReason(this.forced, reason);
    if (!opts?.area) return off;
    const key = this.nextArea++;
    this.areas.set(key, opts.area);
    return () => {
      this.areas.delete(key);
      off();
    };
  }

  addShelterZone(zone: { id: string; at: { x: number; z: number }; radius: number }): () => void {
    const z = { x: zone.at.x, z: zone.at.z, r: zone.radius };
    this.zones.set(zone.id, z);
    return () => {
      if (this.zones.get(zone.id) === z) this.zones.delete(zone.id);
    };
  }

  private inArea(x: number, z: number): boolean {
    for (const a of this.areas.values()) if (inStormArea(a, x, z)) return true;
    return false;
  }

  private inZone(x: number, z: number): boolean {
    for (const c of this.zones.values()) if (Math.hypot(x - c.x, z - c.z) <= c.r) return true;
    return false;
  }

  holdClear(reason: string): () => void {
    return this.addReason(this.held, reason);
  }

  get clock(): { seed: number; next(): { kind: WeatherKind; at: number } } {
    const c = this._clock;
    return {
      seed: c.seed,
      next: () => {
        const n = c.next();
        return { kind: n.kind, at: Math.max(0, n.at - c.t) };
      },
    };
  }

  onShelter(id: string): boolean {
    return this._inRegion && this.shelters.current === id;
  }

  // ------------------------------------------------------------------ extras for the plugin and tests

  /** The player stands outdoors in a storm region (the look's gameplay half; the edge band is the look's own). */
  get inRegion(): boolean {
    return this._inRegion;
  }

  /** The region's resolved weather (for the look's edge band), whether or not the player stands in it. */
  get lookKind(): WeatherKind {
    return this.regionKind;
  }

  get clockTime(): number {
    return this._clock.t;
  }

  get exposedSeconds(): number {
    return this.exposure.seconds;
  }

  get lastShelter(): string | null {
    return this.shelters.last;
  }

  shelterPoints(): readonly { id: string; x: number; z: number }[] {
    return [...this.shelters.all()].map((s) => ({ id: s.id, x: s.at.x, z: s.at.z }));
  }

  get currentShelter(): string | null {
    return this.shelters.current;
  }

  /** L1's data arriving after setup (or a test swapping it). */
  setData(data: WeatherData): void {
    // A load can land before the shelters are resolved (a boot Continue runs before the first step): keep its id.
    const last = this.shelters.last ?? this.loadedLast;
    this.ropes = new RopeIndex(data.ropes);
    this.shelters = new ShelterTracker(data.shelters);
    this.shelters.restoreLast(last);
  }

  onRope(x: number, z: number): boolean {
    return this.ropes.onRope(x, z);
  }

  /**
   * The storm mode's safe point: the live position on a rope or in a shelter, else the last shelter passed, else the
   * nearest rope point. The live position is returned explicitly, because the save plugin stops refreshing its
   * grounded position while a safe-point mode runs.
   */
  safePoint(): MovementSafePoint | null {
    const p = this.ports.player();
    if (this.ropes.onRope(p.x, p.z) || this.shelters.current) return { position: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw };
    const s = this.shelters.shelter(this.shelters.last);
    const at: XZ | null = s ? s.at : this.ropes.nearest(p.x, p.z);
    if (!at) return null;
    return { position: { x: at.x, y: this.ports.groundAt(at.x, at.z) + 0.05, z: at.z }, yaw: p.yaw };
  }

  serialize(): WeatherSave {
    return { seed: this._clock.seed, t: this._clock.t, lastShelterId: this.shelters.last ?? this.loadedLast };
  }

  /** `save.loaded` without a `weather` entry (an older save): back to a new game's clock. */
  loadDefaultsIfMissing(loaded: boolean): void {
    if (!loaded) this.load(null);
  }

  load(data: unknown): void {
    const d = (data ?? {}) as Partial<WeatherSave>;
    this._clock.restore(typeof d.seed === 'number' ? d.seed : WEATHER_SEED, typeof d.t === 'number' ? d.t : 0);
    this.loadedLast = typeof d.lastShelterId === 'string' ? d.lastShelterId : null;
    this.shelters.restoreLast(this.loadedLast);
    this.shelters.reset();
    this.exposure.reset();
    this.regionKind = this._clock.phase().kind;
    // A loaded storm or warning already happened to this player: no fresh warning toast on the first step.
    this.toastedWarning = this.regionKind !== 'clear';
    this.toastedExposure = false;
  }

  /** One fixed step. */
  update(dt: number): void {
    const p = this.ports.player();
    const outdoors = !this.ports.indoors();
    const inRegion = outdoors && (this.ports.stormRegion(p.x, p.z) || (this.areas.size > 0 && this.inArea(p.x, p.z)));
    this._inRegion = inRegion;
    const dialogue = this.ports.dialogue();
    if (outdoors && (inRegion || this.ports.stormBand(p.x, p.z))) this._clock.advance(dt, dialogue);
    const regionKind = resolveWeather({
      clock: this._clock.phase().kind,
      forced: this.forced.size > 0,
      held: this.held.size > 0,
      dialogue,
      current: this.regionKind,
    });
    // Toasts belong to the region's storm, not to the player's steps: walking out and back in, or through a door,
    // does not repeat them.
    if (regionKind !== this.regionKind) {
      if (regionKind === 'clear') this.toastedWarning = false;
      if (regionKind === 'storm') this.toastedExposure = false;
    }
    this.regionKind = regionKind;
    const here: WeatherKind = inRegion ? regionKind : 'clear';
    if (here !== this.kind) {
      const from = this.kind;
      this.kind = here;
      this.kindT = 0;
      this.ports.emit('weather.changed', { kind: here, from });
      if (here === 'warning' && !this.toastedWarning) {
        this.toastedWarning = true;
        this.ports.toast(STORM_TOAST_KEYS.warning);
      }
    } else this.kindT += dt;

    this.updateShelters(inRegion, p.x, p.z);
    const storm = here === 'storm';
    this.syncStormHolds(storm);
    this.updateExposure(dt, storm, p.x, p.z);
  }

  dispose(): void {
    this.syncStormHolds(false);
  }

  // ------------------------------------------------------------------ internals

  private addReason(set: Map<string, number>, reason: string): () => void {
    set.set(reason, (set.get(reason) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = set.get(reason) ?? 0;
      if (n <= 1) set.delete(reason);
      else set.set(reason, n - 1);
    };
  }

  private updateShelters(inRegion: boolean, x: number, z: number): void {
    if (!inRegion) {
      const cur = this.shelters.current;
      this.shelters.reset();
      if (cur) this.ports.emit('shelter.left', { id: cur });
      return;
    }
    const edge = this.shelters.update(x, z);
    if (edge.left) this.ports.emit('shelter.left', { id: edge.left });
    if (edge.entered) this.ports.emit('shelter.entered', { id: edge.entered });
  }

  private syncStormHolds(storm: boolean): void {
    if (storm && !this.releaseMode) {
      this.releaseMode = this.ports.pushMode('storm', () => this.safePoint());
      this.releaseSpeed = this.ports.addMoveModifier('weather.storm', STORM_MODIFIER);
    } else if (!storm && this.releaseMode) {
      this.releaseMode();
      this.releaseSpeed?.();
      this.releaseMode = null;
      this.releaseSpeed = null;
    }
  }

  private updateExposure(dt: number, storm: boolean, x: number, z: number): void {
    const v = this.ports.vitals();
    const inStorm = storm && !v.dead && this.ports.gameplay();
    const safe = this.ropes.onRope(x, z) || this.shelters.current !== null || (this.zones.size > 0 && this.inZone(x, z));
    // Paused (not reset) while a dialogue or menu is on top, so a talk does not wipe the meter.
    if (storm && !v.dead && !this.ports.gameplay()) return;
    const ticks = this.exposure.step(dt, { inStorm, safe });
    for (let i = 0; i < ticks; i++) {
      if (!this.toastedExposure) {
        this.toastedExposure = true;
        this.ports.toast(STORM_TOAST_KEYS.exposed);
      }
      const now = this.ports.vitals();
      const amount = exposureDamage(now.health, now.max);
      if (amount > 0) this.ports.damage(amount);
      this.guardFloor(now.health);
      this.ports.emit('storm.exposed', { seconds: this.exposure.seconds });
    }
  }

  /** If a damage modifier raised the hit past the floor, heal back to exactly the floor (never above where Cael was). */
  private guardFloor(before: number): void {
    const after = this.ports.vitals();
    const floor = EXPOSURE.floor * after.max;
    if (after.dead || after.health >= floor || before < floor) return;
    this.ports.heal(floor - after.health);
    if (!this.floorWarned) {
      this.floorWarned = true;
      this.ports.warn('weather: an exposure tick crossed the 10% floor; healed back to it');
    }
  }
}
