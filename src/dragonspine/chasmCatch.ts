// The Frostfang chasm and moat's walker catch (PR 2, agreed with K7) and the Aerie's arrival watcher.
//
// Walker catch: a box over each stretch of K1's two troughs (clipped to SUMMIT_BOX), from under the lowest ground there up to the
// stretch's floor plus CATCH_ABOVE (K1's chasm catch floor is 5 m over its floor; the box reaches a little higher so a player standing
// on any carved floor is inside). A player who walked, fell or was knocked in is returned, with a fade, to CATCH_BACK behind the
// summit-aerie lip anchor (on its deck's flat stand), or behind the Aerie's landing anchor when last grounded on the Aerie or on
// K1's summit-aerie landing area. It stands down while `movementMode` is `glide` or K7's `glide` service reports `catchArmed` (K7
// PR 2's lane catch owns those players; a missing service reads false), so the two never double-fire, and, like the containment
// push, inside an interior, while a save loads, during waystone travel and while the player is dead. A missing return anchor turns
// it off with one warning. There is no fall damage, so nothing else is needed.
//
// Arrival watcher: while the player is inside `trg.dragonspine.aerie.arrival`, `waystone.frostfang-aerie` is attuned with
// `waystones.rekindle('frostfang-aerie', 'script')`: on entering, every tick after (a waystones plugin that sets up late), and on
// `save.loaded` (a save made on the Aerie before the stone was lit), so a player can always leave mid-dungeon.
import type { CoreContext } from '../region/coreTypes';
import type { TroughDef } from '../terrain/shaping';
import type { HeightFn, Rect, XZ } from './inputs';

/** The catch box reaches this far over the higher floor of its stretch. */
export const CATCH_ABOVE = 10;
/** And this far under the lower of its floors and the lowest ground sampled in it. */
const CATCH_BELOW = 20;
/** Seconds a player stays in a catch volume (not standing down) before the catch fires. */
export const CATCH_HOLD = 0.4;
export const CATCH_FADE_OUT = 0.3;
export const CATCH_FADE_IN = 0.4;
/** Feet within this of the ground count as grounded (for "last grounded on the Aerie"). */
const GROUNDED = 1;
/** The Aerie counts this far past its plateau's edge. */
const AERIE_MARGIN = 20;

export const CATCH_LIP_ANCHOR = 'dragonspine.glide.summit-aerie.launch';
/**
 * The catch puts the player this far behind the anchor (against its facing), level with it: on the lip's deck that is on the flat
 * stand (the deck runs STAND_BACK behind the lip), so a player still holding forward when the freeze lifts does not walk off the edge.
 */
export const CATCH_BACK = 2.5;
export const CATCH_AERIE_ANCHOR = 'dragonspine.aerie.landing';
export const AERIE_ARRIVAL_TRIGGER = 'trg.dragonspine.aerie.arrival';
export const AERIE_WAYSTONE_ID = 'frostfang-aerie';

export interface CatchVolume {
  id: string;
  trough: string;
  centre: { x: number; y: number; z: number };
  half: { x: number; y: number; z: number };
  /** TriggerVolumes' box yaw: local z runs along the stretch. */
  yaw: number;
}

