// Review A #1 and #2 (plans/act2-followups/review-a.md): an `event` objective is credited only while it is current, and
// these three events can fire before their objective opens and never fire again. Each carries a `doneWhen` on the flag
// the world keeps, so the real QuestManager credits it as soon as it becomes current.
import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../testKit';
import type { QuestDef } from '../../types';
import { D03_BOSS_OUTCOME, D03_KEEP, d03 } from './d03.quest';
import { m11 } from './m11.quest';
import { m14 } from './m14.quest';

/** The real def, started directly (its startWhen reads quests these tests do not play). */
function begin(def: QuestDef) {
  const w = makeWorld([{ ...def, startWhen: undefined }]);
  expect(w.manager.start(def.id)).toBe(true);
  return w;
}
/** Completes every objective before `id` the way a script would, so `id` is the current one. */
function upTo(w: ReturnType<typeof makeWorld>, def: QuestDef, id: string): void {
  for (const o of def.objectives) {
    if (o.id === id) break;
    w.manager.completeObjective(def.id, o.id);
  }
  expect(w.manager.isObjectiveCurrent(def.id, id)).toBe(true);
}
const done = (w: ReturnType<typeof makeWorld>, q: string, o: string) => w.manager.objectiveDone(q, o);
const read = (w: ReturnType<typeof makeWorld>, ids: readonly string[]) => {
  for (const npcId of ids) w.bus.emit('dialogue.ended', { npcId, dialogueId: npcId, reason: 'completed' });
};

describe('D03: Redmane fought before the four keep papers are read (review-a #1)', () => {
  it.each(['spared', 'defeated'])('an outcome of %s while `keep` is current credits `boss` once the papers are read', (outcome) => {
    const w = begin(d03);
    upTo(w, d03, 'keep');
    // A8: the registry writes the outcome flag, then raises the event; `keep` is current, so the event is dropped.
    w.flags.set(D03_BOSS_OUTCOME, outcome);
    w.bus.emit(outcome === 'spared' ? 'boss.spared' : 'boss.defeated', { bossId: 'thrandil-redmane', actorId: 'b' });
    expect(done(w, 'd03', 'boss')).toBe(false);
    read(w, D03_KEEP);
    expect(done(w, 'd03', 'keep')).toBe(true);
    expect(done(w, 'd03', 'boss')).toBe(true);
    expect(w.manager.isObjectiveCurrent('d03', 'prisoners')).toBe(true);
  });

  it('with no outcome yet, `boss` stays open after the papers and still takes the live event; an unknown outcome does not count', () => {
    const w = begin(d03);
    upTo(w, d03, 'keep');
    w.flags.set(D03_BOSS_OUTCOME, 'fighting'); // not an outcome A8 writes
    read(w, D03_KEEP);
    expect(done(w, 'd03', 'boss')).toBe(false);
    w.bus.emit('boss.spared', { bossId: 'some-other-boss', actorId: 'x' });
    expect(done(w, 'd03', 'boss')).toBe(false);
    // the doneWhen is also what a load re-checks
    w.flags.set(D03_BOSS_OUTCOME, 'defeated');
    w.manager.recheck();
    expect(done(w, 'd03', 'boss')).toBe(true);
  });

  it('three papers read is not enough: the outcome waits for the fourth', () => {
    const w = begin(d03);
    upTo(w, d03, 'keep');
    w.flags.set(D03_BOSS_OUTCOME, 'spared');
    read(w, D03_KEEP.slice(0, 3));
    expect(done(w, 'd03', 'keep')).toBe(false);
    expect(done(w, 'd03', 'boss')).toBe(false);
    read(w, D03_KEEP.slice(3));
    expect(done(w, 'd03', 'boss')).toBe(true);
  });
});

