// The Greyfen ferry (contracts v0.7 item 6; K7 PR 1): fixed legs between stops, a seated ride at 5 m/s with no
// moving-platform physics (the frozen capsule is placed on the boat each tick, so the camera, terrain streaming and the
// map follow it), skip to the stop with a fade, and the mode rules of item 25 (a save stores the stop the ride left from).
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import type { FerryRouteDef, MovementMode } from '../../movement/types';
import { TELEPORT_JUMP } from '../water/WaterPlayer';

export const FERRY_SPEED = 5;
export const FERRY_SOURCE = 'traversal.ferry';
/** The boat's deck above the water surface (where the seated player's feet ride). */
export const DECK_HEIGHT = 0.35;

/** One leg's path, measured: the boat's position and heading `s` metres along it. */
export class FerryLeg {
  readonly length: number;
  private readonly cum: number[] = [0];

  constructor(readonly route: FerryRouteDef) {
    if (route.path.length < 2) throw new Error(`ferry: route "${route.id}" needs at least two path points`);
    if (route.stops.length !== 2) throw new Error(`ferry: route "${route.id}" is one leg between exactly two stops`);
    let n = 0;
    for (let i = 1; i < route.path.length; i++) {
      const a = route.path[i - 1];
      const b = route.path[i];
      n += Math.hypot(b.x - a.x, b.z - a.z);
      this.cum.push(n);
    }
    if (!(n > 0)) throw new Error(`ferry: route "${route.id}" has a zero-length path`);
    this.length = n;
  }

  /** Position and yaw (0 faces -Z) at `s` metres from the first stop; `reverse` runs from the second stop. */
  at(s: number, reverse = false): { x: number; y: number; z: number; yaw: number } {
    const d = Math.max(0, Math.min(this.length, reverse ? this.length - s : s));
    const p = this.route.path;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const a = p[i - 1];
    const b = p[i];
    const seg = this.cum[i] - this.cum[i - 1];
    const t = seg > 0 ? (d - this.cum[i - 1]) / seg : 0;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    if (reverse) {
      dx = -dx;
      dz = -dz;
    }
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(-dx, -dz) };
  }
}

export type BoardRefusal = 'noToken' | 'notRunning' | 'combat' | 'hauling' | 'busy' | 'noRoute';

/** What the waystones' safe teleport resolves with (`busy` means it did not move the player). */
export type SafeTeleportOutcome = { ok: true } | { ok: false; reason: string };

export interface FerryPorts {
  feet(): Vec3Like;
  yaw(): number;
  hasToken(): boolean;
  /** The ferry runs once M24 is done (K12's flag, read only). */
  running(): boolean;
  inCombat(): boolean;
  /** Dead, a menu or dialogue on top, or another mode running. */
  busy(): boolean;
  mounted(): boolean;
  dismount(): void;
  movementMode(): MovementMode;
  setMovementMode(mode: MovementMode, safe?: { position: Vec3Like; yaw: number } | null): void;
  addModifier(source: string, mod: MoveModifier): () => void;
  /** A K7 teleport (the water system is told, so it never reads as a jump). */
  teleport(p: Vec3Like, yaw: number): void;
  /** The waystones' fade, freeze and terrain wait; null when the service is absent (the place is then direct). */
  safeTeleport(p: Vec3Like, yaw: number): Promise<SafeTeleportOutcome> | null;
  /** The stop's landing: where the player boards and arrives (a dry standing point), or null when not placed. */
  landing(stopId: string): Vec3Like | null;
  showBoat(p: { x: number; y: number; z: number; yaw: number }): void;
  hideBoat(): void;
  emit(type: 'ferry.boarded', p: { routeId: string; from: string; to: string }): void;
  emit(type: 'ferry.arrived', p: { routeId: string; stop: string; skipped: boolean }): void;
  toast(key: string): void;
  warn(message: string): void;
}

interface Ride {
  leg: FerryLeg;
  reverse: boolean;
  from: string;
  to: string;
  s: number;
  ticks: number;
  placed: Vec3Like | null;
  skipping: boolean;
  freezeOff: () => void;
}

export class FerryRides {
  private readonly legs = new Map<string, FerryLeg>();
  private ride: Ride | null = null;
  /** Per stop, the index of the destination its default (the interact) picks next; K15's menu replaces the default. */
  private readonly nextPick = new Map<string, number>();

  constructor(private readonly ports: FerryPorts) {}

  register(route: FerryRouteDef): () => void {
    if (this.legs.has(route.id)) throw new Error(`ferry: duplicate route id "${route.id}"`);
    const leg = new FerryLeg(route);
    this.legs.set(route.id, leg);
    return () => {
      if (this.legs.get(route.id) === leg) this.legs.delete(route.id);
    };
  }

  get riding(): boolean {
    return this.ride !== null;
  }

  /** Every stop id, in registration order. */
  stops(): string[] {
    const out: string[] = [];
    for (const l of this.legs.values()) for (const s of l.route.stops) if (!out.includes(s.id)) out.push(s.id);
    return out;
  }

  /** The stops one leg away from `stop`, in registration order. */
  destinations(stop: string): string[] {
    const out: string[] = [];
    for (const l of this.legs.values()) {
      const [a, b] = l.route.stops;
      if (a.id === stop) out.push(b.id);
      else if (b.id === stop) out.push(a.id);
    }
    return out;
  }

