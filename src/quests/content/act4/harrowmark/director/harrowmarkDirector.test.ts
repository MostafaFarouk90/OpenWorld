// The Harrowmark director on the real quest manager: every quest played through each branch the way the game drives it (talks,
// reads, props, fights, escorts arriving, stealth sections cleared), with a save and load in the middle of the long ones, and the
// out-of-order cases (a fight cleared early, an escort arriving before its step, a wrong valve).
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, NOTES, type Rig } from './rig.testkit';
import { Q } from '../anchors';
import { ACT4_SPAWN_FLAGS as F } from '../../../../../harrowmark/act4/spawners';
import { M35_CHAIN, M35_ESCORT, M35_GUARD, M35_LEAD, M35_NOTES } from '../m35.quest';
import { M36_CHALK, M36_DAGGER_NPC, M36_DAGGER_SCENE, M36_DELEGATE_NPC, M36_NOTE_DROP, M36_NOTE_LEDGER, M36_NOTE_LETTERS, M36_NOTE_PAGE, M36_SECTION } from '../m36.quest';
import { R19_BANNERS, R19_BOUT_WON, R19_CHOICE, R19_HORN, R19_MUSTER, R19_NOTES } from '../r19.quest';
import { R20_CHOICE, R20_LOAD, R20_NOTES, R20_PASSED, R20_SECTION, R20_SERGEANT } from '../r20.quest';
import { R21_ALL_FLAG, R21_CHOICE, R21_DOOR, R21_ESCORT, R21_GRATE, R21_KEEPER, R21_NOTES, R21_SECTION } from '../r21.quest';
import { R22_ANVIL, R22_BELLOWS, R22_FIND, R22_FORGED, R22_HILT, R22_QUENCH, R22_SITES } from '../r22.quest';
import { R23_CHOICE, R23_CLERK, R23_CRUCIBLE, R23_EXPOSED, R23_ORDER, R23_READING, R23_WITNESSES } from '../r23.quest';
import { D07_CAPTIVE, D07_LEDGERS, D07_NOTES, D07_VALVE, D07_VALVES } from '../d07.quest';
import { M37_BOND_NPC, M37_BOND_SCENE, M37_COMPANIONS, M37_END_NPC, M37_END_SCENE, M37_FEAST, M37_NEEDS, M37_SEAT, M37_SUNG, M37_TABLE } from '../m37.quest';
import { R19_BOUT_EVENT } from '../../../../../dialogue/content/act4/harrowmark/cast.dialogue';
import { r20LegId } from './escorts';
import { routeSlice } from '../anchors';
import { CRUCIBLE_ID } from '../../../../../harrowmark/act4/sites';

let r: Rig;
afterEach(() => r?.dispose());

const arrive = (id: string): void => { r.emit('escort.arrived', { escortId: id }); r.step(3); };

/** Plays the bar out with no strikes until it is assisted (the R13 rule: after five failed bars the bar is struck for you). */
function beat(prop: string): void {
  for (let i = 0; i < 8; i++) {
    if (!r.use(prop)) return;
    r.advance(60_000);
    r.step(12);
  }
}

describe('M35 Summons to the Council', () => {
  it('walks the three delegations in, springs the lane ambush on the Grisel leg, and completes', () => {
    r = makeRig({ flags: { 'story.gate.a4': true } });
    r.begin('m35', 'wystan');
    for (const h of ['oswin', 'halvard'] as const) {
      r.talk(M35_LEAD[h]);
      expect(r.escorts.cur).toBeNull(); // the walk waits for the checkpoint
      r.talk(M35_GUARD(h));
      r.step(21);
      expect(r.escorts.cur).toBe(M35_ESCORT(h));
      arrive(M35_ESCORT(h));
      expect(r.done('m35', `${h}In`)).toBe(true);
      r.step(100);
      expect(r.escorts.cur).toBeNull();
    }
    r.talk(M35_LEAD.grisel);
    expect(r.use(M35_CHAIN)).toBe(true);
    r.talk(M35_GUARD('grisel'));
    r.step(21);
    expect(r.escorts.cur).toBe(M35_ESCORT('grisel'));
    expect(r.flag(F.m35Ambush)).toBe(false);
    r.at(`${Q}.m35.lane`);
    r.step(31);
    expect(r.flag(F.m35Ambush)).toBe(true);
    r.fight(['m35.ambush.1', 'm35.ambush.2']);
    expect(r.done('m35', 'ambush')).toBe(true);
    // the party arrives while Cael is still searching the lane: the arrival is kept
    arrive(M35_ESCORT('grisel'));
    r.reads(M35_NOTES);
    r.step(2);
    expect(r.done('m35', 'griselIn')).toBe(true);
    r.step(160);
    expect(r.done('m35', 'entered')).toBe(true);
    r.talk('wystan');
    expect(r.qs('m35')).toBe('completed');
    expect(r.flag('story.m35.complete')).toBe(true);
  });

  it('a load while a delegation walks starts it again', () => {
    r = makeRig({ flags: { 'story.gate.a4': true } });
    r.begin('m35', 'wystan');
    r.talk(M35_LEAD.oswin);
    r.talk(M35_GUARD('oswin'));
    r.step(21);
    r.escorts.cur = null; // a load of a save without the escort
    r.saveLoad();
    r.step(21);
    expect(r.escorts.cur).toBe(M35_ESCORT('oswin'));
  });
});

