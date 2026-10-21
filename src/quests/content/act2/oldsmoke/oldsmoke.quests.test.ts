// The Phase D surface quests (M16, R09, R10, M21, M22) through a real QuestManager over the shared fakes: the order of
// the objectives, what each event credits, the branches, the rewards and the save round trip.
import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../testKit';
import type { QuestDef } from '../../../types';
import { m16, M16_BRAZIER_ID, M16_SEARCH } from './m16.quest';
import { r09, R09_OFFICE, R09_OFFICE_TRIGGER } from './r09.quest';
import { r10, R10_NOTES } from './r10.quest';
import { m21, M21_EVIDENCE, M21_LETTERS, M21_SECTION } from './m21.quest';
import { m22, M22_PREREQUISITES, M22_BANNER } from './m22.quest';

type W = ReturnType<typeof makeWorld>;
const talk = (w: W, npcId: string, reason?: string) => w.bus.emit('dialogue.ended', { npcId, reason });
const interact = (w: W, interactableId: string) => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action: 'interact' });
const done = (w: W, q: string, o: string) => w.manager.objectiveDone(q, o);
const current = (w: W, q: string): string | undefined => w.manager.objectives(q).find((o) => o.current)?.def.id;
const killOf = (w: W, kind: string, tag: string, id: string) => w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind, spawnTag: tag });
const reads = (w: W, ids: readonly string[]) => { for (const id of ids) talk(w, id, 'completed'); };

/** A quest with one talk objective that stands in for a prerequisite quest: starting and finishing it completes it. */
const stub = (id: string): QuestDef => ({ id, titleKey: `t.${id}`, summaryKey: `s.${id}`, objectives: [{ id: 'o', type: 'talk', target: `${id}-npc`, textKey: `o.${id}` }] });
const finish = (w: W, id: string) => { expect(w.manager.start(id)).toBe(true); talk(w, `${id}-npc`); expect(w.manager.state(id)).toBe('completed'); };
const begin = (w: W, id: string) => { expect(w.manager.start(id), `${id} starts`).toBe(true); };
const rewardItems = (w: W) => w.bus.of('loot.granted').flatMap((p: any) => p.items.map((i: any) => i.itemId));

describe('M16 Grisel\'s Invitation', () => {
  function world(): W {
    const w = makeWorld([stub('d03'), m16]);
    finish(w, 'd03');
    return w;
  }
  function toCourt(w: W) {
    w.bus.emit('trigger.enter', { triggerId: 'trg.q13.m16.pass', actorId: 'p' });
    reads(w, M16_SEARCH);
    for (let i = 0; i < 4; i++) killOf(w, 'ember-hound', 'm16.ambush', `h${i}`);
    talk(w, 'steward-gate-1');
    talk(w, 'aldous');
  }

  it('is refused until D03 is done', () => {
    const w = makeWorld([stub('d03'), m16]);
    expect(w.manager.start('m16')).toBe(false);
    finish(w, 'd03');
    expect(w.manager.start('m16')).toBe(true);
  });

  it('plays through to the report, with the rewards once', () => {
    const w = world();
    begin(w, 'm16');
    toCourt(w);
    expect(current(w, 'm16')).toBe('brazier');
    w.bus.emit('waystone.rekindled', { waystoneId: M16_BRAZIER_ID, cause: 'player' });
    w.bus.emit('story.m16.silent');
    talk(w, 'wenna');
    expect(w.manager.state('m16')).toBe('active');
    talk(w, 'aldous');
    expect(w.manager.state('m16')).toBe('completed');
    expect(w.calls.filter((c) => c === 'xp:500:quest:m16')).toHaveLength(1);
    expect(rewardItems(w)).toContain('grisel-writ');
  });

  it('counts only hounds of the ambush tag, and each hound once', () => {
    const w = world();
    begin(w, 'm16');
    w.bus.emit('trigger.enter', { triggerId: 'trg.q13.m16.pass', actorId: 'p' });
    reads(w, M16_SEARCH);
    killOf(w, 'ember-hound', 'other.tag', 'x1');
    killOf(w, 'slag-crawler', 'm16.ambush', 'x2');
    killOf(w, 'ember-hound', 'm16.ambush', 'h1');
    killOf(w, 'ember-hound', 'm16.ambush', 'h1');
    expect(w.manager.objectives('m16').find((o) => o.def.id === 'ambush')!.progress).toBe(1);
    expect(done(w, 'm16', 'ambush')).toBe(false);
  });

  it('a rekindle of another stone, or one before the court, earns nothing', () => {
    const w = world();
    begin(w, 'm16');
    w.bus.emit('waystone.rekindled', { waystoneId: M16_BRAZIER_ID, cause: 'player' }); // before the court is reached
    toCourt(w);
    w.bus.emit('waystone.rekindled', { waystoneId: 'cinder-road', cause: 'player' });
    expect(done(w, 'm16', 'brazier')).toBe(false);
    w.bus.emit('waystone.rekindled', { waystoneId: M16_BRAZIER_ID, cause: 'player' });
    expect(done(w, 'm16', 'brazier')).toBe(true);
  });

  it('keeps its progress across a save', () => {
    const w = world();
    begin(w, 'm16');
    toCourt(w);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('d03'), m16]);
    w2.manager.load(data);
    expect(w2.manager.state('m16')).toBe('active');
    expect(current(w2, 'm16')).toBe('brazier');
    w2.bus.emit('waystone.rekindled', { waystoneId: M16_BRAZIER_ID, cause: 'player' });
    expect(done(w2, 'm16', 'brazier')).toBe(true);
  });
});

