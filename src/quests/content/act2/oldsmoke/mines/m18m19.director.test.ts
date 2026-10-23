// Wenna's route guide (the pure walker, then the installer against stub services on the real event bus and flag store), the
// sealed door and the shortcut gate, the nursery and Bellows scenes. No scene, no physics: the figure is a recorder.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { FIXED_TIMESTEP } from '../../../../../config/constants';
import { WorldState } from '../../../../../state/WorldState';
import type { QuestState } from '../../../../types';
import { makeKit, type Off } from '../../director/kit';
import { GUIDE, WennaGuide, guidePoints, type P3 } from './m19Route';
import type { FigureMode, GuideFigure } from './m19Figure';
import {
  installM18, installM19, M18_INTERIOR, M19_ARRIVED_FLAG, M19_DOOR_BLOCKER, M19_GATE_BLOCKER, M19_GUIDE_BARKS_FLAG, M19_GUIDE_NODE_FLAG, M19_INTERIOR, SHORTCUT_FLAG,
} from './m18m19.director';
import { M18_SCENE } from './m18.quest';
import { M19_DOOR_OPEN_FLAG, M19_NURSERY_TRIGGER, M19_SCENE, M19_SECTION } from './m19.quest';

const pt = (x: number, z = 0, y = 0): P3 => ({ x, y, z });
/** A straight route of nine nodes, ten metres apart along +x (length 80). */
const LINE = Array.from({ length: 9 }, (_, i) => pt(i * 10));
const DT = FIXED_TIMESTEP;

/** Runs the guide for `seconds` with the player at `at(t)`; returns every event. */
function run(g: WennaGuide, seconds: number, at: (t: number) => P3, hold = false) {
  const events: ReturnType<WennaGuide['update']> = [];
  for (let t = 0; t < seconds; t += DT) events.push(...g.update(DT, at(t), hold));
  return events;
}

