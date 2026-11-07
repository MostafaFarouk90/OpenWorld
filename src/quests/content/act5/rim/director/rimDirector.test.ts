// The Rim director on the real quest manager: each PR 1 quest played to completion from its giver (M47 by itself on the Act 5
// gate), R26 on both roads, M50's gauge with a steam fail and the lesson, the arms only on their step, saves mid-quest, and
// M49's talks in any order.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, NOTES, type Rig } from './rig.testkit';
import { ACT5_GATE } from './gate';
import { M51_HORN, forecast } from './camp';
import { CoolingChannel } from './hall';
import { R26_CRATES_LOST } from './convoy';
import { M47_ARM, M48_ARM } from '../spawners';
import { M47_GROUPS, M47_HAIRPIN_TRIGGER, M47_LAMP, M47_BRAZIER, M47_NOTES, M47_RIM_GATE_OPEN, M47_SIGHT_SCENE, M47_WINCH } from '../m47.quest';
import { M48_CHAN_TRIGGER, M48_GHOST, M48_GROUPS, M48_LEVER, M48_NOTES, M48_VENTS_ROAR, M48_WHEEL } from '../m48.quest';
import { M49_ALLIES, M49_ARRIVED, M49_BANNER, M49_BANNERS, M49_FORECAST, M49_NOTES, M49_POST, M49_POSTS, M49_SIGNAL, M49_TABLE, M49_TABLE_DIALOGUE, M49_TABLE_NPC } from '../m49.quest';
import {
  R26_AMBUSH, R26_AMBUSH_ARM, R26_ARRIVED, R26_AT_HALT, R26_BRAKE, R26_CART_OUT, R26_CHOICE, R26_CRATES_LEFT, R26_ESCORT, R26_GUARD, R26_GUARD_OUT,
  R26_IN, R26_LOAD, R26_MASTER, R26_NOTES, R26_UNLOAD, R26_WAITED, R26_WOUNDED,
} from '../r26.quest';
import { R29_DEAD, R29_GHOST, R29_GONG_TRIGGER, R29_HANG, R29_NOTE, R29_PARTS, R29_POSTS, R29_STRIKE, R29_STRUCK } from '../r29.quest';
import { M50_CHAMBER_TRIGGER, M50_COMPLETE, M50_GOLEMS, M50_GNATS, M50_KEEPER, M50_NOTES, M50_ORDER, M50_WHEEL } from '../m50.quest';
import { M51_CALL_DIALOGUE, M51_CALL_NPC, M51_CAPTAIN, M51_DRAGONS, M51_NOTES, M51_REPORT, M51_SCOUTS, M51_TALK } from '../m51.quest';
import { R26_HALT_NODES } from '../anchors';
import { Q } from '../ids';

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const make = (flags: Record<string, boolean | number | string> = {}): Rig => (rig = makeRig({ flags }));

/** Polls long enough for a half-second rule and a deferred recheck. */
const settle = (r: Rig): void => r.step(35);

function playM47(r: Rig): void {
  r.set(ACT5_GATE);
  r.step(2);
  expect(r.qs('m47')).toBe('active');
  r.talk('wulfhild');
  r.step(1);
  expect(r.flag(M47_ARM.knot1)).toBe(true);
  expect(r.flag(M47_ARM.knot2)).toBe(false);
  r.fight([M47_GROUPS.knot1]);
  r.enter(M47_HAIRPIN_TRIGGER);
  settle(r);
  r.read(M47_NOTES.journal);
  r.step(1);
  r.fight([M47_GROUPS.knot2]);
  r.read(M47_NOTES.inscription);
  expect(r.use(M47_WINCH)).toBe(true);
  settle(r);
  expect(r.flag(M47_RIM_GATE_OPEN)).toBe(true);
  expect(r.done('m47', 'winch')).toBe(true);
  r.talk('alric');
  settle(r);
  expect(r.scenes.played).toContain(M47_SIGHT_SCENE);
  r.talk('edric');
  r.talk('rook');
  expect(r.use(M47_BRAZIER)).toBe(true);
  expect(r.use(M47_LAMP)).toBe(true);
  r.read(M47_NOTES.bell);
  r.emit('waystone.rekindled', { waystoneId: 'rim-camp', cause: 'player' });
  r.talk('alric');
  r.step(2);
}