describe('R09 Sooty Coin', () => {
  function world(): W {
    const w = makeWorld([stub('m16'), r09]);
    finish(w, 'm16');
    return w;
  }
  const chest = (w: W, id: string) => w.bus.emit('carry.delivered', { carryId: id, destinationId: R09_OFFICE_TRIGGER });
  function toChoice(w: W) {
    talk(w, 'slagg');
    for (let i = 0; i < 9; i++) killOf(w, 'slag-crawler', 'r09.nest', `c${i}`);
    for (const id of ['r09-chest-1', 'r09-chest-2', 'r09-chest-3']) chest(w, id);
    reads(w, R09_OFFICE);
    talk(w, 'steward-market-2', 'completed');
    talk(w, 'miner-2');
  }

  it('is refused until M16 is done', () => {
    const w = makeWorld([stub('m16'), r09]);
    expect(w.manager.start('r09')).toBe(false);
  });

  it.each(['stewards', 'miners'])('plays through on the %s side, paying the gold once', (side) => {
    const w = world();
    begin(w, 'r09');
    toChoice(w);
    expect(current(w, 'r09')).toBe('choice');
    w.flags.set('story.r09.choice', side);
    w.bus.emit('story.r09.chosen');
    talk(w, 'slagg');
    expect(w.manager.state('r09')).toBe('completed');
    expect(w.gold.n).toBe(300);
    expect(w.calls.filter((c) => c === 'xp:400:quest:r09')).toHaveLength(1);
  });

  it('a chest delivered twice, or to another place, counts once or not at all', () => {
    const w = world();
    begin(w, 'r09');
    talk(w, 'slagg');
    for (let i = 0; i < 9; i++) killOf(w, 'slag-crawler', 'r09.nest', `c${i}`);
    chest(w, 'r09-chest-1');
    chest(w, 'r09-chest-1');
    w.bus.emit('carry.delivered', { carryId: 'r09-chest-2', destinationId: 'trg.elsewhere' });
    expect(w.manager.objectives('r09').find((o) => o.def.id === 'chests')!.progress).toBe(1);
  });

  it('the clerk talk is skipped when R10 ended on the miners\' side (the clerk has left the market)', () => {
    const w = world();
    w.flags.set('story.r10.choice', 'miners');
    begin(w, 'r09');
    talk(w, 'slagg');
    for (let i = 0; i < 9; i++) killOf(w, 'slag-crawler', 'r09.nest', `c${i}`);
    for (const id of ['r09-chest-1', 'r09-chest-2', 'r09-chest-3']) chest(w, id);
    reads(w, R09_OFFICE);
    expect(current(w, 'r09')).toBe('miners');
  });

  it('the nests need nine crawlers of their tag', () => {
    const w = world();
    begin(w, 'r09');
    talk(w, 'slagg');
    for (let i = 0; i < 8; i++) killOf(w, 'slag-crawler', 'r09.nest', `c${i}`);
    killOf(w, 'slag-crawler', 'wild', 'w');
    expect(done(w, 'r09', 'nests')).toBe(false);
    killOf(w, 'slag-crawler', 'r09.nest', 'c8');
    expect(done(w, 'r09', 'nests')).toBe(true);
  });

  it('a side already written closes the choice on reaching it, and none leaves it open', () => {
    const w = world();
    begin(w, 'r09');
    toChoice(w);
    expect(current(w, 'r09')).toBe('choice');
    expect(done(w, 'r09', 'choice')).toBe(false);
    const w2 = world();
    w2.flags.set('story.r09.choice', 'miners');
    begin(w2, 'r09');
    toChoice(w2);
    expect(current(w2, 'r09')).toBe('report');
  });
});