describe('M36 Votes and Daggers', () => {
  it('crosses the roofs, meets the daggerman at the drop, and chalks the vote', () => {
    r = makeRig();
    r.complete('m35');
    r.begin('m36', 'merrin');
    r.read(M36_NOTE_LEDGER);
    r.set('story.m36.delegate.halvard', 'won');
    r.talk(M36_DELEGATE_NPC.halvard);
    r.read(M36_NOTE_PAGE);
    r.set('story.m36.delegate.oswin', 'lost');
    r.talk(M36_DELEGATE_NPC.oswin);
    r.step(2);
    expect(r.flag(F.m36Rooftops)).toBe(true);
    r.emit('stealth.section', { sectionId: M36_SECTION, phase: 'cleared' });
    r.step(2);
    expect(r.done('m36', 'rooftops')).toBe(true);
    r.step(31);
    expect(r.started(M36_DAGGER_SCENE)).toBe(false); // not at the drop yet
    r.at(`${Q}.m36.drop`);
    r.step(31);
    expect(r.started(M36_DAGGER_SCENE)).toBe(true);
    r.talk(M36_DAGGER_NPC, M36_DAGGER_SCENE);
    r.step(2);
    expect(r.flag(F.m36Daggerman)).toBe(true);
    r.fight(['m36.daggerman']);
    r.reads([M36_NOTE_DROP, M36_NOTE_LETTERS]);
    r.talk(M36_DELEGATE_NPC.grisel);
    expect(r.use(M36_CHALK)).toBe(true);
    r.talk('merrin');
    expect(r.qs('m36')).toBe('completed');
  });
});

describe('R19 Halvard Banners', () => {
  it('writes the pair from the two mustered companies and runs Bran\'s bout', () => {
    r = makeRig();
    r.complete('m35');
    r.begin('r19', 'wystan');
    r.read(R19_NOTES[0]);
    r.set(R19_MUSTER('archers'));
    r.talk('captain-hesketh');
    r.set('story.r19.hold.pikes');
    r.talk('captain-morwen');
    r.step(2);
    expect(r.flag(F.r19Deserters)).toBe(true);
    r.fight(['r19.deserters.1', 'r19.deserters.2']);
    expect(r.current('r19', 'bout')).toBe(true);
    r.emit(R19_BOUT_EVENT);
    r.step(7);
    expect(r.trials.running?.id).toBe('r19.bout');
    expect(r.enemyCalls).toContain('spawn r19.bout');
    r.emit('trial.won', { trialId: 'r19.bout' });
    r.emit('trial.ended', { trialId: 'r19.bout', reason: 'won' });
    r.step(2);
    expect(r.flag(R19_BOUT_WON)).toBe(true);
    expect(r.done('r19', 'bout')).toBe(true);
    r.set(R19_MUSTER('horse'));
    r.talk('captain-bran');
    r.step(31);
    expect(r.str(R19_CHOICE)).toBe('archers-horse');
    r.read(R19_NOTES[1]);
    r.set('story.r19.hold.engineers');
    r.talk('captain-tolly');
    for (const b of R19_BANNERS) expect(r.use(b)).toBe(true);
    expect(r.use(R19_HORN)).toBe(true);
    r.talk('wystan');
    expect(r.qs('r19')).toBe('completed');
  });
});