function playM48(r: Rig): void {
  r.begin('m48', 'alric');
  const vent = (v: number): void => { expect(r.use(M48_WHEEL(v)), `wheel ${v}`).toBe(true); settle(r); };
  const cross = (n: number): void => { r.enter(M48_CHAN_TRIGGER(n)); settle(r); expect(r.done('m48', `chan${n}`), `chan${n}`).toBe(true); };
  vent(1); cross(1);
  r.read(M48_NOTES.marks);
  expect(r.use(M48_LEVER(1))).toBe(true); cross(2);
  r.step(1);
  r.fight([M48_GROUPS.golems]);
  vent(2); cross(3);
  r.talk(M48_GHOST);
  vent(3); cross(4);
  r.read(M48_NOTES.tally);
  expect(r.use(M48_LEVER(2))).toBe(true); cross(5);
  r.step(1);
  r.fight([M48_GROUPS.gnats]);
  vent(4);
  settle(r);
  expect(r.flag(M48_VENTS_ROAR)).toBe(true);
  cross(6);
  r.read(M48_NOTES.cache);
  r.talk('alric');
  r.step(2);
}

function playM49(r: Rig, order: readonly string[] = M49_ALLIES): void {
  r.begin('m49', 'hrolf');
  expect(r.use(M49_SIGNAL)).toBe(true);
  settle(r);
  expect(r.flag(M49_ARRIVED)).toBe(true);
  for (const a of order) r.talk(a);
  r.reads([M49_NOTES.plan, M49_NOTES.tally]);
  r.step(2);
  expect(r.use(M49_BANNER('camp'))).toBe(true);
  settle(r);
  expect(r.flag(M49_BANNERS)).toBe(true);
  settle(r);
  expect(r.done('m49', 'rise')).toBe(true);
  expect(r.use(M49_TABLE)).toBe(true);
  r.step(2);
  expect(r.dialogueStarts).toContainEqual([M49_TABLE_DIALOGUE, M49_TABLE_NPC]);
  r.talk(M49_TABLE_NPC, M49_TABLE_DIALOGUE);
  r.step(1);
  for (const p of M49_POSTS) expect(r.use(M49_POST(p)), p).toBe(true);
  r.step(2);
  r.talk('hrolf');
  r.step(2);
}

function upToR26(r: Rig, way: 'fast' | 'long'): void {
  r.begin('r26', 'merrin');
  r.talk(R26_GUARD(1));
  r.read(R26_NOTES.manifest);
  r.step(1);
  r.set(R26_CHOICE, way);
  r.talk(R26_MASTER);
  r.step(1);
  expect(r.use(R26_LOAD)).toBe(true);
  r.step(20);
}

function finishR26(r: Rig): void {
  r.emit('escort.arrived', { escortId: R26_ESCORT });
  settle(r);
  settle(r);
  expect(r.flag(R26_IN)).toBe(true);
  expect(r.use(R26_UNLOAD)).toBe(true);
  r.read(R26_NOTES.waybill);
  r.step(2);
  r.talk('merrin');
  r.step(2);
}

describe('M47 to M49 from the Act 5 gate', () => {
  it('M47 starts by itself on the gate and plays to completion; M48 and M49 follow from their givers', () => {
    const r = make();
    playM47(r);
    expect(r.qs('m47')).toBe('completed');
    expect(r.flag('story.m47.complete')).toBe(true);
    playM48(r);
    expect(r.qs('m48')).toBe('completed');
    playM49(r, [...M49_ALLIES].reverse());
    expect(r.qs('m49')).toBe('completed');
    expect(r.flag('story.m49.complete')).toBe(true);
  });

  it('a knot is armed only when its step is current, and the hairpin before its step does not count', () => {
    const r = make();
    r.set(ACT5_GATE);
    r.step(2);
    r.enter(M47_HAIRPIN_TRIGGER);
    r.step(2);
    // the trigger flag is written whenever M47 runs, and the step closes once it is current (doneWhen)
    r.talk('wulfhild');
    r.step(1);
    expect(r.flag(M47_ARM.knot2)).toBe(false);
    r.fight([M47_GROUPS.knot1]);
    settle(r);
    expect(r.done('m47', 'hairpin')).toBe(true);
  });

  it('a lip reached before its crossing is current does not count (a Leap back up cannot skip ahead)', () => {
    const r = make();
    playM47(r);
    r.begin('m48', 'alric');
    r.enter(M48_CHAN_TRIGGER(2));
    settle(r);
    expect(r.flag('story.m48.chan.2')).toBe(false);
    expect(r.flag(M48_ARM.golems)).toBe(false);
  });

  it('a save in the middle of M49 keeps the arrival and the talks', () => {
    const r = make();
    playM47(r);
    playM48(r);
    r.begin('m49', 'hrolf');
    r.use(M49_SIGNAL);
    settle(r);
    r.talk('wystan');
    r.saveLoad();
    expect(r.flag(M49_ARRIVED)).toBe(true);
    expect(r.done('m49', 'wystan')).toBe(true);
    expect(r.current('m49', 'merrin')).toBe(true);
  });

  it('the war table writes the forecast flags from live favour before the talk opens', () => {
    const r = make();
    const f = forecast(r.kit);
    expect(Object.keys(f).sort()).toEqual(['ashwalker', 'dragons', 'engineers', 'grisel', 'halvard', 'named', 'sally', 'storm', 'supply', 'watch']);
    playM47(r);
    playM48(r);
    playM49(r);
    expect(r.state.getFlag(M49_FORECAST('named'))).toBe(f.named);
  });
});

