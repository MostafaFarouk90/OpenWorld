import { describe, expect, it, vi } from 'vitest';
import { TOBB } from './tobb';
import {
  VIEW_DISTANCE,
  deriveWait,
  inView,
  ruleHolds,
  sameSpace,
  sameWait,
  type ViewPorts,
  type Wait,
  type WaitRule,
  type WaitView,
} from './WaitDirector';

function fakeView(o: {
  quests?: Record<string, string> | null;
  done?: string[];
  interior?: string | null;
  anchors?: string[] | 'all';
} = {}): WaitView & { anchorExists: ReturnType<typeof vi.fn> } {
  const quests = o.quests === null ? null : (o.quests ?? {});
  const done = new Set(o.done ?? []);
  const anchors = o.anchors ?? 'all';
  return {
    questState: (q) => (quests === null ? undefined : quests[q]),
    objectiveDone: (q, obj) => done.has(`${q}.${obj}`),
    interior: o.interior ?? null,
    anchorExists: vi.fn((id: string) => anchors === 'all' || anchors.includes(id)),
  };
}

const RULES = TOBB.waits as readonly WaitRule[];
const GATE = 'npc-post.tobb.south-gate';
const ANVIL = 'npc-post.tobb.tilted-anvil';
const KEEP = 'npc-post.tobb.keep';

describe('ruleHolds', () => {
  const rule: WaitRule = { reason: 'gate', anchorId: 'a', quest: 'q', until: 'o' };
  it('holds when quest active and until not done', () => {
    expect(ruleHolds(rule, fakeView({ quests: { q: 'active' } }))).toBe(true);
  });
  it('fails when until is done', () => {
    expect(ruleHolds(rule, fakeView({ quests: { q: 'active' }, done: ['q.o'] }))).toBe(false);
  });
  it.each(['inactive', 'completed', 'failed'])('fails when quest is %s', (s) => {
    expect(ruleHolds(rule, fakeView({ quests: { q: s } }))).toBe(false);
  });
  it('fails for unknown quest and for undefined service', () => {
    expect(ruleHolds(rule, fakeView({ quests: {} }))).toBe(false);
    expect(ruleHolds(rule, fakeView({ quests: null }))).toBe(false);
  });
  it('interior rule holds only on matching interior', () => {
    const r: WaitRule = { reason: 'keep', anchorId: 'a', interior: 'keep-hall' };
    expect(ruleHolds(r, fakeView({ interior: 'keep-hall' }))).toBe(true);
    expect(ruleHolds(r, fakeView({ interior: 'other' }))).toBe(false);
    expect(ruleHolds(r, fakeView({ interior: null }))).toBe(false);
  });
});

describe('deriveWait with TOBB.waits', () => {
  it('gate while m06 active and o2 not done', () => {
    expect(deriveWait(RULES, fakeView({ quests: { m06: 'active' } }))).toEqual({ reason: 'gate', anchorId: GATE });
  });
  it('null once o2 done even though m06 active', () => {
    expect(deriveWait(RULES, fakeView({ quests: { m06: 'active' }, done: ['m06.o2'] }))).toBeNull();
  });
  it('stealth while m09 active and o4 not done', () => {
    expect(deriveWait(RULES, fakeView({ quests: { m09: 'active' } }))).toEqual({ reason: 'stealth', anchorId: ANVIL });
    expect(deriveWait(RULES, fakeView({ quests: { m09: 'active' }, done: ['m09.o4'] }))).toBeNull();
  });
  it('chase while m10 active and o3 not done; null when done', () => {
    expect(deriveWait(RULES, fakeView({ quests: { m10: 'active' } }))).toEqual({ reason: 'chase', anchorId: ANVIL });
    expect(deriveWait(RULES, fakeView({ quests: { m10: 'active' }, done: ['m10.o3'] }))).toBeNull();
  });
  it('keep only in keep-hall', () => {
    expect(deriveWait(RULES, fakeView({ interior: 'keep-hall' }))).toEqual({ reason: 'keep', anchorId: KEEP });
    expect(deriveWait(RULES, fakeView({ interior: 'smithy' }))).toBeNull();
    expect(deriveWait(RULES, fakeView({ interior: null }))).toBeNull();
  });
  it('priorities: stealth > keep > gate, chase > keep', () => {
    const base = { interior: 'keep-hall' };
    expect(deriveWait(RULES, fakeView({ ...base, quests: { m09: 'active', m06: 'active' } }))?.reason).toBe('stealth');
    expect(deriveWait(RULES, fakeView({ ...base, quests: { m06: 'active' } }))?.reason).toBe('keep');
    expect(deriveWait(RULES, fakeView({ ...base, quests: { m10: 'active' } }))?.reason).toBe('chase');
    expect(deriveWait(RULES, fakeView({ quests: { m09: 'active', m06: 'active' } }))?.reason).toBe('stealth');
  });
  it('skips a rule whose anchor is missing and uses the next holding rule', () => {
    const view = fakeView({ interior: 'keep-hall', quests: { m09: 'active', m06: 'active' }, anchors: [GATE] });
    expect(deriveWait(RULES, view)).toEqual({ reason: 'gate', anchorId: GATE });
    const none = fakeView({ quests: { m09: 'active' }, anchors: [] });
    expect(deriveWait(RULES, none)).toBeNull();
  });
  it('asks anchorExists only for rules that hold', () => {
    const view = fakeView({ quests: { m06: 'active' } });
    deriveWait(RULES, view);
    expect(view.anchorExists).toHaveBeenCalledTimes(1);
    expect(view.anchorExists).toHaveBeenCalledWith(GATE);
    const idle = fakeView();
    deriveWait(RULES, idle);
    expect(idle.anchorExists).not.toHaveBeenCalled();
  });
  it('stops asking after the first match', () => {
    const view = fakeView({ interior: 'keep-hall', quests: { m09: 'active', m06: 'active' } });
    deriveWait(RULES, view);
    expect(view.anchorExists).toHaveBeenCalledTimes(1);
    expect(view.anchorExists).toHaveBeenCalledWith(ANVIL);
  });
  it('no quest service gives null unless in keep-hall', () => {
    expect(deriveWait(RULES, fakeView({ quests: null }))).toBeNull();
    expect(deriveWait(RULES, fakeView({ quests: null, interior: 'keep-hall' }))?.reason).toBe('keep');
  });
  it('empty rule list gives null', () => {
    expect(deriveWait([], fakeView({ interior: 'keep-hall', quests: { m06: 'active' } }))).toBeNull();
  });
});