describe('M11 and M14: the stone or shrine lit before its objective (review-a #2)', () => {
  it('M11: the Cinder Road stone lit during the ambush credits `stone` when the wraiths are down', () => {
    const w = begin(m11);
    upTo(w, m11, 'ambush');
    w.flags.set('waystone.cinder-road.lit', true);
    w.bus.emit('waystone.rekindled', { waystoneId: 'cinder-road', cause: 'player' });
    expect(done(w, 'm11', 'stone')).toBe(false);
    for (const o of ['ambush', 'search', 'blooms', 'wraiths']) w.manager.completeObjective('m11', o);
    expect(done(w, 'm11', 'stone')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m11', 'report')).toBe(true);
  });

  it('M11: another lit stone does not count; the Cinder Road flag found on a load does', () => {
    const w = makeWorld([{ ...m11, startWhen: undefined }]);
    w.flags.set('waystone.cinderford.lit', true);
    w.manager.start('m11');
    upTo(w, m11, 'stone');
    expect(done(w, 'm11', 'stone')).toBe(false);
    w.flags.set('waystone.cinder-road.lit', true);
    w.manager.recheck(); // as on save.loaded
    expect(done(w, 'm11', 'stone')).toBe(true);
  });

  it('M14: the Hushed Anvil shrine lit past the golems credits `rekindle` when the hounds are down', () => {
    const w = begin(m14);
    upTo(w, m14, 'golems');
    w.flags.set('shrine.hushed-anvil.lit', true);
    w.bus.emit('shrine.rekindled', { shrineId: 'hushed-anvil' });
    expect(done(w, 'm14', 'rekindle')).toBe(false);
    w.manager.completeObjective('m14', 'golems');
    w.manager.completeObjective('m14', 'hounds');
    expect(done(w, 'm14', 'rekindle')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m14', 'murals')).toBe(true);
  });

  it('M14: an unlit shrine (or only its waystone flag) leaves `rekindle` open; the live event still credits it', () => {
    const w = begin(m14);
    w.flags.set('waystone.hushed-anvil.lit', true); // the binding has not lit the shrine yet
    upTo(w, m14, 'rekindle');
    expect(done(w, 'm14', 'rekindle')).toBe(false);
    w.bus.emit('shrine.rekindled', { shrineId: 'quenchstone' });
    expect(done(w, 'm14', 'rekindle')).toBe(false);
    w.flags.set('shrine.hushed-anvil.lit', true);
    w.manager.recheck();
    expect(done(w, 'm14', 'rekindle')).toBe(true);
  });
});

describe('M14: tempers done before `temper` is current (K0 precheck)', () => {
  it('two tempers recorded as story.m14.tempered credit `temper` as soon as it opens', () => {
    const w = begin(m14);
    upTo(w, m14, 'golems');
    // the director counted the tempers the Anvil allowed while M14 was active (the live events were dropped: not current)
    w.bus.emit('gear.tempered', { itemId: 'sword', level: 1 });
    w.bus.emit('gear.tempered', { itemId: 'sword', level: 2 });
    w.flags.set('story.m14.tempered', true);
    for (const id of ['golems', 'hounds', 'rekindle', 'murals', 'keeper']) {
      expect(done(w, 'm14', 'temper')).toBe(false);
      w.manager.completeObjective('m14', id);
    }
    expect(done(w, 'm14', 'temper')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m14', 'sings')).toBe(true);
  });

  it('one temper before and one while current: the flag plus a recheck credits it; a load re-checks it too', () => {
    const w = begin(m14);
    upTo(w, m14, 'temper');
    w.bus.emit('gear.tempered', { itemId: 'sword', level: 1 }); // live: progress 1
    expect(done(w, 'm14', 'temper')).toBe(false);
    w.flags.set('story.m14.tempered', true); // the director's count reached two (one earlier, one now)
    w.manager.recheck();
    expect(done(w, 'm14', 'temper')).toBe(true);
  });

  it('without the flag the objective still needs two live tempers', () => {
    const w = begin(m14);
    upTo(w, m14, 'temper');
    w.manager.recheck();
    expect(done(w, 'm14', 'temper')).toBe(false);
    w.bus.emit('gear.tempered', { itemId: 'sword', level: 1 });
    w.bus.emit('gear.tempered', { itemId: 'sword', level: 2 });
    expect(done(w, 'm14', 'temper')).toBe(true);
  });
});
