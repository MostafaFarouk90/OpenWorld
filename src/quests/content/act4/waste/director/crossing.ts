// M42's crossing and M43's Storm Walk: the rope walks in a forced storm. M42: the gate arch writes the gate flag (the storm
// starts), each shelter's flap starts a 20 s storm-wall count that runs only while Cael stays in the shelter, and the camp's
// edge writes the camp flag (the storm ends). M43: the start stone starts the walk, the five knots are passed in order with
// a 20 s lee wait at knots 2 and 4, a stray too far off the line goes back to the last knot, and the knot-count bar at the end
// is L10's BeatRun (a miss widens, then assists). Never a fail; every count is in memory and restarts on a load.
import { heightAt } from '../../../../../terrain/heightfield';
import { SHELTER_SPOTS } from '../../../../../region/act4/ropeLines';
import type { Kit, Off } from '../../harrowmark/director/shared';
import { distanceTo, recheck, toast } from '../../harrowmark/director/shared';
import { BeatRun } from '../../harrowmark/director/beat';
import { createSongBar } from '../../../act3/greyfen/director/songBar';
import { L1 } from '../siteIds';
import { M42_CAMP, M42_CAMP_TRIGGER, M42_FLAP_USED, M42_GATE, M42_GATE_TRIGGER, M42_SHELTERED, M42_SHELTERS } from '../m42.quest';
import {
  M43_COUNT, M43_COUNT_FAILS, M43_DONE, M43_KNOT, M43_KNOTS, M43_LEE_DONE, M43_LEES, M43_WALKING,
} from '../m43.quest';

/** Seconds of a storm wall (M42's shelters, M43's lees). */
export const WALL_SECONDS = 20;
/** Metres round a lee cairn (a knot) that count as in its lee. */
export const LEE_RADIUS = 6;
/** Metres from a knot that pass it. */
export const KNOT_RADIUS = 5;
/** Metres off the start-to-end line beyond which a Storm Walk stray is sent back. */
/** Plan: straying more than 12 m from the rope for 6 s puts Cael back at the last knot. */
export const STRAY_M = 12;
export const STRAY_S = 6;
export const M43_BEAT = 'waste.q.m43.beat';

const player = (k: Kit, id: string): boolean => id === 'player' || id === k.ctx.player.actor?.id;
const yawOf = (k: Kit): number => k.ctx.player.facingYaw ?? 0;

/** Cael stands inside shelter `id` (L3's tracker when it runs; else the shelter's own radius). */
export function inShelter(k: Kit, id: string): boolean {
  const w = k.ctx.services.get('weather');
  if (w && w.onShelter(id)) return true;
  const s = SHELTER_SPOTS.find((x) => x.id === id);
  if (!s) return false;
  const f = k.ctx.player.feet;
  return Math.hypot(f.x - s.at.x, f.z - s.at.z) <= s.radius;
}

/** A storm-wall count: runs only while `inside()`; toasts once on start, on a pause and at the end. */
export class WallCount {
  left = WALL_SECONDS;
  private paused = false;
  private started = false;
  constructor(private readonly k: Kit, private readonly keys: { wall: string; paused: string; passed: string }) {}
  /** Advances by `dt` seconds; true once the wall has passed. */
  step(dt: number, inside: boolean): boolean {
    if (!this.started) { this.started = true; toast(this.k, this.keys.wall); }
    if (!inside) {
      if (!this.paused) this.paused = true;
      return false;
    }
    if (this.paused) { this.paused = false; toast(this.k, this.keys.paused); }
    this.left -= dt;
    if (this.left > 0) return false;
    toast(this.k, this.keys.passed);
    return true;
  }
}

export function installM42(k: Kit): void {
  k.on('trigger.enter', (e) => {
    if (!player(k, e.actorId) || !k.active('m42')) return;
    if (e.triggerId === M42_GATE_TRIGGER && !k.flag(M42_GATE) && k.objCurrent('m42', 'gate')) {
      k.set(M42_GATE);
      toast(k, 'waste.q.m42.storm');
    }
    if (e.triggerId === M42_CAMP_TRIGGER && !k.flag(M42_CAMP) && k.objCurrent('m42', 'camp')) {
      k.set(M42_CAMP);
      toast(k, 'waste.q.m42.camp');
    }
  });
  // a shelter's wall: from the flap pulled to 20 s spent inside
  let count: { n: number; c: WallCount } | null = null;
  const POLL = 15;
  k.every(POLL, () => {
    if (!k.active('m42')) { count = null; return; }
    const n = M42_SHELTERS.findIndex((_, i) => k.objCurrent('m42', `shelter${i + 1}`)) + 1;
    if (n === 0 || !k.flag(M42_FLAP_USED(n)) || k.flag(M42_SHELTERED(n))) { count = null; return; }
    if (count?.n !== n) count = { n, c: new WallCount(k, { wall: 'waste.q.m42.wall', paused: 'waste.q.m42.paused', passed: 'waste.q.m42.passed' }) };
    if (count.c.step(POLL / 60, inShelter(k, M42_SHELTERS[n - 1]!))) {
      k.set(M42_SHELTERED(n));
      count = null;
      k.later(() => recheck(k));
    }
  });
  k.on('save.loaded', () => { count = null; });
}