/** The box a catch volume may fill: x and z bounds (the summit box, so the catch never fires in the lower area). */
export interface ClipBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * One box per stretch of each trough: across it the trough's half width plus its blend, along it the stretch plus a half width of
 * overlap, then shortened at either end so that every corner stays inside `clip` (SUMMIT_BOX: K1's chasm runs on to the world edge
 * at z 17000, past the summit's z 16900). The band is kept whole up to the clip's edge, since it is what separates the summit's
 * north lowland from the Aerie side's.
 */
export function catchVolumes(troughs: readonly TroughDef[], h: HeightFn, clip: ClipBox): CatchVolume[] {
  const out: CatchVolume[] = [];
  for (const t of troughs) {
    for (let i = 1; i < t.points.length; i++) {
      const p = t.points[i - 1]!;
      const q = t.points[i]!;
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len === 0) continue;
      const d = { x: (q.x - p.x) / len, z: (q.z - p.z) / len };
      const across = t.halfWidth + t.blend;
      const mid0 = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      let uMin = -(len / 2 + t.halfWidth);
      let uMax = len / 2 + t.halfWidth;
      // Corner x is mid.x + d.x u + |d.z| across at most (and mid.x + d.x u - |d.z| across at least); z alike.
      const side = (m: number, du: number, reach: number, lo: number, hi: number): void => {
        for (const [bound, sign] of [[hi, 1], [lo, -1]] as const) {
          const room = sign * (bound - m) - reach;
          const k = sign * du;
          if (Math.abs(k) < 1e-9) {
            if (room < 0) uMax = uMin - 1;
          } else if (k > 0) uMax = Math.min(uMax, room / k);
          else uMin = Math.max(uMin, room / k);
        }
      };
      side(mid0.x, d.x, Math.abs(d.z) * across, clip.x0, clip.x1);
      side(mid0.z, d.z, Math.abs(d.x) * across, clip.z0, clip.z1);
      if (uMax <= uMin) continue;
      const along = (uMax - uMin) / 2;
      const mid = { x: mid0.x + d.x * (uMin + along), z: mid0.z + d.z * (uMin + along) };
      let low = Infinity;
      for (let u = -along; u <= along; u += 20) {
        for (let v = -across; v <= across; v += 20) low = Math.min(low, h(mid.x + d.x * u - d.z * v, mid.z + d.z * u + d.x * v));
      }
      const top = Math.max(p.floor, q.floor) + CATCH_ABOVE;
      const bottom = Math.min(low, p.floor, q.floor) - CATCH_BELOW;
      const v: CatchVolume = {
        id: `trg.dragonspine.catch.${t.id}.${i}`,
        trough: t.id,
        centre: { x: mid.x, y: (top + bottom) / 2, z: mid.z },
        half: { x: across, y: (top - bottom) / 2, z: along },
        yaw: Math.atan2(d.x, d.z),
      };
      out.push(v);
      // Clipped at the box's north edge on a skewed stretch: the yawed end leaves two thin corners short of z1. An unyawed cap fills
      // them, so the band reaches z1 all the way across.
      const cap = 2 * Math.abs(d.x) * across;
      const corners = volumeCorners(v);
      if (d.z > 0 && cap > 1e-6 && Math.abs(Math.max(...corners.map((c) => c.z)) - clip.z1) < 1e-6) {
        const xs = corners.map((c) => c.x);
        const x0 = Math.max(clip.x0, Math.min(...xs));
        const x1 = Math.min(clip.x1, Math.max(...xs));
        out.push({ id: `${v.id}.cap`, trough: t.id, centre: { x: (x0 + x1) / 2, y: v.centre.y, z: clip.z1 - cap / 2 }, half: { x: (x1 - x0) / 2, y: v.half.y, z: cap / 2 }, yaw: 0 });
      }
    }
  }
  return out;
}

/** The four ground corners of a catch volume (tests). */
export function volumeCorners(v: CatchVolume): Array<{ x: number; z: number }> {
  const d = { x: Math.sin(v.yaw), z: Math.cos(v.yaw) };
  return [-1, 1].flatMap((su) => [-1, 1].map((sv) => ({ x: v.centre.x + d.x * su * v.half.z - d.z * sv * v.half.x, z: v.centre.z + d.z * su * v.half.z + d.x * sv * v.half.x })));
}

/** The same test as TriggerVolumes' yawed box. */
export function inVolume(v: CatchVolume, p: { x: number; y: number; z: number }): boolean {
  const dx = p.x - v.centre.x;
  const dz = p.z - v.centre.z;
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  return Math.abs(dx * c - dz * s) <= v.half.x && Math.abs(p.y - v.centre.y) <= v.half.y && Math.abs(dx * s + dz * c) <= v.half.z;
}

export const inAnyVolume = (vs: readonly CatchVolume[], p: { x: number; y: number; z: number }): boolean => vs.some((v) => inVolume(v, p));

/** Where a caught player goes: the Aerie's landing shelf if they were last grounded on the Aerie, else the summit-aerie lip. */
export const catchTarget = (lastOnAerie: boolean): string => (lastOnAerie ? CATCH_AERIE_ANCHOR : CATCH_LIP_ANCHOR);

/** Where a caught player lands: CATCH_BACK behind the anchor (yaw 0 faces -Z, so behind is +(sin yaw, cos yaw)). */
export const returnPoint = (p: { x: number; y: number; z: number }, yaw: number): { x: number; y: number; z: number } => ({
  x: p.x + Math.sin(yaw) * CATCH_BACK,
  y: p.y,
  z: p.z + Math.cos(yaw) * CATCH_BACK,
});

