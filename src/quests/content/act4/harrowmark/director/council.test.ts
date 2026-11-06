// PR 2's director on the real quest manager: the Council, Gaut's stand, the deep run and the camp, played the way the game
// drives them (talks, props, scenes, waves, escorts arriving), with a save and load at the awkward points.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './rig.testkit';
import { CHAMBER_ID, DEEP_RUN_ID } from '../../../../../harrowmark/act4/sites';
import { M38_WITNESS_BAND } from '../../../../../dialogue/content/act4/harrowmark/council.dialogue';
import { OATHBLADE } from '../../../../../items/act4/catalog';
import { HARROWMARK_A4_PR1_IDS } from '../ids';
import { M38_BETRAYAL, M38_CASE_NPC, M38_CASE_SCENE, M38_CHAMBER_GROUP, M38_EVIDENCE, M38_NOTES, M38_TURNED } from '../m38.quest';
import { M39_BARRICADE, M39_BREATH_SCENE, M39_FALL, M39_FALLEN, M39_GUARD, M39_HELD, M39_NOTE_TOKEN, M39_RESPAWN_ID, M39_STAIRHEAD, M39_WAVES } from '../m39.quest';
import { M40_DENS, M40_ESCORT, M40_JUNCTION_SCENE, M40_OUT, M40_RESPAWN_ID, M40_SLUICE } from '../m40.quest';
import { M41_CAMP_SCENE, M41_FIRE, M41_GATHERED, M41_MAP, M41_NOTES } from '../m41.quest';
import { M39_MERCY, M39_OATHBLADE, M39_WAVES_DONE, M40_ROUTE, M40_SPLIT, m40LegId, witnessBand, witnessTotal } from './council';

let r: Rig;
afterEach(() => r?.dispose());

const before = (flags: Record<string, boolean | number | string> = {}): Rig => {
  r = makeRig({ flags: { 'story.r23.crucible': true, ...flags } });
  r.complete(...HARROWMARK_A4_PR1_IDS);
  return r;
};
const spawned = (g: string): boolean => r.enemyCalls.includes(`spawn ${g}`);

function playM38(): void {
  r.begin('m38', 'edric');
  r.emit('interior.entered', { interiorId: CHAMBER_ID });
  r.step(2);
  for (const id of ['wystan', 'merrin', 'wenna']) r.talk(id);
  expect(r.use(M38_EVIDENCE)).toBe(true);
  r.step(31);
  expect(r.started(M38_CASE_SCENE)).toBe(true);
  r.talk(M38_CASE_NPC, M38_CASE_SCENE);
  r.step(31);
}

function playM39(): void {
  r.talk('gaut');
  r.step(31);
  expect(spawned(M39_STAIRHEAD)).toBe(true);
  r.fight([M39_STAIRHEAD]);
  expect(r.use(M39_BARRICADE)).toBe(true);
  r.step(31);
  expect(r.waves.starts).toEqual([M39_WAVES]);
  for (let i = 0; i < 4; i++) { r.emit('wave.cleared', { defId: M39_WAVES, index: i }); r.step(2); }
  r.waves.current = null;
  r.step(31);
  expect(spawned(M39_GUARD)).toBe(true);
  r.fight([M39_GUARD]);
  r.step(31);
}