describe('WennaGuide (pure)', () => {
  it('walks at the route-follow pace beside the player', () => {
    const g = new WennaGuide(LINE);
    run(g, 5, () => pt(g.s));
    expect(g.s).toBeCloseTo(5 * GUIDE.walkMps, 0);
    expect(g.state).toBe('walk');
  });

  it('stops when the player is more than 8 m behind, and barks every 20 seconds while she waits', () => {
    const g = new WennaGuide(LINE);
    const ev = run(g, 45, () => pt(0));
    expect(g.s).toBeGreaterThan(GUIDE.followRadius - 0.1);
    expect(g.s).toBeLessThan(GUIDE.followRadius + 0.1);
    expect(g.state).toBe('wait');
    expect(ev.filter((e) => e.type === 'waitBark')).toHaveLength(2);
    expect(ev.find((e) => e.type === 'waitBark')).toEqual({ type: 'waitBark', reason: 'behind' });
  });

  it('resumes when the player catches up, and the bark timer starts over', () => {
    const g = new WennaGuide(LINE);
    run(g, 15, () => pt(0));
    const stopped = g.s;
    let x = 0;
    run(g, 2, () => pt((x = Math.min(x + 0.1, g.s - 3)))); // the player walks up to within 3 m of her
    expect(g.s).toBeGreaterThan(stopped + 1.5);
    run(g, 6, () => pt(x)); // she walks off again and stops, 15 s of waiting already behind her at the first stop
    expect(run(g, 15, () => pt(x)).filter((e) => e.type === 'waitBark')).toHaveLength(0); // the timer started over: not 20 s yet
  });

  it('hurries when the player runs ahead of her, even beyond 8 m', () => {
    const g = new WennaGuide(LINE);
    run(g, 1, () => pt(g.s));
    const before = g.s;
    // the player jogs away 0.1 m a tick: 6 m/s, never a jump
    let x = g.s;
    run(g, 3, () => (x += 0.1, pt(x)));
    expect(g.state).toBe('hurry');
    expect(g.s - before).toBeGreaterThan(3 * GUIDE.walkMps + 1);
    expect(g.s - before).toBeLessThanOrEqual(3 * GUIDE.hurryMps + 0.01);
    expect(horizontal(pt(x), g.position())).toBeGreaterThan(GUIDE.followRadius);
  });

  it('re-places her at the node behind the player after a teleport', () => {
    const g = new WennaGuide(LINE);
    run(g, 2, () => pt(g.s));
    g.update(DT, pt(47)); // one tick: from about 4 m to 47 m
    expect(Math.floor(g.s / 10)).toBe(4);
    expect(g.s).toBeLessThan(40.1);
    g.update(DT, pt(12));
    expect(g.s).toBeLessThan(10.1); // a teleport back re-places her behind the player too
    expect(g.s).toBeGreaterThanOrEqual(10);
  });

  it('a teleport off the route leaves her where she is, and the walk pauses without a bark', () => {
    const g = new WennaGuide(LINE);
    run(g, 3, () => pt(g.s));
    const s = g.s;
    const ev = run(g, 60, () => pt(200, 200));
    expect(g.s).toBe(s);
    expect(g.state).toBe('away');
    expect(ev).toEqual([]);
  });

  it('hold freezes her without a bark', () => {
    const g = new WennaGuide(LINE);
    run(g, 2, () => pt(g.s));
    const s = g.s;
    const ev = run(g, 60, () => pt(g.s), true);
    expect(g.s).toBe(s);
    expect(g.state).toBe('hold');
    expect(ev).toEqual([]);
  });

  it('stops short of a limit (the sealed door), barks about it, and goes on when it is lifted', () => {
    const g = new WennaGuide(LINE);
    g.setLimit(55);
    const ev = run(g, 60, () => pt(g.s));
    expect(g.s).toBeCloseTo(55 - GUIDE.limitMarginM, 5);
    expect(ev.filter((e) => e.type === 'waitBark').every((e) => (e as { reason: string }).reason === 'limit')).toBe(true);
    expect(ev.filter((e) => e.type === 'waitBark').length).toBeGreaterThanOrEqual(1);
    g.setLimit(null);
    run(g, 30, () => pt(g.s));
    expect(g.done).toBe(true);
  });

  it('a teleport past a limit re-places her at the last node before it', () => {
    const g = new WennaGuide(LINE);
    g.setLimit(55);
    g.update(DT, pt(0));
    g.update(DT, pt(70));
    expect(g.s).toBeGreaterThanOrEqual(50);
    expect(g.s).toBeLessThan(50.1);
  });

  it('reports each node once, and arrives once at the end', () => {
    const g = new WennaGuide(LINE);
    const ev = run(g, 50, () => pt(g.s));
    expect(ev.filter((e) => e.type === 'node').map((e) => (e as { index: number }).index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ev.filter((e) => e.type === 'arrived')).toHaveLength(1);
    expect(g.done).toBe(true);
    expect(g.update(DT, pt(80))).toEqual([]);
  });

  it('serialises the last node reached and restores to it (never the start), clamped to the route', () => {
    const g = new WennaGuide(LINE);
    run(g, 9, () => pt(g.s));
    expect(g.serialize()).toEqual({ node: 1 });
    run(g, 11, () => pt(g.s));
    const save = g.serialize();
    expect(save.node).toBeGreaterThan(2);
    const h = new WennaGuide(LINE);
    h.restore(save);
    expect(h.nodeIndex()).toBe(save.node);
    expect(h.position().x).toBe(save.node * 10);
    h.restore({ node: 99 });
    expect(h.done).toBe(true);
    h.restore(null);
    expect(h.s).toBe(0);
  });

  it('the first update after a restore is not a jump, even far from her', () => {
    const g = new WennaGuide(LINE);
    g.restore({ node: 5 });
    g.update(DT, pt(60));
    expect(g.s).toBeGreaterThanOrEqual(50);
  });

  it('reads the route from anchors by prefix, stopping at the first gap', () => {
    const anchors = new Map([0, 1, 2, 4].map((i) => [`r.${i}`, { position: pt(i * 10) }]));
    expect(guidePoints((id) => anchors.get(id), 'r')).toEqual([pt(0), pt(10), pt(20)]);
    expect(guidePoints(() => undefined, 'r')).toEqual([]);
  });

  it('a one-point route, and a zero or negative step, do nothing', () => {
    expect(new WennaGuide([pt(0)]).update(DT, pt(0))).toEqual([]);
    const g = new WennaGuide(LINE);
    expect(g.update(0, pt(0))).toEqual([]);
    expect(g.update(-1, pt(0))).toEqual([]);
    expect(g.s).toBe(0);
  });
});

const horizontal = (a: P3, b: P3): number => Math.hypot(b.x - a.x, b.z - a.z);

// ---- the installer -----------------------------------------------------------------------------------------------
interface Placement { at: P3; yaw: number; mode: FigureMode }

function rig(opts: { route?: boolean; flags?: Record<string, unknown> } = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  // the guide's saved node and barks are two number flags in the world state, which the game saves: `flags` seeds them as a load would
  for (const [key, value] of Object.entries(opts.flags ?? {})) state.setFlag(key, value as never);
  const services = new Services();
  const quest = new Map<string, QuestState>([['m19', 'active']]);
  const done = new Set<string>(['m19.confession']);
  const current = new Set<string>();
  const dialogues: Array<[string, string]> = [];
  const busy = { on: false };
  const blockers: Array<[string, boolean]> = [];
  const blockerKnown = { ok: true };
  const interior = { current: M19_INTERIOR as string | null };
  const combat = { on: false };
  const hidden: boolean[] = [];
  const placed: Array<[string, string]> = [];
  const toasts: string[] = [];
  const placements: Placement[] = [];
  const figure = { shown: false, disposed: false };
  services.provide('quests' as never, {
    state: (id: string) => quest.get(id) ?? 'inactive',
    objectiveDone: (q: string, o: string) => done.has(`${q}.${o}`),
    isObjectiveCurrent: (q: string, o: string) => current.has(`${q}.${o}`),
    objectives: () => [],
  } as never);
  services.provide('dialogue' as never, { get active() { return busy.on; }, start: (id: string, npc: string) => { if (busy.on) return false; dialogues.push([id, npc]); return true; } } as never);
  services.provide('interiors' as never, {
    get current() { return interior.current; },
    setBlocker: (id: string, closed: boolean) => { blockers.push([id, closed]); return blockerKnown.ok; },
  } as never);
  services.provide('npcs' as never, { setHidden: (_id: string, h: boolean) => void hidden.push(h), place: (id: string, a: string) => { placed.push([id, a]); return true; } } as never);
  services.provide('waystones' as never, { get hostileAggro() { return combat.on; } } as never);
  const anchors = new Map<string, { position: P3; yaw: number }>();
  if (opts.route !== false) {
    LINE.forEach((p, i) => anchors.set(`oldsmoke.m19.route.${i}`, { position: p, yaw: 0 }));
    [1, 2, 3].forEach((n) => anchors.set(`oldsmoke.lower.sealed.${n}`, { position: pt(55 + n, 3), yaw: 0 }));
    [pt(30, 8), pt(60, 12), pt(-5, 40)].forEach((p, i) => anchors.set(`oldsmoke.hide.m19.${i + 1}`, { position: p, yaw: 0 }));
  }
  const player = { feet: pt(0) };
  const ctx = {
    events, state, services, player,
    anchors: { find: (id: string) => anchors.get(id) },
  } as unknown as GameContext;
  const fig: GuideFigure = {
    place: (at, yaw, mode) => void placements.push({ at: { ...at }, yaw, mode }),
    show: (on) => void (figure.shown = on),
    update: () => {},
    dispose: () => void (figure.disposed = true),
  };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => void console.warn(m), offs);
  const dispose = installM19(kit, { figure: () => fig, toast: (k) => void toasts.push(k) });
  installM18(kit);
  const step = (n = 1, move?: (i: number) => void) => { for (let i = 0; i < n; i++) { move?.(i); tick(); } };
  /** Walks the player along the route with Wenna, as the guide leads. */
  const at = (x: number, z = 0) => void (player.feet = pt(x, z));
  return {
    events, state, quest, done, current, busy, dialogues, blockers, blockerKnown, interior, combat, hidden, placed, toasts, placements, figure, warn,
    player, at, step, dispose, offs, anchors, last: () => placements[placements.length - 1],
  };
}
type R = ReturnType<typeof rig>;

