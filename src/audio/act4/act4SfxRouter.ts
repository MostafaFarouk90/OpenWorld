import type { Act4SfxKey } from './act4Sfx';
import {
  BOSS_PHASE_SFX_ACT4,
  BOSS_RELEASED_SFX_ACT4,
  CREAK_EVERY_GUSTS,
  DIED_SFX_ACT4,
  GUST_MAX_S,
  GUST_MIN_S,
  HUSK_SFX,
  HUSK_SKIN,
  LOOP_BY_KIND_ACT4,
  MOVE_SFX_ACT4,
  WEATHER_SFX,
} from './act4SfxEvents';

/** A table lookup that ignores prototype names (`toString`, `__proto__`). */
const own = (table: Readonly<Record<string, Act4SfxKey>>, id: string): Act4SfxKey | undefined =>
  Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;

interface Point {
  x: number;
  y: number;
  z: number;
}

/** The weather kinds of L0's weather service (`WeatherKind`). */
export type StormKind = 'clear' | 'warning' | 'storm';

/** What the router needs from the game; every lookup may come back empty (the router then plays flat, or nothing). */
export interface Act4SfxPorts {
  /** The audio service, looked up per call (it is absent without an audio context). */
  audio():
    | {
        play(key: string): unknown;
        playAt(key: string, at: Point): unknown;
        attach?(key: string, object: object): number;
        detach?(id: number): void;
      }
    | undefined;
  /** An actor's world position, or undefined for an unknown or unplaced actor. */
  actorAt(id: string): Point | null | undefined;
  /** The scene object a loop follows (an actor's root). */
  object(id: string): object | undefined;
  /** The player's root object (the storm loop follows it). */
  playerObject(): object | undefined;
  /** Seeded 0..1 values for the gust spacing (default: a fixed LCG). */
  random?(): number;
  /** Called with a key just before it is played, so a lazily rendered sound can be registered first. */
  ensure?(key: Act4SfxKey): void;
}

/** The loop name of the storm wind on the player. */
const STORM_LOOP = 'storm';

/**
 * Maps the events the Act 4 systems emit to sound keys. It listens to nothing itself: the plugin forwards each event to the
 * matching method. Every audio call is guarded: a missing audio service, an unregistered key, a throwing `play` or a
 * suspended context is a silent no-op that never blocks the caller.
 */
export class Act4SfxRouter {
  private readonly loops = new Map<string, number>();
  private readonly husks = new Set<string>();
  private weather: StormKind = 'clear';
  private shelters = new Set<string>();
  private gustIn = 0;
  private gusts = 0;
  private seed = 0x2545f491;

  constructor(private readonly ports: Act4SfxPorts) {}

  /** Names of the loops that are running (tests and the plugin's teardown). */
  get activeLoops(): readonly string[] {
    return [...this.loops.keys()];
  }

  get weatherKind(): StormKind {
    return this.weather;
  }

  get inShelter(): boolean {
    return this.shelters.size > 0;
  }

  // --- creatures and bosses -------------------------------------------------------------------

  telegraph(e: { actorId: string; moveId: string }): void {
    const key = own(MOVE_SFX_ACT4, e.moveId);
    if (key) this.at(key, e.actorId);
    // A husk is a skinned Ash Wraith: its own wind-ups keep their sound, and it rasps over them.
    else if (this.husks.has(e.actorId)) this.at(HUSK_SFX.rasp, e.actorId);
  }

  /** `actor.spawned`: husks rise; looping kinds start their loop on the actor. */
  spawned(e: { actorId: string; kind: string; skin?: string | null }, opts: { silent?: boolean } = {}): void {
    if (e.skin === HUSK_SKIN) {
      this.husks.add(e.actorId);
      if (!opts.silent) this.at(HUSK_SFX.rise, e.actorId);
    }
    const loop = own(LOOP_BY_KIND_ACT4, e.kind);
    if (loop) {
      const object = this.ports.object(e.actorId);
      if (object) this.startLoop(`actor:${e.actorId}`, loop, object);
    }
  }

  died(e: { actorId: string; kind: string }): void {
    const key = this.husks.has(e.actorId) ? HUSK_SFX.collapse : own(DIED_SFX_ACT4, e.kind);
    if (key) this.at(key, e.actorId);
    this.gone(e.actorId);
  }

  /** `actor.despawned` (and after a death): the actor's loop stops, it is no longer a husk. */
  gone(actorId: string): void {
    this.husks.delete(actorId);
    this.stopLoop(`actor:${actorId}`);
  }

  bossPhase(e: { bossId: string; phase: number }): void {
    // Phase 1 is the start, not a break.
    if (!(e.phase > 1)) return;
    const key = own(BOSS_PHASE_SFX_ACT4, e.bossId);
    if (key) this.flat(key);
  }

  bossReleased(e: { bossId: string }): void {
    const key = own(BOSS_RELEASED_SFX_ACT4, e.bossId);
    if (key) this.flat(key);
  }

