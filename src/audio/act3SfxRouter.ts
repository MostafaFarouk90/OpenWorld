import type { Act3SfxKey } from './act3Sfx';

/** The `telegraph` move ids of the Act 3 enemies and Ysmeryth, and the sound each plays (the wind-up cue of the attack). */
export const MOVE_SFX_ACT3: Readonly<Record<string, Act3SfxKey>> = {
  'leech.lunge': 'sfx.leech.lunge',
  'leech.bite': 'sfx.leech.bite',
  'shambler.smash': 'sfx.shambler.smash',
  'shambler.mud': 'sfx.shambler.mud',
  // The hawk and ogre ids are K14's proposals for K6b PR 2; a rename is a one-line change here.
  'hawk.stoop': 'sfx.hawk.shriek',
  'hawk.rake': 'sfx.hawk.wing',
  'ogre.slam': 'sfx.ogre.slam',
  'ogre.throw': 'sfx.ogre.throw',
  'ysmeryth.sweep': 'sfx.ysmeryth.sweep',
  'ysmeryth.slam': 'sfx.ysmeryth.slam',
  'ysmeryth.breath': 'sfx.ysmeryth.breath',
  'ysmeryth.call': 'sfx.ysmeryth.call',
};

/** `actor.died` kinds and their death cue. */
export const DIED_SFX_ACT3: Readonly<Record<string, Act3SfxKey>> = {
  'fen-leech': 'sfx.leech.squelch',
  'peat-shambler': 'sfx.shambler.collapse',
  'rime-hawk': 'sfx.hawk.cry',
  'crag-ogre': 'sfx.ogre.roar',
};

/** `wyrm.hathren { beat }`: `netDropped`, `scale` and `gone` play nothing. */
export const HATHREN_BEAT_SFX: Readonly<Record<string, Act3SfxKey>> = {
  wake: 'sfx.wyrm.hathren.splash',
  rise: 'sfx.wyrm.hathren.splash',
  thrash: 'sfx.wyrm.hathren.thrash',
  spray: 'sfx.wyrm.hathren.spray',
  roar: 'sfx.wyrm.hathren.roar',
  quiet: 'sfx.wyrm.hathren.song',
  dive: 'sfx.wyrm.hathren.dive',
};

/** One-shot cues with a single trigger each. */
export const EVENT_SFX_ACT3 = {
  waterEnter: 'sfx.water.enter',
  waterWade: 'sfx.water.wade',
  waterLeave: 'sfx.water.leave',
  diveIn: 'sfx.dive.in',
  diveOut: 'sfx.dive.out',
  breathWarn: 'sfx.dive.breath-warn',
  glideLand: 'sfx.glide.land',
  ferryBoard: 'sfx.ferry.board',
  ferryBell: 'sfx.ferry.bell',
  drakeChain: 'sfx.drake.chain',
  drakeFreed: 'sfx.drake.freed',
} as const satisfies Record<string, Act3SfxKey>;

/** The looping cues, by the loop they belong to. */
export const LOOP_SFX_ACT3 = {
  glide: 'sfx.glide.wind',
  ferry: 'sfx.ferry.pole',
  flight: 'sfx.dragon.wingbeat',
} as const satisfies Record<string, Act3SfxKey>;

/** Breath (seconds) at and below which the heartbeat warning sounds, once per whole second. */
export const BREATH_WARN_AT = 5;
/** Metres of wading between two sloshes (a step length). */
export const WADE_STEP_METRES = 1.5;
/** Below this speed (m/s) the player is standing, not stepping; above the cap a position jump (teleport) is not walking. */
export const WADE_MIN_SPEED = 0.4;
export const WADE_MAX_SPEED = 14;

/** A table lookup that ignores prototype names (`toString`, `__proto__`). */
const own = (table: Readonly<Record<string, Act3SfxKey>>, id: string): Act3SfxKey | undefined =>
  Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;

interface Point {
  x: number;
  y: number;
  z: number;
}

/** What the router needs from the game; every lookup may come back empty (the router then plays flat, or nothing). */
export interface Act3SfxPorts {
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
  actor(id: string): { kind: string; position: Point | null } | undefined;
  /** The scene object a loop follows: an actor's root, else a scene object named `id` (a dragon that is not an actor). */
  object(id: string): object | undefined;
  /** The player's root object (the glide wind and the ferry pole follow it). */
  playerObject(): object | undefined;
  /** Called with a key just before it is played, so a lazily rendered sound can be registered first. */
  ensure?(key: Act3SfxKey): void;
}

/**
 * Maps the events the Act 3 systems emit to sound keys. It listens to nothing itself: the plugin forwards each event to the
 * matching method. Every audio call is guarded: a missing audio service, an unregistered key, a throwing `play` or a
 * suspended context (`play` returning null) is a silent no-op that never blocks the caller.
 */
export class Act3SfxRouter {
  private readonly loops = new Map<string, number>();
  private lastBreath = Infinity;
  private lastWhole: number | null = null;
  private wadeMetres = WADE_STEP_METRES / 2;

  constructor(private readonly ports: Act3SfxPorts) {}

  /** Names of the loops that are running (tests and the plugin's teardown). */
  get activeLoops(): readonly string[] {
    return [...this.loops.keys()];
  }

  telegraph(e: { actorId: string; moveId: string }): void {
    const key = own(MOVE_SFX_ACT3, e.moveId);
    if (key) this.at(key, e.actorId);
  }