/** Follows the guide: the player stands where she last was, for `ticks`. */
const follow = (r: R, ticks: number) => r.step(ticks, () => { const l = r.last(); if (l) r.at(l.at.x, l.at.z); });

beforeEach(() => void vi.restoreAllMocks());

describe('M19 guide: when she walks', () => {
  it('does nothing before the confession, outside the quest, or without a route', () => {
    const r = rig();
    r.done.clear();
    r.step(10);
    expect(r.figure.shown).toBe(false);
    expect(r.hidden).toEqual([]);
    r.done.add('m19.confession');
    r.quest.set('m19', 'inactive');
    r.step(10);
    expect(r.figure.shown).toBe(false);
    r.dispose();
    const r2 = rig({ route: false });
    r2.step(10);
    expect(r2.figure.shown).toBe(false);
    r2.dispose();
  });

  it('puts the figure on the route and hides the NPC the moment the player is in the Lower Galleries', () => {
    const r = rig();
    r.interior.current = null;
    r.step(5);
    expect(r.figure.shown).toBe(false);
    expect(r.hidden).toEqual([]);
    r.interior.current = M19_INTERIOR;
    r.step(2);
    expect(r.figure.shown).toBe(true);
    expect(r.hidden).toEqual([true]);
    expect(r.last().at.x).toBeLessThan(0.5);
    r.dispose();
  });

  it('walks beside the player at 2 m/s, facing along the route, in walk mode', () => {
    const r = rig();
    follow(r, 60 * 5);
    expect(r.last().at.x).toBeCloseTo(10, 0);
    expect(r.last().mode).toBe('walk');
    expect(r.last().yaw).toBeCloseTo(Math.atan2(-1, -0), 5); // +x: forward is (-sin yaw, -cos yaw)
    r.dispose();
  });

  it('waits when the player is left behind and barks every 20 seconds', () => {
    const r = rig();
    r.step(60 * 25); // the player stands at the lift
    expect(r.last().at.x).toBeGreaterThan(7.5);
    expect(r.last().at.x).toBeLessThan(8.5);
    expect(r.last().mode).toBe('stand');
    expect(r.toasts).toEqual(['quest.m19.guide.wait.1']);
    r.step(60 * 20);
    expect(r.toasts).toEqual(['quest.m19.guide.wait.1', 'quest.m19.guide.wait.2']);
    r.dispose();
  });

  it('resumes when the player comes back to her', () => {
    const r = rig();
    r.step(60 * 10);
    const stopped = r.last().at.x;
    let x = 0;
    r.step(60 * 4, () => r.at((x = Math.min(x + 0.1, r.last().at.x - 3)))); // the player walks up to within 3 m of her
    expect(r.last().at.x).toBeGreaterThan(stopped + 3);
    r.dispose();
  });

  it('hurries when the player runs ahead', () => {
    const r = rig();
    let x = 0;
    r.step(60 * 3, () => r.at((x += 0.1)));
    expect(r.last().at.x).toBeGreaterThan(3 * GUIDE.walkMps + 1); // faster than the walk
    expect(r.last().mode).toBe('walk');
    r.dispose();
  });

  it('re-places her behind the player after a teleport, and her barks already passed do not replay', () => {
    const r = rig();
    follow(r, 60 * 2);
    r.at(36, 1);
    r.step(1);
    expect(r.last().at.x).toBeGreaterThanOrEqual(30);
    expect(r.last().at.x).toBeLessThan(30.2);
    r.dispose();
  });

  it('pauses when the player leaves the galleries (the NPC is shown again) and re-seats her when they come back', () => {
    const r = rig();
    follow(r, 60 * 3);
    r.interior.current = null;
    r.step(2);
    expect(r.figure.shown).toBe(false);
    expect(r.hidden.at(-1)).toBe(false);
    const n = r.placements.length;
    r.step(120);
    expect(r.placements.length).toBe(n); // no walking while away
    r.interior.current = M19_INTERIOR;
    r.at(20);
    r.events.emit('interior.entered', { interiorId: M19_INTERIOR, doorId: 'mine-lower-galleries' });
    r.step(2);
    expect(r.figure.shown).toBe(true);
    expect(r.hidden.at(-1)).toBe(true);
    expect(r.last().at.x).toBeGreaterThanOrEqual(20);
    r.dispose();
  });

  it('a respawn re-seats her behind the player', () => {
    const r = rig();
    follow(r, 60 * 5);
    r.at(0);
    r.events.emit('actor.revived', { actorId: 'player', reason: 'respawn', health: 10 });
    r.step(2);
    expect(r.last().at.x).toBeLessThan(1);
    r.dispose();
  });
});