/** The stand-down rule agreed with K7: gliding, or K7's lane catch armed (a missing service reads false). */
export function standsDown(mode: string | undefined, glide: { catchArmed?: boolean } | undefined): boolean {
  return mode === 'glide' || glide?.catchArmed === true;
}

/** The containment push's own stand-downs (containmentSystem.ts): inside an interior, a save loading, waystone travel, dead. */
export function busyElsewhere(ctx: Pick<CoreContext, 'services' | 'player'>): boolean {
  if (ctx.services.get('interiors')?.current) return true;
  if (ctx.services.get('save')?.loading || ctx.services.get('waystones')?.travelling) return true;
  return Boolean(ctx.player.actor?.dead);
}

export interface CatchPorts {
  feet(): { x: number; y: number; z: number };
  heightAt: HeightFn;
  standDown(): boolean;
  inCatch(p: { x: number; y: number; z: number }): boolean;
  onAerie(p: XZ): boolean;
  anchor(id: string): { position: { x: number; y: number; z: number }; yaw: number } | undefined;
  fade(opacity: number, seconds: number): void;
  teleport(p: { x: number; y: number; z: number }, yaw: number): void;
  /** Freezes the player; returns the release. */
  freeze(): () => void;
  warn(msg: string): void;
}

type Phase = { kind: 'idle' } | { kind: 'out'; t: number; target: string; release: () => void } | { kind: 'in'; t: number; release: () => void };

/** The walker catch's state machine, one `update(dt)` per fixed tick. */
export class WalkerCatch {
  private held = 0;
  private phase: Phase = { kind: 'idle' };
  /** True when the player was last grounded on the Aerie. */
  lastOnAerie = false;
  /** Catches fired (tests, the service). */
  catches = 0;
  lastTarget: string | null = null;
  /** Set when a return anchor was missing: the catch stands down for good (one warning). */
  broken = false;

  constructor(private readonly ports: CatchPorts) {}

  get busy(): boolean {
    return this.phase.kind !== 'idle';
  }

  update(dt: number): void {
    const ph = this.phase;
    if (ph.kind === 'out') {
      ph.t += dt;
      if (ph.t < CATCH_FADE_OUT) return;
      const a = this.ports.anchor(ph.target);
      if (a) this.ports.teleport(returnPoint(a.position, a.yaw), a.yaw);
      else {
        // Warn once and stop: without its return point the catch would fade the player in place every second.
        this.ports.warn(`dragonspine: the walker catch's anchor "${ph.target}" is missing; the catch is off`);
        this.broken = true;
      }
      this.ports.fade(0, CATCH_FADE_IN);
      this.phase = { kind: 'in', t: 0, release: ph.release };
      return;
    }
    if (ph.kind === 'in') {
      ph.t += dt;
      if (ph.t >= CATCH_FADE_IN) {
        ph.release();
        this.phase = { kind: 'idle' };
      }
      return;
    }
    const p = this.ports.feet();
    if (this.broken || this.ports.standDown()) {
      this.held = 0;
      return;
    }
    if (this.ports.inCatch(p)) {
      this.held += dt;
      if (this.held + 1e-9 < CATCH_HOLD) return;
      this.held = 0;
      const target = catchTarget(this.lastOnAerie);
      this.catches++;
      this.lastTarget = target;
      this.ports.fade(1, CATCH_FADE_OUT);
      this.phase = { kind: 'out', t: 0, target, release: this.ports.freeze() };
      return;
    }
    this.held = 0;
    if (p.y - this.ports.heightAt(p.x, p.z) <= GROUNDED) this.lastOnAerie = this.ports.onAerie(p);
  }

  /** Lifts any fade and freeze (teardown). */
  dispose(): void {
    if (this.phase.kind !== 'idle') {
      this.phase.release();
      this.ports.fade(0, 0);
    }
    this.phase = { kind: 'idle' };
  }
}