  died(e: { actorId: string; kind: string }): void {
    const key = own(DIED_SFX_ACT3, e.kind);
    if (key) this.at(key, e.actorId);
  }

  /** `water.entered`: only wading water has a splash here (deep is never entered, diving has its own cue). */
  waterEntered(e: { kind: string }): void {
    if (e.kind === 'wade') this.flat(EVENT_SFX_ACT3.waterEnter);
  }

  waterLeft(e: { kind: string }): void {
    if (e.kind === 'wade') {
      this.wadeMetres = WADE_STEP_METRES / 2;
      this.flat(EVENT_SFX_ACT3.waterLeave);
    }
  }

  /**
   * Called every tick with the player's horizontal speed (m/s) and whether they are wading: a slosh for every
   * `WADE_STEP_METRES` walked, so the cadence follows speed; nothing while standing, out of water or teleporting.
   */
  wadeStep(dt: number, speed: number, wading: boolean): void {
    if (!wading || !(dt > 0) || !(speed >= WADE_MIN_SPEED) || speed > WADE_MAX_SPEED) {
      if (!wading) this.wadeMetres = WADE_STEP_METRES / 2;
      return;
    }
    this.wadeMetres += speed * dt;
    if (this.wadeMetres >= WADE_STEP_METRES) {
      this.wadeMetres %= WADE_STEP_METRES;
      this.flat(EVENT_SFX_ACT3.waterWade);
    }
  }

  diveStarted(): void {
    this.resetBreath();
    this.flat(EVENT_SFX_ACT3.diveIn);
  }

  diveSurfaced(): void {
    this.resetBreath();
    this.flat(EVENT_SFX_ACT3.diveOut);
  }

  /** `breath.changed`: the warning sounds once for each whole second at or below `BREATH_WARN_AT`, never above it. */
  breathChanged(e: { value: number }): void {
    const v = e.value;
    if (!Number.isFinite(v)) return;
    if (v > this.lastBreath + 1e-6) this.lastWhole = null; // a refill (a pocket) starts the count again
    this.lastBreath = v;
    if (v > BREATH_WARN_AT || v < 0) {
      this.lastWhole = null;
      return;
    }
    const whole = Math.floor(v);
    if (whole === this.lastWhole) return;
    this.lastWhole = whole;
    this.flat(EVENT_SFX_ACT3.breathWarn);
  }

  glideStarted(): void {
    this.startLoop('glide', LOOP_SFX_ACT3.glide, this.ports.playerObject());
  }

  glideLanded(): void {
    this.flat(EVENT_SFX_ACT3.glideLand);
  }

  glideEnded(): void {
    this.stopLoop('glide');
  }

  ferryBoarded(): void {
    this.flat(EVENT_SFX_ACT3.ferryBoard);
    this.startLoop('ferry', LOOP_SFX_ACT3.ferry, this.ports.playerObject());
  }

  ferryArrived(): void {
    this.stopLoop('ferry');
    this.flat(EVENT_SFX_ACT3.ferryBell);
  }

  hathren(e: { beat: string }): void {
    const key = own(HATHREN_BEAT_SFX, e.beat);
    if (key) this.flat(key);
  }

  /** `dragon.flight`: the wingbeat loop follows the actor (or the scene object of that name); with neither it plays one flat beat. */
  dragonFlight(e: { actorId: string; on: boolean }): void {
    const name = `flight:${e.actorId}`;
    if (!e.on) {
      this.stopLoop(name);
      return;
    }
    if (this.loops.has(name)) return;
    const obj = this.ports.object(e.actorId);
    if (obj) this.startLoop(name, LOOP_SFX_ACT3.flight, obj);
    else this.flat(LOOP_SFX_ACT3.flight);
  }

  drakeChainStruck(): void {
    this.flat(EVENT_SFX_ACT3.drakeChain);
  }

  drakeFreed(): void {
    this.flat(EVENT_SFX_ACT3.drakeFreed);
  }

  /** `save.loaded`: nothing that was playing before the load is still true. */
  saveLoaded(): void {
    this.stopAll();
  }

  /** Detaches every loop and forgets the breath and wade counters. */
  stopAll(): void {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
    this.resetBreath();
    this.wadeMetres = WADE_STEP_METRES / 2;
  }

  private resetBreath(): void {
    this.lastBreath = Infinity;
    this.lastWhole = null;
  }

  private startLoop(name: string, key: Act3SfxKey, object: object | undefined): void {
    if (this.loops.has(name) || !object) return;
    try {
      const audio = this.ports.audio();
      if (!audio?.attach) return;
      this.ports.ensure?.(key);
      this.loops.set(name, audio.attach(key, object));
    } catch {
      // an unregistered key is silent
    }
  }

  private stopLoop(name: string): void {
    const id = this.loops.get(name);
    if (id === undefined) return;
    this.loops.delete(name);
    try {
      this.ports.audio()?.detach?.(id);
    } catch {
      // a detach that fails leaves nothing to stop
    }
  }

  private flat(key: Act3SfxKey): void {
    try {
      this.ports.ensure?.(key);
      this.ports.audio()?.play(key);
    } catch {
      // an unregistered key is silent
    }
  }

  private at(key: Act3SfxKey, actorId: string): void {
    try {
      const audio = this.ports.audio();
      if (!audio) return;
      this.ports.ensure?.(key);
      const p = this.ports.actor(actorId)?.position;
      if (p) audio.playAt(key, p);
      else audio.play(key);
    } catch {
      // an unregistered key is silent
    }
  }
}