describe('M19 guide: combat, the stealth section, dialogue', () => {
  it('in combat she crouches at the nearest hide spot and goes on after', () => {
    const r = rig();
    follow(r, 60 * 5);
    r.combat.on = true;
    r.step(3);
    expect(r.last().mode).toBe('crouch');
    expect(r.last().at).toEqual(pt(30, 8)); // within 25 m of where she stands
    r.step(60 * 5);
    expect(r.last().at).toEqual(pt(30, 8));
    r.combat.on = false;
    follow(r, 3);
    expect(r.last().mode).not.toBe('crouch');
    expect(r.last().at.x).not.toBe(30);
    r.dispose();
  });

  it('in combat with no hide spot near she crouches where she stands', () => {
    const r = rig();
    [1, 2, 3].forEach((n) => r.anchors.delete(`oldsmoke.hide.m19.${n}`));
    follow(r, 60 * 5);
    const where = r.last().at.x;
    r.combat.on = true;
    r.step(3);
    expect(r.last().mode).toBe('crouch');
    expect(Math.abs(r.last().at.x - where)).toBeLessThan(0.5);
    r.dispose();
  });

  it('while the stealth section runs she waits in a hide spot, and when it is cleared she is re-seated behind the player', () => {
    const r = rig();
    follow(r, 60 * 5);
    r.events.emit('stealth.section' as never, { sectionId: M19_SECTION, phase: 'entered' } as never);
    r.step(3);
    expect(r.last().mode).toBe('crouch');
    const hide = r.last().at;
    r.at(70, 0);
    r.step(60 * 30);
    expect(r.last().at).toEqual(hide);
    expect(r.toasts).toEqual([]); // a hiding Wenna does not bark
    r.events.emit('stealth.section' as never, { sectionId: M19_SECTION, phase: 'cleared' } as never);
    r.step(3);
    expect(r.last().mode).not.toBe('crouch');
    expect(r.last().at.x).toBeGreaterThan(40); // behind the player at 70, not at the old node (and short of the door)
    r.dispose();
  });

  it('another section\'s events leave her alone', () => {
    const r = rig();
    follow(r, 60 * 3);
    r.events.emit('stealth.section' as never, { sectionId: 'm21.grisel-hall', phase: 'entered' } as never);
    follow(r, 60);
    expect(r.last().mode).toBe('walk');
    r.dispose();
  });

  it('she holds still while any dialogue is open, without crouching', () => {
    const r = rig();
    follow(r, 60 * 3);
    r.busy.on = true;
    const n = r.last().at.x;
    follow(r, 60 * 3);
    expect(r.last().at.x).toBe(n);
    expect(r.last().mode).toBe('stand');
    r.busy.on = false;
    follow(r, 60);
    expect(r.last().at.x).toBeGreaterThan(n);
    r.dispose();
  });
});

