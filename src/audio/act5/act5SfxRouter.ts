import type { Act5SfxKey } from './act5Sfx';
import { ARENA_DROP_PIECE, ARENA_REST_STATES, DRAGON_ALLY_ID, GATE_CRACK_PCT, LAVA_LOOP_RANGE_M, LOOP_POLL_S, MOVE_SFX_ACT5, RAM_SFX_ACT5, VENT_LOOP_RANGE_M } from './act5SfxEvents';

const own = (table: Readonly<Record<string, Act5SfxKey>>, id: string): Act5SfxKey | undefined =>
  Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;

interface Point {
  x: number;
  y: number;
  z: number;
}

/** What the router needs from the game; every lookup may come back empty (the router then plays flat, or nothing). */
export interface Act5SfxPorts {
  audio():
    | {
        play(key: string): unknown;
        playAt(key: string, at: Point): unknown;
        attach?(key: string, object: object): number;
        detach?(id: number): void;
      }
    | undefined;
  actorAt(id: string): Point | null | undefined;
  /** The player's root object (the lava, vent and Anvil loops follow it). */
  playerObject(): object | undefined;
  /** Metres from the player to the nearest lava volume, or null (N3's `lava` service; absent before it lands). */
  lavaDistance?(): number | null;
  /** Metres from the player to the nearest open vent, or null. */
  ventDistance?(): number | null;
  ensure?(key: Act5SfxKey): void;
}

/** Maps the events the Act 5 systems emit to sound keys. The plugin forwards each event to the matching method; every audio call is guarded. */
export class Act5SfxRouter {
  private readonly loops = new Map<string, number>();
  private readonly gate = new Map<string, number>();
  private poll = 0;

  constructor(private readonly ports: Act5SfxPorts) {}

  // --- lava and vents ---------------------------------------------------------------------------
  lavaEntered(): void {
    this.flat('sfx.lava.splash');
    this.flat('sfx.lava.burn');
  }
  lavaThrown(): void {
    this.flat('sfx.lava.thrown');
  }
  ventOpened(): void {
    this.flat('sfx.vent.open');
  }
  ventClosed(): void {
    this.flat('sfx.vent.close');
  }
  /** N3's `vent.closing`: the crust starts to crack before it melts. */
  ventClosing(): void {
    this.flat('sfx.vent.crack');
  }

  // --- the siege --------------------------------------------------------------------------------
  waveStarted(e: { siegeId: string }): void {
    void e; // the gate's health carries over between waves (Q4): its cracks are not repeated
    this.flat('sfx.siege.horn');
  }
  waveCleared(): void {
    this.flat('sfx.siege.clear');
  }
  /** `pct` is what remains, 0..100: a crack when it crosses a threshold on the way down, a hit otherwise. */
  gateDamaged(e: { siegeId: string; pct: number }): void {
    const before = this.gate.get(e.siegeId) ?? e.pct; // the first event after a start or a load is the baseline
    this.gate.set(e.siegeId, e.pct);
    const crossed = GATE_CRACK_PCT.some((p) => before > p && e.pct <= p);
    this.flat(crossed ? 'sfx.gate.crack' : 'sfx.gate.hit');
  }
  gateBreached(): void {
    this.flat('sfx.gate.breach');
  }
  order(): void {
    this.flat('sfx.siege.order');
  }
  allyArrived(e: { id: string }): void {
    if (DRAGON_ALLY_ID.test(e.id)) this.flat('sfx.dragon.flyby');
  }
  /** One of `RAM_SFX_ACT5`'s event names. */
  ram(name: string): void {
    const key = own(RAM_SFX_ACT5, name);
    if (key) this.flat(key);
  }
  /** N4's `siege.dragon.breath`: the fire lands about a second after it. */
  dragonBreath(): void {
    this.flat('sfx.dragon.breath');
  }
  /** N4's `siege.gong`: the rim gong that starts waves 2 to 4. */
  gong(): void {
    this.flat('sfx.gong.rim');
  }
  /** N5's `enemies.shieldLine.broken`. */
  lineBroken(): void {
    this.flat('sfx.siege.lineBreak');
  }
  dragonFlight(e: { actorId: string; on: boolean }): void {
    if (e.on) this.at('sfx.dragon.flyby', e.actorId);
  }

  // --- bosses and the arena ---------------------------------------------------------------------
  telegraph(e: { actorId: string; moveId: string }): void {
    const key = own(MOVE_SFX_ACT5, e.moveId);
    if (key) this.at(key, e.actorId);
  }
  arenaPiece(e: { pieceId: string; state: string }): void {
    if (ARENA_DROP_PIECE.test(e.pieceId) && !ARENA_REST_STATES.includes(e.state)) this.flat('sfx.anvil.drop');
  }
  /** `arena.reset`: the Anvil's hum (a scene's loop) stops with the arena. */
  arenaReset(): void {
    this.stopLoop('anvil');
  }
  /** The M56 scene starts or stops the Anvil's hum on the player's room. */
  anvilHum(on: boolean): void {
    if (on) this.startLoop('anvil', 'sfx.anvil.hum');
    else this.stopLoop('anvil');
  }

  // --- time and loads ---------------------------------------------------------------------------
  tick(dt: number): void {
    if ((this.poll += dt) < LOOP_POLL_S) return;
    this.poll = 0;
    this.near('lava', 'sfx.lava.loop', this.ports.lavaDistance, LAVA_LOOP_RANGE_M);
    this.near('vent', 'sfx.vent.idle', this.ports.ventDistance, VENT_LOOP_RANGE_M);
  }

  saveLoaded(): void {
    this.stopAll();
    this.gate.clear();
  }

  stopAll(): void {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
  }

  // --- plumbing ---------------------------------------------------------------------------------
  private near(name: string, key: Act5SfxKey, distance: (() => number | null) | undefined, range: number): void {
    let d: number | null = null;
    try {
      d = distance?.() ?? null;
    } catch {
      d = null;
    }
    if (d !== null && Number.isFinite(d) && d <= range) this.startLoop(name, key);
    else this.stopLoop(name);
  }

  private startLoop(name: string, key: Act5SfxKey): void {
    if (this.loops.has(name)) return;
    try {
      const audio = this.ports.audio();
      const object = this.ports.playerObject();
      if (!audio?.attach || !object) return;
      this.ports.ensure?.(key);
      this.loops.set(name, audio.attach(key, object));
    } catch {
      // a failed attach leaves no loop to stop
    }
  }

  private stopLoop(name: string): void {
    const id = this.loops.get(name);
    this.loops.delete(name);
    if (id === undefined) return;
    try {
      this.ports.audio()?.detach?.(id);
    } catch {
      // the emitter is gone either way
    }
  }

  private flat(key: Act5SfxKey): void {
    try {
      this.ports.ensure?.(key);
      this.ports.audio()?.play(key);
    } catch {
      // sound is never worth a thrown event handler
    }
  }

  private at(key: Act5SfxKey, actorId: string): void {
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