describe('M38 The Council of Houses', () => {
  it('runs the case, plays the betrayal (which brings in the six), and ends on Edric\'s rally; M39 follows on the stairs', () => {
    before();
    playM38();
    expect(r.scenes.played).toEqual([M38_BETRAYAL]);
    expect(r.flag(M38_TURNED)).toBe(true);
    expect(spawned(M38_CHAMBER_GROUP)).toBe(true);
    expect(r.current('m38', 'fight')).toBe(true);
    r.fight([M38_CHAMBER_GROUP]);
    expect(r.current('m38', 'search')).toBe(true);
    r.reads(M38_NOTES);
    r.talk('edric');
    r.step(3);
    expect(r.qs('m38')).toBe('completed');
    expect(r.flag('story.m38.complete')).toBe(true);
    expect(r.toasts).toContain('harrowmark.a4.q.m38.stairsOpen');
    expect(r.qs('m39')).toBe('active');
    expect(r.checkpoints.get(M39_RESPAWN_ID)).toBe('harrowmark.a4.stairs.checkpoint');
  });

  it('a skipped betrayal (its end flag written, no scene steps run) still brings in the six, and the fight completes', () => {
    before();
    r.begin('m38', 'edric');
    r.emit('interior.entered', { interiorId: CHAMBER_ID });
    for (const id of ['wystan', 'merrin', 'wenna']) r.talk(id);
    r.use(M38_EVIDENCE);
    r.talk(M38_CASE_NPC, M38_CASE_SCENE);
    r.set(M38_TURNED); // what skip() writes
    r.step(62);
    expect(spawned(M38_CHAMBER_GROUP)).toBe(true);
    r.fight([M38_CHAMBER_GROUP]);
    expect(r.done('m38', 'fight')).toBe(true);
  });

  it('a load mid-fight that did not bring the six back spawns them again (no free pass)', () => {
    before();
    playM38();
    const n = r.enemyCalls.filter((c) => c === `spawn ${M38_CHAMBER_GROUP}`).length;
    r.standing.set(M38_CHAMBER_GROUP, ['a']);
    r.step(31);
    r.saveLoad();
    r.step(250);
    expect(r.done('m38', 'fight')).toBe(false);
    expect(r.enemyCalls.filter((c) => c === `spawn ${M38_CHAMBER_GROUP}`).length).toBe(n + 1);
  });

  it('never plays the betrayal before the case is heard', () => {
    before();
    r.begin('m38', 'edric');
    r.emit('interior.entered', { interiorId: CHAMBER_ID });
    r.step(62);
    expect(r.scenes.played).toEqual([]);
    expect(spawned(M38_CHAMBER_GROUP)).toBe(false);
  });

  it('a load after the betrayal does not play it again, and the fight still credits', () => {
    before();
    playM38();
    r.saveLoad();
    r.step(250);
    expect(r.scenes.played).toEqual([M38_BETRAYAL]);
    r.fight([M38_CHAMBER_GROUP]);
    expect(r.done('m38', 'fight')).toBe(true);
  });
});

describe('the witness band the case reads', () => {
  it('sums the three counts and the two bosses spared: 0 none, 1 to 3 few, 4 or more many', () => {
    const k = (f: Record<string, number | string>) => ({ num: (x: string) => Number(f[x] ?? 0), str: (x: string) => String(f[x] ?? '') });
    expect(witnessTotal(k({}))).toBe(0);
    expect(witnessTotal(k({ 'story.a2.witnesses': 1, 'story.m27.witnesses': 1 }))).toBe(2);
    expect(witnessTotal(k({ 'story.m33.witnesses': 2, 'boss.thrandil-redmane.outcome': 'spared', 'boss.corvin-skarl.outcome': 'spared' }))).toBe(4);
    expect(witnessTotal(k({ 'boss.thrandil-redmane.outcome': 'slain' }))).toBe(0);
    expect([0, 1, 3, 4, 9].map(witnessBand)).toEqual(['none', 'few', 'few', 'many', 'many']);
  });

  it('is written on entering the chamber, from the save\'s flags', () => {
    before({ 'story.a2.witnesses': 2, 'story.m27.witnesses': 1, 'boss.corvin-skarl.outcome': 'spared' });
    r.begin('m38', 'edric');
    r.emit('interior.entered', { interiorId: CHAMBER_ID });
    expect(r.str(M38_WITNESS_BAND)).toBe('many');
  });
});