  /** The default destination from `stop` (the interact's, cycling through the neighbours on each ride). */
  defaultDestination(stop: string): string | null {
    const d = this.destinations(stop);
    if (!d.length) return null;
    return d[(this.nextPick.get(stop) ?? 0) % d.length];
  }

  /** Why boarding is refused now, or null. */
  refusal(from: string, to: string): BoardRefusal | null {
    if (this.ride) return 'busy';
    if (!this.findLeg(from, to)) return 'noRoute';
    if (!this.ports.running()) return 'notRunning';
    if (!this.ports.hasToken()) return 'noToken';
    if (this.ports.inCombat()) return 'combat';
    // A sled or a carried load stays ashore (said, unlike the silent busy: the player may not see why).
    if (this.ports.movementMode() === 'haul') return 'hauling';
    if (this.ports.busy()) return 'busy';
    return null;
  }

  /** Boards at `from` for `to`; returns the refusal (and toasts it) or null on boarding. */
  board(from: string, to: string): BoardRefusal | null {
    const r = this.refusal(from, to);
    if (r) {
      if (r !== 'busy') this.ports.toast(`ferry.refused.${r}`);
      return r;
    }
    const found = this.findLeg(from, to)!;
    const start = this.ports.landing(from) ?? this.ports.feet();
    if (this.ports.mounted()) this.ports.dismount();
    const d = this.destinations(from);
    this.nextPick.set(from, (d.indexOf(to) + 1) % Math.max(1, d.length));
    // The save stores the stop the ride left from (item 25).
    this.ports.setMovementMode('ferry', { position: { x: start.x, y: start.y, z: start.z }, yaw: this.ports.yaw() });
    this.ride = {
      leg: found.leg,
      reverse: found.reverse,
      from,
      to,
      s: 0,
      ticks: 0,
      placed: null,
      skipping: false,
      freezeOff: this.ports.addModifier(FERRY_SOURCE, { freeze: true }),
    };
    this.place();
    this.ports.emit('ferry.boarded', { routeId: found.leg.route.id, from, to });
    return null;
  }

  /** Skip to the next stop with a fade (the interact while seated, or K15's menu). */
  skip(): void {
    const r = this.ride;
    if (!r || r.skipping) return;
    r.skipping = true;
    const at = this.ports.landing(r.to) ?? r.leg.at(r.leg.length, r.reverse);
    const yaw = r.leg.at(r.leg.length, r.reverse).yaw;
    const job = this.ports.safeTeleport(at, yaw);
    if (!job) {
      this.arrive(true);
      return;
    }
    void job.then(
      (o) => {
        // `busy` (another safe teleport in flight) left the player on the boat: place them at the landing directly.
        if (this.ride === r) this.arrive(true, o?.ok === false && o.reason === 'busy');
      },
      () => {
        if (this.ride === r) this.arrive(true);
      },
    );
  }

  /** One fixed tick; `interactPressed` is this tick's interact edge (a skip once the ride is under way). */
  fixedUpdate(dt: number, interactPressed: boolean): void {
    const r = this.ride;
    if (!r || r.skipping) return;
    const f = this.ports.feet();
    if (r.placed && Math.hypot(f.x - r.placed.x, f.y - r.placed.y, f.z - r.placed.z) > TELEPORT_JUMP) {
      // Someone else's teleport (a cutscene, a script): the ride ends where they put the player.
      this.end();
      return;
    }
    r.ticks++;
    if (interactPressed && r.ticks > 1) {
      this.skip();
      return;
    }
    r.s += FERRY_SPEED * dt;
    if (r.s >= r.leg.length) {
      this.arrive(false);
      return;
    }
    this.place();
  }

  /** `save.loaded`: the loader already put the player at the stop the ride left from; drop the ride, no move. */
  reset(): void {
    if (this.ride) this.end();
  }

  private place(): void {
    const r = this.ride!;
    const p = r.leg.at(r.s, r.reverse);
    const feet = { x: p.x, y: p.y + DECK_HEIGHT, z: p.z };
    this.ports.showBoat(p);
    this.ports.teleport(feet, p.yaw);
    r.placed = feet;
  }

  private arrive(skipped: boolean, placeNow = true): void {
    const r = this.ride!;
    if (placeNow) {
      const at = this.ports.landing(r.to) ?? r.leg.at(r.leg.length, r.reverse);
      this.ports.teleport({ x: at.x, y: at.y, z: at.z }, r.leg.at(r.leg.length, r.reverse).yaw);
    }
    const routeId = r.leg.route.id;
    const stop = r.to;
    this.end();
    this.ports.emit('ferry.arrived', { routeId, stop, skipped });
  }

  private end(): void {
    const r = this.ride;
    if (!r) return;
    this.ride = null;
    r.freezeOff();
    this.ports.hideBoat();
    if (this.ports.movementMode() === 'ferry') this.ports.setMovementMode('walk');
  }

  private findLeg(from: string, to: string): { leg: FerryLeg; reverse: boolean } | null {
    for (const leg of this.legs.values()) {
      const [a, b] = leg.route.stops;
      if (a.id === from && b.id === to) return { leg, reverse: false };
      if (b.id === from && a.id === to) return { leg, reverse: true };
    }
    return null;
  }
}