describe('R10 The Miners\' Strike', () => {
  function world(): W {
    const w = makeWorld([stub('m17'), r10]);
    finish(w, 'm17');
    return w;
  }
  function toChoice(w: W) {
    talk(w, 'slagg');
    talk(w, 'miner-1');
    talk(w, 'steward-market-1');
    reads(w, R10_NOTES);
  }

  it('is refused until M17 is done', () => {
    expect(makeWorld([stub('m17'), r10]).manager.start('r10')).toBe(false);
  });

  it.each(['miners', 'stewards'])('the %s side posts the ruling and returns the keys, then reports', (side) => {
    const w = world();
    begin(w, 'r10');
    toChoice(w);
    w.flags.set('story.r10.branch', side);
    w.bus.emit('story.r10.chosen');
    expect(current(w, 'r10')).toBe('ruling');
    interact(w, 'use:r10-ruling');
    interact(w, 'use:r10-keys');
    expect(done(w, 'r10', 'talks')).toBe(true); // the compromise's talks are skipped
    talk(w, 'slagg');
    expect(w.manager.state('r10')).toBe('completed');
    expect(rewardItems(w)).toContain('union-badge');
    expect(w.calls.filter((c) => c === 'xp:450:quest:r10')).toHaveLength(1);
  });

  it('the compromise needs three distinct persuasion talks and skips the ruling and the keys', () => {
    const w = world();
    begin(w, 'r10');
    toChoice(w);
    w.flags.set('story.r10.branch', 'compromise');
    w.bus.emit('story.r10.chosen');
    expect(done(w, 'r10', 'ruling')).toBe(true);
    expect(done(w, 'r10', 'keys')).toBe(true);
    expect(current(w, 'r10')).toBe('talks');
    w.bus.emit('story.r10.persuaded', { n: '1' });
    w.bus.emit('story.r10.persuaded', { n: '1' }); // a repeat after the same gate earns nothing
    w.bus.emit('story.r10.persuaded', { n: '2' });
    expect(done(w, 'r10', 'talks')).toBe(false);
    w.bus.emit('story.r10.persuaded', { n: '3' });
    expect(done(w, 'r10', 'talks')).toBe(true);
    talk(w, 'slagg');
    expect(w.manager.state('r10')).toBe('completed');
  });

  it('the choice waits for Slagg until a branch is written', () => {
    const w = world();
    begin(w, 'r10');
    toChoice(w);
    expect(current(w, 'r10')).toBe('choice');
    expect(done(w, 'r10', 'choice')).toBe(false);
  });

  it('keeps its progress across a save', () => {
    const w = world();
    begin(w, 'r10');
    toChoice(w);
    w.flags.set('story.r10.branch', 'compromise');
    w.bus.emit('story.r10.chosen');
    w.bus.emit('story.r10.persuaded', { n: '1' });
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m17'), r10]);
    w2.flags.set('story.r10.branch', 'compromise');
    w2.manager.load(data);
    w2.bus.emit('story.r10.persuaded', { n: '1' });
    w2.bus.emit('story.r10.persuaded', { n: '2' });
    w2.bus.emit('story.r10.persuaded', { n: '3' });
    expect(done(w2, 'r10', 'talks')).toBe(true);
  });
});