describe('R26 on both roads', () => {
  const ready = (): Rig => { const r = make(); playM47(r); playM48(r); playM49(r); return r; };

  it('fast: the stairs, two ambushes armed on approach, a guard carried off after each, every crate', () => {
    const r = ready();
    upToR26(r, 'fast');
    expect(r.escorts.starts.map((d) => d.route.length)).toEqual([r.escorts.starts[0]!.route.length]);
    expect(r.flag(R26_CART_OUT)).toBe(true);
    expect(r.flag(R26_GUARD_OUT(1))).toBe(true);
    for (const n of [1, 2] as const) {
      expect(r.flag(R26_AMBUSH_ARM(n))).toBe(false);
      r.at(`${Q}.r26.ambush${n}.2`, 10, 0);
      r.step(16);
      expect(r.flag(R26_AMBUSH_ARM(n))).toBe(true);
      r.fight([R26_AMBUSH[n - 1]!]);
      r.step(2);
      expect(r.flag(R26_WOUNDED(n))).toBe(true);
      expect(r.flag(R26_GUARD_OUT(n))).toBe(false);
    }
    finishR26(r);
    expect(r.qs('r26')).toBe('completed');
    expect(r.flag(R26_CRATES_LEFT)).toBe(false);
    expect(r.flag(R26_CART_OUT)).toBe(false);
  });

  it('long: the east flank, two storm halts with the brake, no ambush, two crates left at the second', () => {
    const r = ready();
    upToR26(r, 'long');
    for (const n of [1, 2] as const) {
      r.escorts.st = { id: R26_ESCORT, reason: 'junction', junction: R26_HALT_NODES[n - 1]!, arrived: false } as never;
      r.emit('escort.junction', { escortId: R26_ESCORT, junction: R26_HALT_NODES[n - 1]! });
      r.step(16);
      expect(r.flag(R26_AT_HALT(n))).toBe(true);
      expect([...r.weather.storms]).toContain(`quest:r26.halt.${n}`);
      r.secs(31);
      expect(r.flag(R26_WAITED(n)), 'no brake, no go').toBe(false);
      expect(r.use(R26_BRAKE(n))).toBe(true);
      r.secs(1);
      expect(r.flag(R26_WAITED(n))).toBe(true);
      expect(r.weather.storms.size).toBe(0);
    }
    expect(r.num(R26_CRATES_LEFT)).toBe(R26_CRATES_LOST);
    for (const n of [1, 2] as const) expect(r.flag(R26_AMBUSH_ARM(n))).toBe(false);
    finishR26(r);
    expect(r.qs('r26')).toBe('completed');
    expect(r.flag(R26_ARRIVED)).toBe(true);
  });
});

