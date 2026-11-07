// M50 in N2's Cooling Hall: each channel's three sluice wheels turned in the chart's order before the heat gauge fills. Entering
// the chamber (N2's whole-room trigger) starts the gauge while the channel is the current step; leaving it resets that channel.
// A wrong wheel adds heat; a full gauge vents steam (Cael is pushed back to the chamber's checkpoint, loses 10% of his health but
// never below 10%) and resets the channel only; after two fails the chart glows the next wheel (the lesson). The order and the
// fails are pure (`CoolingChannel`), so the tests drive them without a game.
import type { DocumentLike } from '../../../../../hud/dom';
import { PressureBar } from '../../../../../hud/PressureBar';
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck, toast } from '../../../act4/harrowmark/director/shared';
import {
  M50_CHAMBER_TRIGGER, M50_CHANNELS, M50_CHANNEL_DONE, M50_CHECKPOINT, M50_COOL_SCENE, M50_GAUGE_ID, M50_GAUGE_S, M50_LESSON_AFTER, M50_ORDER,
  M50_STEAM_PCT, M50_WHEEL, M50_WRONG_S, type M50Channel,
} from '../m50.quest';
import { LOG, isPlayer, playWhenCurrent } from './generic';

export type WheelOutcome = 'right' | 'wrong' | 'routed' | 'idle';

/** One channel's run: the wheels pressed so far in the chart's order, the heat, the fails (saved as a flag by the director). */
export class CoolingChannel {
  private next = 0;
  private heat = 0;
  running = false;
  constructor(readonly c: M50Channel, public fails = 0) {}

  /** Seconds left before the steam. */
  get remaining(): number { return Math.max(0, M50_GAUGE_S - this.heat); }
  /** The wheel the chart glows once the lesson is on, else null. */
  get hint(): 1 | 2 | 3 | null { return this.running && this.fails >= M50_LESSON_AFTER ? M50_ORDER[this.c][this.next]! : null; }

  start(): void { if (!this.running) { this.running = true; this.next = 0; this.heat = 0; } }
  /** Leaving the chamber, a load: the channel resets with no fail. */
  reset(): void { this.running = false; this.next = 0; this.heat = 0; }

  press(w: 1 | 2 | 3): WheelOutcome {
    if (!this.running) return 'idle';
    if (M50_ORDER[this.c][this.next] !== w) { this.heat += M50_WRONG_S; return 'wrong'; }
    this.next++;
    if (this.next < 3) return 'right';
    this.running = false;
    return 'routed';
  }

  /** Advances the heat; true when the gauge is full (the steam vents, the channel resets, one fail is counted). */
  tick(dt: number): boolean {
    if (!this.running) return false;
    this.heat += dt;
    if (this.heat < M50_GAUGE_S) return false;
    this.fails++;
    this.running = false;
    this.next = 0;
    this.heat = 0;
    return true;
  }
}

export const M50_FAILS = (c: M50Channel): string => `story.m50.fails.${c}`;
const DT = 0.1;

export function installM50(k: Kit): Off {
  const ch = new Map<M50Channel, CoolingChannel>(M50_CHANNELS.map((c) => [c, new CoolingChannel(c, k.num(M50_FAILS(c)))]));
  const current = (c: M50Channel): boolean => k.active('m50') && k.objCurrent('m50', `chan${c}`);

  const steam = (c: M50Channel): void => {
    toast(k, 'rim.q.m50.steam');
    k.set(M50_FAILS(c), ch.get(c)!.fails);
    const a = k.ctx.player.actor;
    if (a && !a.dead) {
      const floor = a.maxHealth * M50_STEAM_PCT;
      const amount = Math.min(a.maxHealth * M50_STEAM_PCT, Math.max(0, a.health - floor));
      if (amount > 0) k.ctx.damage.apply({ attackerId: null, targetId: a.id, amount, poise: 0, kind: 'script', unblockable: true, attackId: 'm50.steam' });
    }
    const cp = k.ctx.anchors.find(M50_CHECKPOINT(c));
    if (cp) k.ctx.player.teleport({ x: cp.position.x, y: cp.position.y + 0.05, z: cp.position.z }, cp.yaw ?? 0);
    if (ch.get(c)!.fails >= M50_LESSON_AFTER) toast(k, 'rim.q.m50.lesson');
  };

  k.on('trigger.enter', (e) => {
    if (!isPlayer(k, e.actorId)) return;
    for (const c of M50_CHANNELS) if (e.triggerId === M50_CHAMBER_TRIGGER(c) && current(c)) ch.get(c)!.start();
  });
  k.on('trigger.exit', (e) => {
    if (!isPlayer(k, e.actorId)) return;
    for (const c of M50_CHANNELS) if (e.triggerId === M50_CHAMBER_TRIGGER(c)) ch.get(c)!.reset();
  });
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('m50')) return;
    for (const c of M50_CHANNELS) {
      for (const w of [1, 2, 3] as const) {
        if (e.interactableId !== M50_WHEEL(c, w)) continue;
        const run = ch.get(c)!;
        if (!run.running && current(c)) run.start(); // a press inside the chamber before its trigger fired
        const r = run.press(w);
        if (r === 'wrong') toast(k, 'rim.q.m50.wrong');
        else if (r === 'right') toast(k, run.hint ? 'rim.q.m50.lesson' : 'rim.q.m50.right');
        else if (r === 'routed') {
          toast(k, 'rim.q.m50.routed');
          k.set(M50_CHANNEL_DONE(c));
          k.later(() => recheck(k));
        }
      }
    }
  });
  k.every(6, () => { for (const [c, run] of ch) if (run.tick(DT)) steam(c); });
  k.on('save.loaded', () => { for (const [c, run] of ch) { run.reset(); run.fails = k.num(M50_FAILS(c)); } });
  playWhenCurrent(k, { quest: 'm50', objective: 'cool', scene: M50_COOL_SCENE });

  // the gauge on the shipped PressureBar (its own instance, watching only the three channel ids)
  const hud = (k.ctx as unknown as { hud?: { mount(slot: string, w: unknown, order?: number): () => void } }).hud;
  if (!hud || typeof document === 'undefined') return () => {};
  try {
    const bar = new PressureBar(document as unknown as DocumentLike, {
      ids: M50_CHANNELS.map(M50_GAUGE_ID),
      pressure: (id) => {
        const run = M50_CHANNELS.map((c) => ch.get(c)!).find((r) => M50_GAUGE_ID(r.c) === id);
        return run?.running ? { remaining: run.remaining, total: M50_GAUGE_S } : null;
      },
      t: (key, p) => k.ctx.strings.t(key === 'hud.pressure.label' ? 'rim.q.m50.gauge' : key, p),
    });
    return hud.mount('top-center', bar, 3);
  } catch (err) {
    k.warn(`${LOG} M50: the heat gauge did not mount: ${String(err)}`);
    return () => {};
  }
}