describe('M39 Gaut\'s Last Stand', () => {
  const toM39 = (): void => {
    before();
    playM38();
    r.fight([M38_CHAMBER_GROUP]);
    r.reads(M38_NOTES);
    r.talk('edric');
    r.step(3);
  };

  it('stair head, barricade, four waves with Gaut\'s breath after the second, the guard, the fall, the sword', () => {
    toM39();
    playM39();
    expect(r.started(M39_BREATH_SCENE)).toBe(true);
    expect(r.flag(M39_HELD)).toBe(true);
    expect(r.scenes.played).toContain(M39_FALL);
    expect(r.flag(M39_FALLEN)).toBe(true);
    r.read(M39_NOTE_TOKEN);
    r.talk('edric');
    r.step(3);
    expect(r.qs('m39')).toBe('completed');
    expect(r.bag.get(OATHBLADE.sword)).toBe(1);
    expect(r.tempers.get(OATHBLADE.sword)).toBe(OATHBLADE.temper);
    expect(r.checkpoints.has(M39_RESPAWN_ID)).toBe(false);
    expect(r.flag('story.m39.complete')).toBe(true);
  });

  it('the guard never comes before the fourth wave falls', () => {
    toM39();
    r.talk('gaut');
    r.step(31);
    r.fight([M39_STAIRHEAD]);
    r.use(M39_BARRICADE);
    r.step(31);
    r.emit('wave.cleared', { defId: M39_WAVES, index: 0 });
    r.step(62);
    expect(spawned(M39_GUARD)).toBe(false);
    expect(r.flag(M39_WAVES_DONE)).toBe(false);
  });

  it('a load mid-wave asks no second start while the wave director still has its run', () => {
    toM39();
    r.talk('gaut');
    r.step(31);
    r.fight([M39_STAIRHEAD]);
    r.use(M39_BARRICADE);
    r.step(31);
    r.saveLoad();
    r.step(62);
    expect(r.waves.starts).toEqual([M39_WAVES]);
  });

  it('gives the trinket to a class that is not a Knight, and waits for room in a full pack', () => {
    toM39();
    r.setClass('mage');
    r.setBagRoom(0);
    playM39();
    r.read(M39_NOTE_TOKEN);
    r.talk('edric');
    r.step(3);
    expect(r.toasts).toContain('harrowmark.a4.q.m39.bagFull');
    expect(r.flag(M39_OATHBLADE)).toBe(false);
    r.setBagRoom(5);
    r.step(301);
    expect(r.bag.get(OATHBLADE.carried)).toBe(1);
    expect(r.bag.has(OATHBLADE.sword)).toBe(false);
  });

  it('a Footman spared on the stairs is Halvard\'s +1, once per Footman', () => {
    toM39();
    const before = r.state.favour('halvard');
    r.actorTags.set('f1', 'm39.waves');
    r.actorTags.set('f2', 'm36.rooftops');
    r.emit('mercy', { verb: 'spare', tier: 'creature', track: null, creature: 'footman', actorId: 'f1' });
    r.emit('mercy', { verb: 'spare', tier: 'creature', track: null, creature: 'footman', actorId: 'f1' });
    r.emit('mercy', { verb: 'spare', tier: 'creature', track: null, creature: 'footman', actorId: 'f2' });
    expect(r.state.favour('halvard')).toBe(before + 1);
    expect(r.num(M39_MERCY)).toBe(1);
  });
});