describe('M19 guide: the sealed door, barks, the nursery', () => {
  const walkTo = (r: R, ticks: number) => r.step(ticks, () => { const l = r.last(); if (l) r.at(l.at.x, 0); });

  it('stops short of the sealed door until its flag is set, then goes on to the nursery', () => {
    const r = rig();
    follow(r, 60 * 40);
    expect(r.last().at.x).toBeLessThan(57);
    expect(r.last().at.x).toBeGreaterThan(50);
    const stuck = r.last().at.x;
    follow(r, 60 * 21);
    expect(r.last().at.x).toBe(stuck);
    expect(r.toasts.some((t) => t.startsWith('quest.m19.guide.limit.'))).toBe(true);
    r.state.setFlag(M19_DOOR_OPEN_FLAG, true);
    follow(r, 60 * 20);
    expect(r.state.getBool(M19_ARRIVED_FLAG)).toBe(true);
    r.dispose();
  });

  it('at the end she is placed in the nursery, shown again, and the figure goes', () => {
    const r = rig();
    r.state.setFlag(M19_DOOR_OPEN_FLAG, true);
    follow(r, 60 * 50);
    expect(r.placed).toEqual([['wenna', 'oldsmoke.m19.nursery']]);
    expect(r.hidden.at(-1)).toBe(false);
    expect(r.figure.shown).toBe(false);
    r.step(60 * 5);
    expect(r.placed).toHaveLength(1); // once
    r.dispose();
  });

  it('the reveal coming before she has walked the whole route puts her in the nursery at once', () => {
    const r = rig();
    follow(r, 60);
    r.done.add('m19.reveal');
    r.step(2);
    expect(r.state.getBool(M19_ARRIVED_FLAG)).toBe(true);
    expect(r.placed).toEqual([['wenna', 'oldsmoke.m19.nursery']]);
    r.dispose();
  });

  it('plays the six barks in order as she passes their nodes, one at a time, never while a dialogue is open', () => {
    const r = rig();
    r.state.setFlag(M19_DOOR_OPEN_FLAG, true);
    r.busy.on = true;
    follow(r, 60 * 20);
    expect(r.dialogues).toEqual([]);
    r.busy.on = false;
    walkTo(r, 60 * 6);
    expect(r.dialogues).toEqual([['scene-m19-bark-1', 'scene.m19.bark']]);
    r.dialogues.length = 0;
    // each bark dialogue is opened and closed by the test: nothing is queued twice
    for (let i = 0; i < 60 * 45; i++) {
      r.step(1, () => { const l = r.last(); if (l) r.at(l.at.x, 0); });
    }
    const ids = r.dialogues.map((d) => d[0]);
    expect(ids).toEqual(['scene-m19-bark-2', 'scene-m19-bark-3', 'scene-m19-bark-4', 'scene-m19-bark-5', 'scene-m19-bark-6']);
    r.dispose();
  });

  it('a teleport past some barks skips them, and a teleport back does not replay one', () => {
    const r = rig();
    r.state.setFlag(M19_DOOR_OPEN_FLAG, true);
    follow(r, 3);
    r.at(75);
    r.step(2);
    const first = r.dialogues.length;
    r.at(5);
    r.step(2);
    follow(r, 60 * 6);
    expect(r.dialogues.length).toBeLessThanOrEqual(first + 1);
    const ids = r.dialogues.map((d) => d[0]);
    expect(new Set(ids).size).toBe(ids.length); // no bark twice
    r.dispose();
  });

  it('the nursery trigger starts the reveal scene when the objective is current, with a cooldown if it was closed early', () => {
    const r = rig();
    r.quest.set('m19', 'active');
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.step(30);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toEqual([]);
    r.current.add('m19.reveal');
    r.step(30);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toEqual([[M19_SCENE, 'scene.m19']]);
    r.step(30 * 10);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toHaveLength(1); // cooldown
    r.step(30 * 11);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toHaveLength(2); // offered again
    r.dispose();
  });

  it('a load clears the remembered nursery presence (trigger.enter is not replayed), so the scene needs a fresh entry', () => {
    const r = rig();
    r.current.add('m19.reveal');
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.events.emit('save.loaded', { slot: 'a' } as never);
    r.step(30 * 3);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toEqual([]);
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.step(30);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toHaveLength(1);
    r.dispose();
  });

  it('the reveal scene does not start for another actor, after the player left the ring, or while a dialogue is open', () => {
    const r = rig();
    r.current.add('m19.reveal');
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'wyrm' });
    r.step(30);
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.events.emit('trigger.exit', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.busy.on = true;
    r.step(30);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toEqual([]);
    r.busy.on = false;
    r.step(30);
    expect(r.dialogues.filter((d) => d[0] === M19_SCENE)).toHaveLength(1);
    r.dispose();
  });
});