describe('R29, M50 and M51', () => {
  const ready = (): Rig => { const r = make(); playM47(r); playM48(r); playM49(r); return r; };

  it('R29: three posts, the parts carried to the gong, the rhythm run (assisted after misses), the gong sounds', () => {
    const r = ready();
    r.begin('r29', 'ansgar');
    for (const n of R29_POSTS) {
      r.talk(R29_GHOST(n));
      r.read(R29_NOTE(n));
      r.step(1);
      r.fight([R29_DEAD(n)]);
      r.carry(`r29-${R29_PARTS[n]}`, R29_GONG_TRIGGER);
      r.step(1);
    }
    expect(r.use(R29_HANG)).toBe(true);
    r.step(1);
    for (let i = 0; i < 8 && !r.flag(R29_STRUCK); i++) {
      r.use(R29_STRIKE);
      r.advance(20_000);
      r.step(7);
    }
    expect(r.flag(R29_STRUCK)).toBe(true);
    expect(r.sounds).toContain('sfx.gong.rim');
    settle(r);
    r.talk('ansgar');
    r.step(2);
    expect(r.qs('r29')).toBe('completed');
  });

  it('M50: the chart\'s order routes a channel; a full gauge vents steam (10%, pushed back) and the lesson glows after two', () => {
    const r = ready();
    r.begin('m50', 'alric');
    r.talk(M50_KEEPER);
    r.read(M50_NOTES.chart);
    r.step(1);
    const route = (c: 1 | 2 | 3): void => { r.enter(M50_CHAMBER_TRIGGER(c)); for (const w of M50_ORDER[c]) r.use(M50_WHEEL(c, w)); settle(r); expect(r.done('m50', `chan${c}`), `chan${c}`).toBe(true); };
    route(1);
    r.fight([M50_GOLEMS(2)]);
    r.read(M50_NOTES.key);
    r.step(1);
    r.enter(M50_CHAMBER_TRIGGER(2));
    const wrong = ([1, 2, 3] as const).find((w) => w !== M50_ORDER[2][0])!;
    r.use(M50_WHEEL(2, wrong));
    expect(r.toasts).toContain('rim.q.m50.wrong');
    r.secs(51);
    expect(r.hits.length).toBe(1);
    expect(r.hits[0]).toBe(10);
    expect(r.teleports.length).toBe(1);
    r.enter(M50_CHAMBER_TRIGGER(2));
    r.secs(61);
    expect(r.toasts).toContain('rim.q.m50.lesson');
    route(2);
    r.fight([M50_GOLEMS(3), M50_GNATS]);
    route(3);
    settle(r);
    expect(r.flag(M50_COMPLETE)).toBe(true);
    r.fight([M50_GOLEMS(4)]);
    r.read(M50_NOTES.mark);
    r.step(1);
    r.talk('alric');
    r.step(2);
    expect(r.qs('m50')).toBe('completed');
  });

  it('M50: leaving a chamber resets it with no fail; steam never takes Cael under 10%', () => {
    const run = new CoolingChannel(1);
    run.start();
    expect(run.press(M50_ORDER[1][0]!)).toBe('right');
    run.reset();
    expect(run.fails).toBe(0);
    expect(run.press(M50_ORDER[1][0]!)).toBe('idle');
    const r = ready();
    r.begin('m50', 'alric');
    r.talk(M50_KEEPER);
    r.read(M50_NOTES.chart);
    r.step(1);
    r.player.actor.health = 12;
    r.enter(M50_CHAMBER_TRIGGER(1));
    r.secs(61);
    expect(r.hits).toEqual([2]);
  });

  it('M51: the horn-stone offers it, the dragons are spoken to from their spots, the scouts and the captain', () => {
    const r = ready();
    const horn = r.interactables.get(M51_HORN)!;
    expect(horn).toBeDefined();
    horn.onInteract();
    r.step(1);
    expect(r.dialogueStarts).toContainEqual([M51_CALL_DIALOGUE, M51_CALL_NPC]);
    r.begin('m51', M51_CALL_NPC);
    r.talk(M51_CALL_NPC, M51_CALL_DIALOGUE);
    r.talk('alric');
    r.talk('edric');
    r.emit('waystone.rekindled', { waystoneId: 'wyrm-terraces', cause: 'player' });
    settle(r);
    expect(r.done('m51', 'landed')).toBe(true);
    for (const d of M51_DRAGONS) {
      expect(r.use(M51_TALK(d)), d).toBe(true);
      r.step(1);
      expect(r.dialogueStarts).toContainEqual([`npc-${d}`, d]);
      r.talk(d);
    }
    settle(r);
    expect(r.done('m51', 'fires')).toBe(true);
    r.fight([...M51_SCOUTS]);
    r.talk(M51_CAPTAIN);
    r.reads([M51_NOTES.orders, M51_NOTES.bones]);
    r.step(1);
    expect(r.use(M51_REPORT)).toBe(true);
    r.talk('ysmeryth');
    r.step(2);
    expect(r.qs('m51')).toBe('completed');
    expect(r.flag('story.m51.complete')).toBe(true);
  });
});

describe('notes', () => {
  it('every note the quests read is in the block\'s list', () => {
    expect(NOTES('note-m47').length).toBe(3);
    expect(NOTES('note-r29').length).toBe(3);
  });
});