describe('M40 Flight Through the Underways', () => {
  const toM40 = (): void => {
    before();
    r.complete('m38', 'm39');
    r.step(2);
    r.begin('m40', 'rook');
    r.emit('interior.entered', { interiorId: DEEP_RUN_ID });
    r.step(21);
  };

  it('walks Rook and the King to the sluice, waits for the wheel, then on to the ladder', () => {
    toM40();
    const leg1 = r.escorts.starts[0]!;
    expect(leg1.id).toBe(m40LegId(1));
    expect(leg1.members.map((m) => m.id)).toEqual(['rook', 'edric']);
    expect(leg1.route.at(-1)).toBe(M40_ROUTE[M40_SPLIT]);
    expect(Object.values(leg1.junctionDialogue ?? {})).toContain(M40_JUNCTION_SCENE(1));
    r.fight([M40_DENS[0]]);
    arrive(m40LegId(1));
    expect(r.toasts).toContain('harrowmark.a4.q.m40.gate');
    r.step(41);
    expect(r.escorts.cur).toBe(m40LegId(1)); // parked at the gate
    expect(r.use(M40_SLUICE)).toBe(true);
    r.step(41);
    const leg2 = r.escorts.starts.at(-1)!;
    expect(leg2.id).toBe(M40_ESCORT);
    expect(leg2.route[0]).toBe(M40_ROUTE[M40_SPLIT]);
    expect(leg2.route.at(-1)).toBe(M40_ROUTE.at(-1));
    expect(Object.values(leg2.junctionDialogue ?? {})).toEqual(expect.arrayContaining([M40_JUNCTION_SCENE(2), M40_JUNCTION_SCENE(3)]));
    r.fight([M40_DENS[1]]);
    arrive(M40_ESCORT);
    expect(r.flag(M40_OUT)).toBe(true);
    expect(r.qs('m40')).toBe('completed');
    expect(r.qs('m41')).toBe('active');
    expect(r.checkpoints.has(M40_RESPAWN_ID)).toBe(false);
  });

  it('a load while parked at the gate brings the column back on its last stretch only', () => {
    toM40();
    r.fight([M40_DENS[0]]);
    arrive(m40LegId(1));
    r.escorts.cur = null; // L4 does not save an escort that had arrived
    r.saveLoad();
    r.step(41);
    const back = r.escorts.starts.at(-1)!;
    expect(back.id).toBe(m40LegId(1));
    expect(back.route).toEqual(M40_ROUTE.slice(M40_SPLIT - 1, M40_SPLIT + 1));
    expect(back.stopAt).toEqual([]);
  });

  it('sets each deep-run checkpoint as it is passed, never going back to an earlier one', () => {
    toM40();
    r.at('harrowmark.a4.deeprun.checkpoint.2');
    r.step(31);
    expect(r.checkpoints.get(M40_RESPAWN_ID)).toBe('harrowmark.a4.deeprun.checkpoint.2');
    r.at('harrowmark.a4.deeprun.checkpoint.1');
    r.step(31);
    expect(r.checkpoints.get(M40_RESPAWN_ID)).toBe('harrowmark.a4.deeprun.checkpoint.2');
    r.at('harrowmark.a4.deeprun.checkpoint.3');
    r.step(31);
    expect(r.checkpoints.get(M40_RESPAWN_ID)).toBe('harrowmark.a4.deeprun.checkpoint.3');
  });

  it('nothing walks before the player is in the deep run', () => {
    before();
    r.complete('m38', 'm39');
    r.begin('m40', 'rook');
    r.step(41);
    expect(r.escorts.starts).toEqual([]);
  });
});

describe('M41 The Boy King Remembers', () => {
  it('starts on M40, plays the gathering at the camp, and completes on Ashgate', () => {
    before();
    r.complete('m38', 'm39', 'm40');
    r.step(2);
    expect(r.qs('m41')).toBe('active');
    r.step(31);
    expect(r.scenes.played).toEqual([]); // far from the camp
    r.at('harrowmark.a4.m41.camp');
    r.step(31);
    expect(r.scenes.played).toEqual([M41_CAMP_SCENE]);
    expect(r.flag(M41_GATHERED)).toBe(true);
    r.step(2);
    for (const id of ['edric', 'rook', 'wystan']) r.talk(id);
    r.use(M41_MAP);
    r.use(M41_FIRE);
    r.reads(M41_NOTES);
    r.talk('edric');
    r.step(3);
    expect(r.qs('m41')).toBe('completed');
  });
});

function arrive(id: string): void {
  r.emit('escort.arrived', { escortId: id });
  r.step(3);
}