/** Is (x, z) on the Aerie: its plateau box grown by AERIE_MARGIN, or one of K1's summit-aerie landing areas (the shelf west of it)? */
export const onAerieOf =
  (aerie: Rect, landings: readonly { x0: number; x1: number; z0: number; z1: number }[] = []) =>
  (p: XZ): boolean =>
    (p.x >= aerie.minX - AERIE_MARGIN && p.x <= aerie.maxX + AERIE_MARGIN && p.z >= aerie.minZ - AERIE_MARGIN && p.z <= aerie.maxZ + AERIE_MARGIN) ||
    landings.some((l) => p.x >= l.x0 && p.x <= l.x1 && p.z >= l.z0 && p.z <= l.z1);

/** K7's glide service, read without its type (K7 PR 2 provides it; it may be absent). */
const glideService = (ctx: Pick<CoreContext, 'services'>): { catchArmed?: boolean } | undefined =>
  (ctx.services.get as (name: string) => unknown)('glide') as { catchArmed?: boolean } | undefined;

/**
 * Wires the walker catch to a context; returns the catch and the remover. The volumes are tested directly on the feet each tick
 * (the same yawed-box test as TriggerVolumes), so they are not registered as triggers.
 */
export function installWalkerCatch(
  ctx: Pick<CoreContext, 'player' | 'anchors' | 'services' | 'systems' | 'hud'>,
  volumes: readonly CatchVolume[],
  onAerie: (p: XZ) => boolean,
  heightAt: HeightFn,
): { walker: WalkerCatch; dispose: () => void } {
  const offs: Array<() => void> = [];
  const walker = new WalkerCatch({
    feet: () => ctx.player.feet,
    heightAt,
    standDown: () => standsDown(ctx.services.get('movementMode')?.current, glideService(ctx)) || busyElsewhere(ctx),
    inCatch: (p) => inAnyVolume(volumes, p),
    onAerie,
    anchor: (id) => {
      const a = ctx.anchors.find(id);
      return a ? { position: a.position, yaw: a.yaw } : undefined;
    },
    fade: (o, s) => void ctx.hud.fade(o, s),
    teleport: (p, yaw) => void ctx.player.teleport({ x: p.x, y: p.y, z: p.z }, yaw),
    freeze: () => ctx.player.addMoveModifier('dragonspine.catch', { freeze: true }),
    warn: (m) => console.warn(m),
  });
  offs.push(ctx.systems.add({ id: 'dragonspine.walker-catch', fixedPhase: 'rules', order: 0, fixedUpdate: (dt: number) => walker.update(dt) }));
  offs.push(() => walker.dispose());
  return { walker, dispose: () => offs.splice(0).reverse().forEach((o) => o()) };
}

/** The arrival box's test on the player's feet: inside the Aerie plateau's box and within its half-height of the ground. */
export const ARRIVAL_HALF_Y = 30;
export const onShelfOf =
  (aerie: Rect, h: HeightFn) =>
  (p: { x: number; y: number; z: number }): boolean =>
    p.x >= aerie.minX && p.x <= aerie.maxX && p.z >= aerie.minZ && p.z <= aerie.maxZ && Math.abs(p.y - h(p.x, p.z)) <= ARRIVAL_HALF_Y;

/**
 * Attunes the Aerie waystone while the player is on the shelf (entering, every tick, after a load). Returns the remover. The
 * trigger's inside state is read, and the feet are tested against the same box too, so a tick before the trigger system has run
 * (straight after a teleport or a load) still counts.
 */
export function watchAerieArrival(ctx: Pick<CoreContext, 'services' | 'systems' | 'triggers' | 'events' | 'player'>, onShelf: (p: { x: number; y: number; z: number }) => boolean): () => void {
  const check = (): void => {
    if (!ctx.triggers.isInside(AERIE_ARRIVAL_TRIGGER) && !onShelf(ctx.player.feet)) return;
    const ws = ctx.services.get('waystones');
    if (!ws || ws.isLit(AERIE_WAYSTONE_ID)) return;
    ws.rekindle(AERIE_WAYSTONE_ID, 'script');
  };
  const offs = [
    ctx.events.on('trigger.enter', ({ triggerId }) => {
      if (triggerId === AERIE_ARRIVAL_TRIGGER) check();
    }),
    ctx.events.on('save.loaded', () => check()),
    ctx.systems.add({ id: 'dragonspine.aerie-arrival', fixedPhase: 'rules', order: 1, fixedUpdate: check }),
  ];
  return () => offs.splice(0).reverse().forEach((o) => o());
}