describe('sameWait', () => {
  const a: Wait = { reason: 'gate', anchorId: 'x' };
  it('handles null and equality', () => {
    expect(sameWait(null, null)).toBe(true);
    expect(sameWait(a, a)).toBe(true);
    expect(sameWait(a, { reason: 'gate', anchorId: 'x' })).toBe(true);
  });
  it('detects differences', () => {
    expect(sameWait(a, { reason: 'keep', anchorId: 'x' })).toBe(false);
    expect(sameWait(a, { reason: 'gate', anchorId: 'y' })).toBe(false);
    expect(sameWait(a, null)).toBe(false);
    expect(sameWait(null, a)).toBe(false);
  });
});

function ports(p: Partial<ViewPorts> = {}): ViewPorts {
  return { player: { x: 0, y: 0, z: 0 }, playerYaw: 0, current: null, ...p };
}
const at = (x: number, z: number, y = 0) => ({ x, y, z });
const polar = (deg: number, d: number) => {
  const r = (deg * Math.PI) / 180; // angle off forward (-Z), toward +X
  return at(Math.sin(r) * d, -Math.cos(r) * d);
};

describe('inView cone (no frustum)', () => {
  it('ahead yes, behind no, at player yes', () => {
    expect(inView(ports(), at(0, -10))).toBe(true);
    expect(inView(ports(), at(0, 10))).toBe(false);
    expect(inView(ports(), at(0, 0))).toBe(true);
  });
  it('respects VIEW_DISTANCE', () => {
    expect(VIEW_DISTANCE).toBe(60);
    expect(inView(ports(), at(0, -59))).toBe(true);
    expect(inView(ports(), at(0, -61))).toBe(false);
  });
  it('counts vertical distance', () => {
    expect(inView(ports(), at(0, -40, 50))).toBe(false);
  });
  it('60 degrees in, 80 degrees out (both sides)', () => {
    expect(inView(ports(), polar(60, 10))).toBe(true);
    expect(inView(ports(), polar(-60, 10))).toBe(true);
    expect(inView(ports(), polar(80, 10))).toBe(false);
    expect(inView(ports(), polar(-80, 10))).toBe(false);
  });
  it('cone turns with yaw', () => {
    const v = ports({ playerYaw: Math.PI / 2 }); // forward = (-1, 0)
    expect(inView(v, at(-10, 0))).toBe(true);
    expect(inView(v, at(0, -10))).toBe(false);
    expect(inView(v, at(10, 0))).toBe(false);
  });
  it('is relative to the player position', () => {
    const v = ports({ player: at(100, 100) });
    expect(inView(v, at(100, 90))).toBe(true);
    expect(inView(v, at(100, 110))).toBe(false);
  });
});

describe('inView with inFrustum', () => {
  it('true overrides cone, false overrides cone', () => {
    expect(inView(ports({ inFrustum: () => true }), at(0, 10))).toBe(true);
    expect(inView(ports({ inFrustum: () => false }), at(0, -10))).toBe(false);
  });
  it('undefined falls back to cone', () => {
    const v = ports({ inFrustum: () => undefined });
    expect(inView(v, at(0, -10))).toBe(true);
    expect(inView(v, at(0, 10))).toBe(false);
  });
  it('is called with the point raised 1.2 m', () => {
    const spy = vi.fn(() => true);
    inView(ports({ inFrustum: spy }), at(3, -4, 2));
    expect(spy).toHaveBeenCalledWith({ x: 3, y: 3.2, z: -4 });
  });
  it('distance cap applies before frustum', () => {
    const spy = vi.fn(() => true);
    expect(inView(ports({ inFrustum: spy }), at(0, -61))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('sameSpace / interiorAt', () => {
  it('different interior is never in view', () => {
    const v = ports({ current: 'a', interiorAt: () => 'b' });
    expect(sameSpace(v, at(0, -1))).toBe(false);
    expect(inView(v, at(0, -1))).toBe(false);
    expect(inView({ ...v, inFrustum: () => true }, at(0, -1))).toBe(false);
  });
  it('same interior is in view', () => {
    const v = ports({ current: 'a', interiorAt: () => 'a' });
    expect(sameSpace(v, at(0, -1))).toBe(true);
    expect(inView(v, at(0, -1))).toBe(true);
  });
  it('outdoors (null) vs interior', () => {
    expect(sameSpace(ports({ current: null, interiorAt: () => null }), at(0, 0))).toBe(true);
    expect(sameSpace(ports({ current: 'a', interiorAt: () => null }), at(0, 0))).toBe(false);
    expect(sameSpace(ports({ current: null, interiorAt: () => 'a' }), at(0, 0))).toBe(false);
  });
  it('undefined or missing interiorAt means same space', () => {
    expect(sameSpace(ports({ current: 'a', interiorAt: () => undefined }), at(0, 0))).toBe(true);
    expect(sameSpace(ports({ current: 'a' }), at(0, 0))).toBe(true);
  });
});