describe('R20 Oswin\'s Silver', () => {
  const play = (way: 'bribe' | 'stealth' | 'force'): void => {
    r = makeRig();
    r.complete('m35', 'm36');
    r.begin('r20', 'merrin');
    r.set(R20_CHOICE, way);
    r.read(R20_NOTES[0]);
    expect(r.use(R20_LOAD)).toBe(true);
    r.step(21);
    for (const n of [1, 2, 3]) {
      expect(r.escorts.cur, `leg ${n}`).toBe(r20LegId(n));
      arrive(r20LegId(n));
      expect(r.current('r20', `cp${n}`)).toBe(true);
      r.step(21);
      // the cart stays parked until the post is passed
      expect(r.escorts.cur).toBe(r20LegId(n));
      if (way === 'bribe') { r.set(R20_PASSED(n)); r.talk(R20_SERGEANT(n)); r.step(2); }
      if (way === 'stealth') { expect(r.flag(F.r20Stealth(n))).toBe(true); r.emit('stealth.section', { sectionId: R20_SECTION(n), phase: 'cleared' }); }
      if (way === 'force') { expect(r.flag(F.r20Force(n))).toBe(true); r.fight([`r20.cp.${n}`]); }
      r.step(2);
      expect(r.done('r20', `cp${n}`)).toBe(true);
      r.read(R20_NOTES[n]!);
      r.step(21);
    }
    expect(r.escorts.cur).toBe(r20LegId(4));
    expect(r.flag(F.r20Force(1)) || false).toBe(way === 'force');
    arrive(r20LegId(4));
    r.talk('merrin');
    expect(r.qs('r20')).toBe('completed');
  };
  it.each(['bribe', 'stealth', 'force'] as const)('takes the convoy through the three posts on the %s way', (way) => play(way));
  const out = (way: 'stealth' | 'force'): void => {
    r = makeRig();
    r.complete('m35', 'm36');
    r.begin('r20', 'merrin');
    r.set(R20_CHOICE, way);
    r.read(R20_NOTES[0]);
    r.use(R20_LOAD);
    r.step(21);
  };
  it('nothing at a post comes up, and the post cannot be passed, before the cart is parked short of it', () => {
    out('force');
    expect(r.current('r20', 'cp1')).toBe(true);
    expect(r.flag(F.r20Force(1)) || false).toBe(false);
    out('stealth');
    expect(r.flag(F.r20Stealth(1)) || false).toBe(false);
    r.emit('stealth.section', { sectionId: R20_SECTION(1), phase: 'cleared' });
    r.step(21);
    expect(r.flag(R20_PASSED(1)) || false).toBe(false);
    expect(r.escorts.cur).toBe(r20LegId(1));
    arrive(r20LegId(1));
    r.step(21);
    expect(r.flag(F.r20Stealth(1))).toBe(true);
  });
  it('a load while the cart is parked brings it back on the last stretch of its leg, still waiting', () => {
    out('force');
    arrive(r20LegId(1));
    r.step(21);
    const snap = r.snapshot();
    r.escorts.cur = null; // L4 drops an arrived escort from the save
    r.restore(snap);
    r.step(21);
    expect(r.escorts.cur).toBe(r20LegId(1));
    expect(r.escorts.starts.at(-1)!.route).toEqual(routeSlice('r20.convoy', 4, 5));
    arrive(r20LegId(1));
    r.step(41);
    expect(r.escorts.cur).toBe(r20LegId(1));
    r.step(250); // past the group grace after a load
    r.fight(['r20.cp.1']);
    r.step(21);
    expect(r.done('r20', 'cp1')).toBe(true);
    expect(r.escorts.cur).toBe(r20LegId(2));
  });
});

describe('R21 Grisel\'s Daughter', () => {
  it.each([['leaders', 1], ['all', 2]] as const)('walks the miners out (%s: %i groups)', (way, groups) => {
    r = makeRig();
    r.complete('m35', 'm36');
    r.begin('r21', 'wenna');
    r.set(R21_CHOICE, way);
    if (way === 'all') r.set(R21_ALL_FLAG);
    r.talk(R21_KEEPER);
    expect(r.use(R21_DOOR)).toBe(true);
    r.read(R21_NOTES[0]);
    r.step(2);
    expect(r.flag('story.r21.watch')).toBe(true);
    r.emit('stealth.section', { sectionId: R21_SECTION, phase: 'cleared' });
    r.step(2);
    r.fight(way === 'all' ? ['r21.cellars', 'r21.cellars.all'] : ['r21.cellars']);
    expect(r.done('r21', 'patrol')).toBe(true);
    r.read(R21_NOTES[1]);
    expect(r.use(R21_GRATE)).toBe(true);
    for (let g = 1; g <= groups; g++) {
      r.step(21);
      expect(r.escorts.cur).toBe(R21_ESCORT(g));
      expect(r.escorts.starts.at(-1)!.members).toHaveLength(way === 'all' ? 4 : 3);
      arrive(R21_ESCORT(g));
      r.step(70);
    }
    expect(r.done('r21', 'out')).toBe(true);
    r.talk('wenna');
    expect(r.qs('r21')).toBe('completed');
  });
});