describe('M19 guide: saves', () => {
  /** The guide's two flags, as a save would carry them. */
  const flagsOf = (r: R) => ({ [M19_GUIDE_NODE_FLAG]: r.state.getNumber(M19_GUIDE_NODE_FLAG), [M19_GUIDE_BARKS_FLAG]: r.state.getNumber(M19_GUIDE_BARKS_FLAG) });

  it('writes the last node reached and the barks scheduled to its own two number flags as she advances', () => {
    const r = rig();
    expect(r.state.getFlag(M19_GUIDE_NODE_FLAG)).toBeUndefined();
    expect(r.state.getFlag(M19_GUIDE_BARKS_FLAG)).toBeUndefined();
    follow(r, 60 * 6);
    const early = r.state.getNumber(M19_GUIDE_NODE_FLAG);
    expect(early).toBeGreaterThanOrEqual(1);
    follow(r, 60 * 8);
    expect(r.state.getNumber(M19_GUIDE_NODE_FLAG)).toBeGreaterThanOrEqual(2);
    expect(r.state.getNumber(M19_GUIDE_NODE_FLAG)).toBeGreaterThan(early);
    expect(r.state.getNumber(M19_GUIDE_BARKS_FLAG)).toBeGreaterThanOrEqual(1);
    expect(typeof r.state.getFlag(M19_GUIDE_NODE_FLAG)).toBe('number');
    expect(typeof r.state.getFlag(M19_GUIDE_BARKS_FLAG)).toBe('number');
    r.dispose();
  });

  it('a load resumes at the saved node, not the start, and does not replay the barks already played', () => {
    const r = rig();
    follow(r, 60 * 12);
    const saved = JSON.parse(JSON.stringify(flagsOf(r))) as Record<string, number>;
    const node = saved[M19_GUIDE_NODE_FLAG];
    const barks = saved[M19_GUIDE_BARKS_FLAG];
    expect(node).toBeGreaterThanOrEqual(2);
    r.dispose();
    const r2 = rig({ flags: saved });
    r2.at(node * 10 + 1);
    r2.events.emit('save.loaded', { slot: 'a' } as never);
    r2.step(3);
    expect(r2.last().at.x).toBeGreaterThanOrEqual(node * 10);
    expect(r2.dialogues).toEqual([]);
    follow(r2, 60 * 2);
    expect(r2.dialogues.every((d) => Number(d[0].slice(-1)) > barks)).toBe(true);
    r2.dispose();
  });

  it('a load into a world whose flags changed restores from the flags then in the world state', () => {
    const r = rig();
    r.state.setFlag(M19_GUIDE_NODE_FLAG, 5);
    r.state.setFlag(M19_GUIDE_BARKS_FLAG, 0);
    r.at(51);
    r.events.emit('save.loaded', { slot: 'a' } as never);
    r.step(3);
    expect(r.last().at.x).toBeGreaterThanOrEqual(50);
    r.dispose();
  });

  it('a load back in the galleries unhides nothing it did not hide, and a load elsewhere shows the NPC', () => {
    const r = rig();
    follow(r, 60 * 3);
    expect(r.hidden.at(-1)).toBe(true);
    r.interior.current = null;
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.figure.shown).toBe(false);
    expect(r.hidden.at(-1)).toBe(false);
    r.dispose();
  });

  it('a load after she arrived puts her in the nursery again (NPC positions are not saved)', () => {
    const r = rig();
    r.state.setFlag(M19_ARRIVED_FLAG, true);
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.placed).toEqual([['wenna', 'oldsmoke.m19.nursery']]);
    r.quest.set('m19', 'completed');
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.placed).toHaveLength(1);
    r.dispose();
  });

  it('junk or missing save data starts her at the first node', () => {
    const junk: Array<Record<string, unknown> | undefined> = [
      undefined, {}, { [M19_GUIDE_NODE_FLAG]: 'x' }, { [M19_GUIDE_NODE_FLAG]: -1 }, { [M19_GUIDE_NODE_FLAG]: 2.5 }, { [M19_GUIDE_NODE_FLAG]: true },
      { [M19_GUIDE_NODE_FLAG]: 'z', [M19_GUIDE_BARKS_FLAG]: 'y' }, { [M19_GUIDE_BARKS_FLAG]: -3 },
    ];
    for (const flags of junk) {
      const r = rig({ flags });
      r.at(0);
      r.step(3);
      expect(r.last().at.x).toBeLessThan(1);
      r.dispose();
    }
  });
});

