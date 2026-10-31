// The Frostfang chasm and moat's walker catch (PR 2, agreed with K7) and the Aerie's arrival watcher.
//
// Walker catch: a box trigger over each stretch of K1's two troughs, from under the lowest ground there up to the stretch's floor
// plus CATCH_ABOVE (K1's chasm catch floor is 5 m over its floor; the box reaches a little higher so a player standing on any
// carved floor is inside). A player who walked, fell or was knocked in is returned, with a fade, to the summit-aerie lip anchor,
// or to the Aerie's landing shelf when last grounded on the Aerie. It stands down while `movementMode` is `glide` or K7's
// `glide` service reports `catchArmed` (K7 PR 2's lane catch owns those players; a missing service reads false), so the two
// never double-fire. There is no fall damage, so nothing else is needed.
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

/** One box per stretch of each trough: across it the trough's half width plus its blend, along it the stretch plus a half width of overlap. */
export function catchVolumes(troughs: readonly TroughDef[], h: HeightFn): CatchVolume[] {
  const out: CatchVolume[] = [];
  for (const t of troughs) {
    for (let i = 1; i < t.points.length; i++) {
      const p = t.points[i - 1]!;
      const q = t.points[i]!;
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len === 0) continue;
      const d = { x: (q.x - p.x) / len, z: (q.z - p.z) / len };
      const across = t.halfWidth + t.blend;
      const along = len / 2 + t.halfWidth;
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      let low = Infinity;
      for (let u = -along; u <= along; u += 20) {
        for (let v = -across; v <= across; v += 20) low = Math.min(low, h(mid.x + d.x * u - d.z * v, mid.z + d.z * u + d.x * v));
      }
      const top = Math.max(p.floor, q.floor) + CATCH_ABOVE;
      const bottom = Math.min(low, p.floor, q.floor) - CATCH_BELOW;
      out.push({
        id: `trg.dragonspine.catch.${t.id}.${i}`,
        trough: t.id,
        centre: { x: mid.x, y: (top + bottom) / 2, z: mid.z },
        half: { x: across, y: (top - bottom) / 2, z: along },
        yaw: Math.atan2(d.x, d.z),
      });
    }
  }
  return out;
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

/** The stand-down rule agreed with K7: gliding, or K7's lane catch armed (a missing service reads false). */
export function standsDown(mode: string | undefined, glide: { catchArmed?: boolean } | undefined): boolean {
  return mode === 'glide' || glide?.catchArmed === true;
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
      if (a) this.ports.teleport(a.position, a.yaw);
      else this.ports.warn(`dragonspine: the walker catch's anchor "${ph.target}" is missing`);
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
    if (this.ports.standDown()) {
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

/** Is (x, z) on the Aerie (its plateau box grown by AERIE_MARGIN)? */
export const onAerieOf =
  (aerie: Rect) =>
  (p: XZ): boolean =>
    p.x >= aerie.minX - AERIE_MARGIN && p.x <= aerie.maxX + AERIE_MARGIN && p.z >= aerie.minZ - AERIE_MARGIN && p.z <= aerie.maxZ + AERIE_MARGIN;

/** K7's glide service, read without its type (K7 PR 2 provides it; it may be absent). */
const glideService = (ctx: Pick<CoreContext, 'services'>): { catchArmed?: boolean } | undefined =>
  (ctx.services.get as (name: string) => unknown)('glide') as { catchArmed?: boolean } | undefined;

/** Wires the walker catch and its triggers to a context; returns the catch and the remover. */
export function installWalkerCatch(
  ctx: Pick<CoreContext, 'player' | 'anchors' | 'services' | 'systems' | 'triggers' | 'hud'>,
  volumes: readonly CatchVolume[],
  aerie: Rect,
  heightAt: HeightFn,
): { walker: WalkerCatch; dispose: () => void } {
  const offs: Array<() => void> = [];
  for (const v of volumes) offs.push(ctx.triggers.add({ id: v.id, shape: { type: 'box', center: v.centre, half: v.half, yaw: v.yaw } }));
  const walker = new WalkerCatch({
    feet: () => ctx.player.feet,
    heightAt,
    standDown: () => standsDown(ctx.services.get('movementMode')?.current, glideService(ctx)),
    inCatch: (p) => inAnyVolume(volumes, p),
    onAerie: onAerieOf(aerie),
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