describe('R22 The King\'s Blade', () => {
  it('fetches the three materials, forges the blade in two runs, and the choice gives it', () => {
    r = makeRig();
    r.complete('m35');
    r.begin('r22', 'dunstan');
    r.read(NOTES('note-r22')[0]!);
    for (const s of R22_SITES) {
      r.talk(s.local);
      r.step(2);
      expect(r.flag(`story.r22.${s.id}.guards`)).toBe(true);
      r.fight([`r22.guard.${s.id}`]);
      expect(r.use(R22_FIND(s))).toBe(true);
    }
    r.talk('dunstan');
    expect(r.use(R22_BELLOWS)).toBe(true);
    beat(R22_ANVIL(1));
    expect(r.flag(R22_FORGED(1))).toBe(true);
    expect(r.use(R22_QUENCH)).toBe(true);
    beat(R22_ANVIL(2));
    expect(r.flag(R22_FORGED(2))).toBe(true);
    expect(r.use(R22_HILT)).toBe(true);
    r.set('story.r22.choice', 'heavy');
    r.talk('dunstan');
    expect(r.qs('r22')).toBe('completed');
  });
});

describe('R23 The Watch Remembers', () => {
  it.each(['public', 'private'] as const)('takes five testimonies and exposes the orders (%s)', (way) => {
    r = makeRig();
    r.complete('m35');
    r.begin('r23', 'rook');
    R23_WITNESSES.forEach((w, i) => {
      if (i === 0) r.set(R23_CRUCIBLE);
      r.talk(w);
      r.read(R23_ORDER(i + 1));
      r.step(2);
      if (i === 2) { expect(r.flag(F.r23Forger)).toBe(true); r.fight(['r23.forger']); }
    });
    r.set(R23_CHOICE, way);
    r.talk('rook');
    if (way === 'public') { expect(r.use(R23_READING)).toBe(true); r.step(2); }
    else { expect(r.use(R23_READING)).toBe(false); r.set(R23_EXPOSED); r.talk(R23_CLERK); r.step(2); }
    expect(r.done('r23', 'expose')).toBe(true);
    r.talk('rook');
    expect(r.qs('r23')).toBe('completed');
  });
});

describe('D07 The Regent\'s Crucible', () => {
  it('enters, clears, reads, turns the valves in the log\'s order (a wrong wheel starts over) and hands in after the boss', () => {
    r = makeRig({ flags: { [R23_CRUCIBLE]: true } });
    r.complete('m35');
    r.begin('d07', 'rook');
    r.emit('interior.entered', { interiorId: CRUCIBLE_ID, doorId: 'x' });
    r.step(2);
    expect(r.done('d07', 'enter')).toBe(true);
    r.talk(D07_CAPTIVE);
    r.fight(['d07.vat-1', 'd07.cradles', 'd07.vat-2', 'd07.forge']);
    expect(r.done('d07', 'halls')).toBe(true);
    r.reads([D07_NOTES.stamp, D07_NOTES.tally]);
    r.step(2);
    expect(r.done('d07', 'forge')).toBe(true);
    r.reads([D07_NOTES.ledgers, D07_NOTES.log]);
    expect(r.flag(D07_LEDGERS)).toBe(true);
    // middle, north, south: 2, 3, 1; a wrong wheel puts the count back
    r.use(D07_VALVE(2)); r.use(D07_VALVE(1));
    expect(r.toasts).toContain('harrowmark.a4.q.d07.valveWrong');
    r.use(D07_VALVE(2)); r.use(D07_VALVE(3)); r.use(D07_VALVE(1));
    r.step(2);
    expect(r.flag(D07_VALVES)).toBe(true);
    expect(r.done('d07', 'valves')).toBe(true);
    r.set('boss.bellows-engine.outcome', 'defeated');
    r.emit('boss.defeated', { bossId: 'bellows-engine', actorId: 'b' });
    r.step(2);
    r.talk('rook');
    expect(r.qs('d07')).toBe('completed');
  });
});

describe('M37 The Night Before', () => {
  it('waits for every other quest, then plays the feast, the seats, the war-song, Gaut and the toast', () => {
    r = makeRig({ flags: { [R23_CRUCIBLE]: true } });
    expect(r.manager.start('m37')).toBe(false);
    r.complete('m35', ...M37_NEEDS.filter((q) => q !== 'm35'));
    r.begin('m37', 'tobb');
    expect(r.use(M37_FEAST)).toBe(true);
    for (const c of M37_COMPANIONS) {
      expect(r.use(M37_SEAT(c))).toBe(true);
      expect(r.started(M37_BOND_SCENE(c))).toBe(true);
      r.talk(M37_BOND_NPC(c), M37_BOND_SCENE(c));
    }
    beat(M37_TABLE);
    expect(r.flag(M37_SUNG)).toBe(true);
    r.talk('gaut');
    r.at(`${Q}.m37.feast`);
    r.step(31);
    expect(r.started(M37_END_SCENE)).toBe(true);
    r.talk(M37_END_NPC, M37_END_SCENE);
    expect(r.qs('m37')).toBe('completed');
    expect(r.flag('story.m37.complete')).toBe(true);
  });
});