describe('M19: the sealed door and the shortcut gate', () => {
  it('closes the door and the gate on the first tick, and opens each on its own flag', () => {
    const r = rig();
    r.step(2);
    expect(r.blockers).toContainEqual([M19_DOOR_BLOCKER, true]);
    expect(r.blockers).toContainEqual([M19_GATE_BLOCKER, true]);
    r.blockers.length = 0;
    r.state.setFlag(SHORTCUT_FLAG, true);
    r.step(30);
    expect(r.blockers).toEqual([[M19_GATE_BLOCKER, false]]);
    r.blockers.length = 0;
    r.state.setFlag(M19_DOOR_OPEN_FLAG, true);
    r.step(30);
    expect(r.blockers).toEqual([[M19_DOOR_BLOCKER, false]]);
    r.blockers.length = 0;
    r.step(120);
    expect(r.blockers).toEqual([]); // applied once
    r.dispose();
  });

  it('the gate follows A9\'s flag alone: M18 is not involved', () => {
    const r = rig();
    r.quest.set('m18', 'completed');
    r.step(2);
    expect(r.blockers).toContainEqual([M19_GATE_BLOCKER, true]);
    r.dispose();
  });

  it('re-applies both on entering the Lower Galleries and after a load', () => {
    const r = rig();
    r.state.setFlag(M19_DOOR_OPEN_FLAG, true);
    r.step(30);
    r.blockers.length = 0;
    r.events.emit('interior.entered', { interiorId: M19_INTERIOR, doorId: 'd' });
    expect(r.blockers).toContainEqual([M19_DOOR_BLOCKER, false]);
    expect(r.blockers).toContainEqual([M19_GATE_BLOCKER, true]);
    r.blockers.length = 0;
    r.events.emit('interior.entered', { interiorId: 'grisel-hall', doorId: 'd' });
    expect(r.blockers).toEqual([]);
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.blockers).toHaveLength(2);
    r.dispose();
  });

  it('an unknown blocker warns once and is retried on the next entry, not every poll', () => {
    const r = rig();
    r.blockerKnown.ok = false;
    r.step(300);
    expect(r.warn).toHaveBeenCalledTimes(1);
    const calls = r.blockers.length;
    r.blockerKnown.ok = true;
    r.events.emit('interior.entered', { interiorId: M19_INTERIOR, doorId: 'd' });
    expect(r.blockers.length).toBe(calls + 2);
    r.dispose();
  });
});