  // --- weather --------------------------------------------------------------------------------

  /** `weather.changed`: the warning rumble, the storm's onset and wind, and silence again on clear. */
  weatherChanged(e: { kind: StormKind; from?: StormKind }): void {
    const was = this.weather;
    this.weather = e.kind;
    if (e.kind === 'warning' && was !== 'warning') this.flat(WEATHER_SFX.warning);
    if (e.kind === 'storm' && was !== 'storm') {
      this.flat(WEATHER_SFX.onset);
      this.gusts = 0;
      this.gustIn = this.nextGust();
    }
    this.applyStorm();
  }

  shelterEntered(e: { id: string }): void {
    if (this.shelters.has(e.id)) return;
    this.shelters.add(e.id);
    this.flat(WEATHER_SFX.flap);
    this.applyStorm();
  }

  shelterLeft(e: { id: string }): void {
    if (!this.shelters.delete(e.id)) return;
    this.flat(WEATHER_SFX.flap);
    this.applyStorm();
  }

  /** Every tick: gusts at seeded intervals while a storm blows outside a shelter, a rope creak on every third. */
  tick(dt: number): void {
    if (this.weather !== 'storm' || this.inShelter || !(dt > 0)) return;
    this.gustIn -= dt;
    if (this.gustIn > 0) return;
    this.gustIn = this.nextGust();
    this.gusts++;
    this.flat(WEATHER_SFX.gust);
    if (this.gusts % CREAK_EVERY_GUSTS === 0) this.flat(WEATHER_SFX.creak);
  }

  /** After a load: the weather service's state, without the onset (the storm was already blowing), shelters forgotten. */
  restore(kind: StormKind): void {
    this.shelters.clear();
    this.weather = kind;
    this.gustIn = this.nextGust();
    this.applyStorm();
  }

  /**
   * On a load: actor loops and husk ids are dropped, then re-derived from the actors still alive (`living`, read on the
   * tick after the load so the enemy manager has settled), without the rise. The weather is restored separately.
   */
  saveLoaded(): void {
    for (const name of [...this.loops.keys()]) if (name.startsWith('actor:')) this.stopLoop(name);
    this.husks.clear();
  }

  /** Re-adopts living actors after a load: husks keep their rasp and collapse, looping kinds their loop. */
  adopt(living: Iterable<{ actorId: string; kind: string; skin?: string | null }>): void {
    for (const a of living) this.spawned(a, { silent: true });
  }

  stopAll(): void {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
    this.husks.clear();
    this.shelters.clear();
    this.weather = 'clear';
  }

  // --- helpers --------------------------------------------------------------------------------

  private nextGust(): number {
    const r = this.ports.random?.() ?? this.lcg();
    return GUST_MIN_S + (GUST_MAX_S - GUST_MIN_S) * Math.min(1, Math.max(0, r));
  }

  private lcg(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }

  /** The storm wind follows the weather: loud outside, muffled in a shelter, nothing otherwise. */
  private applyStorm(): void {
    const want: Act4SfxKey | null = this.weather === 'storm' ? (this.inShelter ? WEATHER_SFX.muffled : WEATHER_SFX.loop) : null;
    const current = this.loopKeys.get(STORM_LOOP) ?? null;
    if (want === current) return;
    this.stopLoop(STORM_LOOP);
    if (!want) return;
    let player: object | undefined;
    try {
      player = this.ports.playerObject();
    } catch {
      player = undefined; // no player yet: the wind starts on the next weather event or load
    }
    if (player) this.startLoop(STORM_LOOP, want, player);
  }

  private readonly loopKeys = new Map<string, Act4SfxKey>();

  private startLoop(name: string, key: Act4SfxKey, object: object): void {
    if (this.loops.has(name)) return;
    try {
      const audio = this.ports.audio();
      if (!audio?.attach) return;
      this.ports.ensure?.(key);
      this.loops.set(name, audio.attach(key, object));
      this.loopKeys.set(name, key);
    } catch {
      // a failed attach leaves no loop to stop
    }
  }

  private stopLoop(name: string): void {
    const id = this.loops.get(name);
    this.loops.delete(name);
    this.loopKeys.delete(name);
    if (id === undefined) return;
    try {
      this.ports.audio()?.detach?.(id);
    } catch {
      // the emitter is gone either way
    }
  }

  private flat(key: Act4SfxKey): void {
    try {
      this.ports.ensure?.(key);
      this.ports.audio()?.play(key);
    } catch {
      // sound is never worth a thrown event handler
    }
  }

  /** Plays at the actor when it has a position, flat otherwise. */
  private at(key: Act4SfxKey, actorId: string): void {
    try {
      const audio = this.ports.audio();
      if (!audio) return;
      this.ports.ensure?.(key);
      const p = this.ports.actorAt(actorId);
      if (p) audio.playAt(key, p);
      else audio.play(key);
    } catch {
      // as above
    }
  }
}