describe('M21 Parley at Deepgate', () => {
  function world(): W {
    const w = makeWorld([stub('m20'), m21]);
    finish(w, 'm20');
    return w;
  }
  function toAudience(w: W) {
    talk(w, 'wenna');
    talk(w, 'steward-hall-1');
    for (const id of M21_EVIDENCE) interact(w, id);
    talk(w, 'aldous');
  }
  const section = (w: W) => w.bus.emit('stealth.section', { sectionId: M21_SECTION, phase: 'cleared' });
  const letters = (w: W) => { for (const id of M21_LETTERS) interact(w, id); };

  it('is refused until M20 is done', () => {
    expect(makeWorld([stub('m20'), m21]).manager.start('m21')).toBe(false);
  });

  it('confront and persuade: no fight, no stealth and no letters', () => {
    const w = world();
    begin(w, 'm21');
    w.flags.set('story.m21.branch', 'confront');
    w.flags.set('story.m21.persuaded', true);
    toAudience(w);
    w.bus.emit('story.m21.chosen');
    expect(done(w, 'm21', 'loyalists')).toBe(true);
    expect(done(w, 'm21', 'stealth')).toBe(true);
    expect(done(w, 'm21', 'letters')).toBe(true);
    talk(w, 'aldous');
    talk(w, 'wenna');
    expect(w.manager.state('m21')).toBe('completed');
    expect(rewardItems(w)).toContain('favour-mark');
    expect(w.calls.filter((c) => c === 'xp:500:quest:m21')).toHaveLength(1);
  });

  it('confront and fail: four loyalists must fall, each once, and only those of the quest\'s tag', () => {
    const w = world();
    begin(w, 'm21');
    w.flags.set('story.m21.branch', 'confront');
    toAudience(w);
    expect(current(w, 'm21')).toBe('loyalists');
    killOf(w, 'steward-guard', 'other', 'g0');
    killOf(w, 'watch-guard', 'm21.loyalists', 'g0');
    for (let i = 0; i < 3; i++) killOf(w, 'steward-guard', 'm21.loyalists', `g${i}`);
    killOf(w, 'steward-guard', 'm21.loyalists', 'g0'); // the same guard again
    expect(done(w, 'm21', 'loyalists')).toBe(false);
    killOf(w, 'steward-guard', 'm21.loyalists', 'g3');
    expect(done(w, 'm21', 'loyalists')).toBe(true);
    expect(done(w, 'm21', 'stealth')).toBe(true);
    expect(current(w, 'm21')).toBe('aftermath');
  });

  it('spy: the stealth section and the three letters, with no fight', () => {
    const w = world();
    begin(w, 'm21');
    w.flags.set('story.m21.branch', 'spy');
    toAudience(w);
    expect(done(w, 'm21', 'loyalists')).toBe(true);
    expect(current(w, 'm21')).toBe('letters');
    letters(w);
    expect(current(w, 'm21')).toBe('stealth');
    w.bus.emit('stealth.section', { sectionId: M21_SECTION, phase: 'entered' });
    expect(done(w, 'm21', 'stealth')).toBe(false);
    section(w);
    expect(current(w, 'm21')).toBe('aftermath');
    talk(w, 'aldous');
    talk(w, 'wenna');
    expect(w.manager.state('m21')).toBe('completed');
  });

  it('the evidence needs all three distinct points', () => {
    const w = world();
    begin(w, 'm21');
    talk(w, 'wenna');
    talk(w, 'steward-hall-1');
    interact(w, M21_EVIDENCE[0]);
    interact(w, M21_EVIDENCE[0]);
    interact(w, M21_EVIDENCE[1]);
    expect(done(w, 'm21', 'evidence')).toBe(false);
    interact(w, M21_EVIDENCE[2]);
    expect(done(w, 'm21', 'evidence')).toBe(true);
  });
});

describe('M22 Return to the Capital', () => {
  function world(skip?: string): W {
    const w = makeWorld([...M22_PREREQUISITES.map(stub), m22]);
    for (const q of M22_PREREQUISITES) if (q !== skip) finish(w, q);
    return w;
  }

  it('waits for twenty prerequisites', () => {
    expect(M22_PREREQUISITES).toHaveLength(20);
    expect(new Set(M22_PREREQUISITES).size).toBe(20);
  });

  it.each(M22_PREREQUISITES.map((q) => [q] as const))('is refused while %s is not done', (q) => {
    const w = world(q);
    expect(w.manager.start('m22')).toBe(false);
    finish(w, q);
    expect(w.manager.start('m22')).toBe(true);
  });

  it('plays through the council, the refusal, the reads and the banner, and never opens Act 3', () => {
    const w = world();
    begin(w, 'm22');
    w.bus.emit('trigger.enter', { triggerId: 'trg.harrowmark.keep-hall', actorId: 'p' });
    w.bus.emit('dialogue.ended', { dialogueId: 'scene-m22-council', reason: 'completed' });
    talk(w, 'grisel-steward');
    talk(w, 'edric');
    reads(w, ['note-m22-fountain', 'note-m22-stalls']);
    interact(w, M22_BANNER);
    w.bus.emit('dialogue.ended', { dialogueId: 'scene-m22-banner', reason: 'completed' });
    expect(w.manager.state('m22')).toBe('active');
    talk(w, 'wystan');
    expect(w.manager.state('m22')).toBe('completed');
    expect(rewardItems(w)).toContain('house-pledge-banner');
    expect(w.calls.filter((c) => c === 'xp:550:quest:m22')).toHaveLength(1);
    expect(w.flags.has('story.gate.a3')).toBe(false);
  });

  it('a skipped or aborted council earns no credit', () => {
    const w = world();
    begin(w, 'm22');
    w.bus.emit('trigger.enter', { triggerId: 'trg.harrowmark.keep-hall', actorId: 'p' });
    w.bus.emit('dialogue.ended', { dialogueId: 'scene-m22-council', reason: 'skip' });
    expect(done(w, 'm22', 'council')).toBe(false);
    w.bus.emit('dialogue.ended', { dialogueId: 'scene-m22-council', reason: 'completed' });
    expect(done(w, 'm22', 'council')).toBe(true);
  });
});