/** The Storm Walk's next knot, and whether its lee still holds Cael (pure, for the tests). */
export function walkStep(knot: number, leeDone: (n: number) => boolean): { next: number; lee: boolean } {
  const lee = (M43_LEES as readonly number[]).includes(knot) && !leeDone(knot);
  return { next: knot + 1, lee };
}

/** Metres from the point to the segment a to b (on the ground plane). */
export function offLine(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export function installStormWalk(k: Kit, now: () => number = () => performance.now()): Off {
  const pos = (id: string) => k.ctx.anchors.find(id)?.position ?? null;
  const knot = (): number => k.num(M43_KNOT);
  let lee: { n: number; c: WallCount } | null = null;
  let strayed = 0;
  /** The guide rope: the stone, the five knots, the end. */
  const rope = () => [L1.stormWalkStart, ...Array.from({ length: M43_KNOTS }, (_, i) => L1.stormWalkKnot(i + 1)), L1.stormWalkEnd]
    .map(pos).filter((x): x is NonNullable<typeof x> => !!x);
  const offRope = (p: { x: number; z: number }): number => {
    const pts = rope();
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) best = Math.min(best, offLine(p, pts[i - 1]!, pts[i]!));
    return best;
  };
  const can = (): boolean => k.active('m43') && k.objDone('m43', 'walkTalk') && !k.flag(M43_DONE.walk);

  const back = (): void => {
    const n = knot();
    const at = pos(n > 0 ? L1.stormWalkKnot(n) : L1.stormWalkStart);
    if (!at) return;
    k.ctx.player.teleport({ x: at.x, y: heightAt(at.x, at.z) + 0.05, z: at.z }, yawOf(k));
    toast(k, 'waste.q.m43.stray');
  };
  const POLL = 10;
  k.every(POLL, () => {
    if (!can()) { if (k.flag(M43_WALKING)) k.clear(M43_WALKING); lee = null; return; }
    if (!k.flag(M43_WALKING)) {
      if (knot() < M43_KNOTS && distanceTo(k, L1.stormWalkStart) <= 4) {
        k.set(M43_KNOT, 0);
        k.set(M43_WALKING);
        toast(k, 'waste.q.m43.walk');
      }
      return;
    }
    const n = knot();
    if (n >= M43_KNOTS) return; // at the end: the count waits for Cael
    // a lee holds Cael at its knot until the wall has passed
    const here = walkStep(n, (x) => k.flag(M43_LEE_DONE(x)));
    if (n > 0 && here.lee) {
      if (lee?.n !== n) lee = { n, c: new WallCount(k, { wall: 'waste.q.m43.lee', paused: 'waste.q.m43.leeBack', passed: 'waste.q.m43.leePassed' }) };
      if (lee.c.step(POLL / 60, distanceTo(k, L1.stormWalkKnot(n)) <= LEE_RADIUS)) { k.set(M43_LEE_DONE(n)); lee = null; }
      return;
    }
    strayed = offRope(k.ctx.player.feet) > STRAY_M ? strayed + POLL / 60 : 0;
    if (strayed >= STRAY_S) { strayed = 0; back(); return; }
    if (distanceTo(k, L1.stormWalkKnot(n + 1)) <= KNOT_RADIUS) {
      k.set(M43_KNOT, n + 1);
      toast(k, n + 1 === M43_KNOTS ? 'waste.q.m43.end' : 'waste.q.m43.knot');
    }
  });
  // a load drops the walk: it starts again from the stone (the lees and the knots with it)
  k.on('save.loaded', () => {
    lee = null;
    strayed = 0;
    if (!k.flag(M43_DONE.walk)) {
      k.clear(M43_WALKING);
      k.clear(M43_KNOT);
      for (const n of M43_LEES) k.clear(M43_LEE_DONE(n));
    }
  });

  // the count at the end of the rope: L10's beat bar (a miss restarts the bar, never the walk)
  const run = new BeatRun({
    now, prefix: M43_BEAT, toast: (key) => toast(k, key),
    fails: () => k.num(M43_COUNT_FAILS), failed: () => k.set(M43_COUNT_FAILS, k.num(M43_COUNT_FAILS) + 1),
    done: () => {
      if (k.flag(M43_DONE.walk)) return;
      k.set(M43_DONE.walk);
      k.clear(M43_WALKING);
      k.set(M43_COUNT_FAILS, 0);
      k.later(() => recheck(k));
    },
  });
  k.on('interact', (e) => {
    if (e.action !== 'interact' || e.interactableId !== M43_COUNT || !can() || knot() < M43_KNOTS) return;
    run.press(1);
  });
  k.every(6, () => run.update());
  k.on('save.loaded', () => run.reset());
  const hud = (k.ctx as unknown as { hud?: { mount(slot: string, w: unknown): () => void } }).hud;
  const bar = createSongBar(typeof document === 'undefined' ? null : (document as never), () => run.view(), (key) => k.ctx.strings.t(key.replace('greyfen.q.r13.bar.', `${M43_BEAT}.bar.`)));
  return bar && hud ? hud.mount('bottom-center', { ...bar, id: `${M43_BEAT}.bar` }) : () => {};
}