describe('M19: teardown', () => {
  it('the disposer shows the NPC again and drops the figure; the kit listeners stop with the kit', () => {
    const r = rig();
    follow(r, 60 * 3);
    expect(r.hidden.at(-1)).toBe(true);
    r.dispose();
    expect(r.hidden.at(-1)).toBe(false);
    expect(r.figure.disposed).toBe(true);
    expect(r.figure.shown).toBe(false);
    for (const off of r.offs.splice(0)) off();
    const n = r.dialogues.length;
    r.events.emit('trigger.enter', { triggerId: M19_NURSERY_TRIGGER, actorId: 'player' });
    r.current.add('m19.reveal');
    r.step(60);
    expect(r.dialogues.length).toBe(n);
  });

  it('disposing before she ever walked is safe', () => {
    const r = rig();
    expect(() => r.dispose()).not.toThrow();
  });
});

describe('M18: the Bellows scene', () => {
  it('starts when the breathe objective opens and Cael is in the cavern, and not before', () => {
    const r = rig();
    r.quest.set('m18', 'active');
    r.interior.current = M18_INTERIOR;
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.current.add('m18.breathe');
    r.step(30);
    expect(r.dialogues).toEqual([[M18_SCENE, 'scene.m18']]);
    r.dispose();
  });

  it('waits for the cavern and for another dialogue, and is offered again after ten seconds if closed early', () => {
    const r = rig();
    r.quest.set('m18', 'active');
    r.current.add('m18.breathe');
    r.interior.current = 'mine-deepgate-shaft';
    r.step(60);
    expect(r.dialogues).toEqual([]);
    r.interior.current = M18_INTERIOR;
    r.busy.on = true;
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.busy.on = false;
    r.step(30);
    expect(r.dialogues).toHaveLength(1);
    r.step(30 * 10);
    expect(r.dialogues).toHaveLength(1);
    r.step(30 * 11);
    expect(r.dialogues).toHaveLength(2);
    r.dispose();
  });

  it('does nothing outside M18', () => {
    const r = rig();
    r.current.add('m18.breathe');
    r.interior.current = M18_INTERIOR;
    r.step(120);
    expect(r.dialogues).toEqual([]);
    r.quest.set('m18', 'completed');
    r.step(120);
    expect(r.dialogues).toEqual([]);
    r.dispose();
  });
});
