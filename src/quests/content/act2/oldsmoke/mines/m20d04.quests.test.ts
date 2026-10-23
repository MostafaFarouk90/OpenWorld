// M20 Chain and Ember and D04 The Deepdelve Descent through a real QuestManager over the shared fakes: the order of the
// objectives, what each event credits, the any-order chains, the flags, the save round trip and the rewards.
import { describe, expect, it } from 'vitest';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { validateQuest } from '../../../../validate';
import { makeWorld } from '../../../../testKit';
import type { QuestDef } from '../../../../types';
import { BOSS_MERCY } from '../../../../../enemies/tuning';
import { M20D04, M20_CHAIN_FLAGS, M20_CHAINS, M20_NOTES, M20_ORSK_GONE, M20_STEWARD_TAG, D04_NOTES, D04_OUTCOME_FLAG } from './m20d04.content';
import { M20D04_ITEMS, M20D04_QUEST_STRINGS } from './m20d04.text';
import { M20D04_PROPS } from './m20d04.data';

const [m20, d04] = M20D04.quests;
type W = ReturnType<typeof makeWorld>;

const talk = (w: W, npcId: string, reason?: string) => w.bus.emit('dialogue.ended', { npcId, reason });
const interact = (w: W, interactableId: string) => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action: 'interact' });
const done = (w: W, q: string, o: string) => w.manager.objectiveDone(q, o);
const current = (w: W, q: string): string | undefined => w.manager.objectives(q).find((o) => o.current)?.def.id;
const progress = (w: W, q: string, o: string) => w.manager.objectives(q).find((x) => x.def.id === o)!.progress;
const killOf = (w: W, kind: string, tag: string, id: string) => w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind, spawnTag: tag });
const reads = (w: W, ids: readonly string[]) => { for (const id of ids) talk(w, id, 'completed'); };
const stub = (id: string): QuestDef => ({ id, titleKey: `t.${id}`, summaryKey: `s.${id}`, objectives: [{ id: 'o', type: 'talk', target: `${id}-npc`, textKey: `o.${id}` }] });
const finish = (w: W, id: string) => { expect(w.manager.start(id)).toBe(true); talk(w, `${id}-npc`); expect(w.manager.state(id)).toBe('completed'); };
const begin = (w: W, id: string) => { expect(w.manager.start(id), `${id} starts`).toBe(true); };
const rewardItems = (w: W) => w.bus.of('loot.granted').flatMap((p: any) => p.items.map((i: any) => i.itemId));
const orsk = (w: W, beat: string) => w.bus.emit('wyrm.orsk', { beat });

describe('M20 and D04 definitions', () => {
  it('validate against their strings, with the ids the plan names', () => {
    const has = (k: string) => k in M20D04_QUEST_STRINGS;
    for (const q of M20D04.quests) expect(validateQuest(q, has), q.id).toEqual([]);
    expect(M20D04.quests.map((q) => q.id)).toEqual(['m20', 'd04']);
  });

  it('every prop objective exists, every chain prop writes its own chain flag, and the items are registered once', () => {
    for (const p of M20D04_PROPS) {
      const q = M20D04.quests.find((x) => x.id === p.objective[0])!;
      expect(q.objectives.some((o) => o.id === p.objective[1])).toBe(true);
    }
    expect(M20D04_PROPS.map((p) => p.usedFlag)).toEqual([...M20_CHAIN_FLAGS]);
    expect(M20D04_ITEMS.map((i) => i.id)).toEqual(['orsks-cinder', 'slag-core']);
    for (const i of M20D04_ITEMS) expect(M20D04.itemStrings[`item.${i.id}.name`]).toBeTruthy();
  });

  it('the Slagmaw has no mercy row (D04 needs none)', () => {
    expect(BOSS_MERCY['the-slagmaw']).toBeUndefined();
  });

  it('the objective flags never write story.d04.started', () => {
    expect(M20D04.flags.some((f) => f.flag === 'story.d04.started')).toBe(false);
  });

  it('every spawner kill kind and tag matches an objective', () => {
    const wants = new Set(M20D04.quests.flatMap((q) => q.objectives.filter((o) => o.type === 'kill').map((o) => `${o.target}|${o.spawnTag}`)));
    for (const s of M20D04.spawners.filter((x) => x.enemy !== 'wyrmling')) expect(wants.has(`${s.enemy}|${s.tag}`), s.id).toBe(true);
  });

  it('M20 has eight steward posts of four and five wyrmlings, one chain flag each', () => {
    const stewards = M20D04.spawners.filter((s) => s.enemy === 'steward-guard');
    expect(stewards.reduce((n, s) => n + s.count, 0)).toBe(8);
    const nursery = M20D04.spawners.find((s) => s.enemy === 'wyrmling')!;
    expect(nursery.count).toBe(5);
    expect(nursery.memberAnchors).toHaveLength(5);
  });
});

describe('M20 Chain and Ember', () => {
  function world(): W {
    const w = makeWorld([stub('m19'), m20]);
    finish(w, 'm19');
    return w;
  }
  const toChains = (w: W) => {
    talk(w, 'wenna');
    for (let i = 0; i < 8; i++) killOf(w, 'steward-guard', M20_STEWARD_TAG, `s${i}`);
    talk(w, 'steward-captain');
  };
  const breakChains = (w: W, order: readonly number[]) => {
    for (const n of order) {
      interact(w, M20_CHAINS[n - 1]);
      w.flags.set(`story.m20.chain.${n}`, true); // what the prop does on use
    }
  };

  it('is refused until M19 is done', () => {
    const w = makeWorld([stub('m19'), m20]);
    expect(w.manager.start('m20')).toBe(false);
    finish(w, 'm19');
    expect(w.manager.start('m20')).toBe(true);
  });

  it('plays through to the aftermath, with the rewards once', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    expect(current(w, 'm20')).toBe('chains');
    breakChains(w, [1, 2, 3, 4, 5]);
    reads(w, M20_NOTES);
    talk(w, 'wyrmling-keeper');
    expect(current(w, 'm20')).toBe('chainsBroken');
    orsk(w, 'chainsBroken');
    orsk(w, 'gone');
    expect(current(w, 'm20')).toBe('aftermath');
    expect(w.manager.state('m20')).toBe('active');
    talk(w, 'wenna');
    expect(w.manager.state('m20')).toBe('completed');
    expect(w.calls.filter((c) => c === 'xp:600:quest:m20')).toHaveLength(1);
    expect(rewardItems(w).filter((i: string) => i === 'orsks-cinder')).toHaveLength(1);
  });

  it('the chains break in any order and each one counts once', () => {
    for (const order of [[5, 4, 3, 2, 1], [3, 1, 5, 2, 4], [2, 2, 2, 1, 3, 3, 5, 4]]) {
      const w = world();
      begin(w, 'm20');
      toChains(w);
      breakChains(w, order);
      expect(done(w, 'm20', 'chains'), order.join()).toBe(true);
      expect(progress(w, 'm20', 'chains')).toBe(5);
    }
  });

  it('a chain broken twice, or another prop used, does not count', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    interact(w, M20_CHAINS[0]);
    interact(w, M20_CHAINS[0]);
    interact(w, 'use:m16-brazier-1');
    interact(w, 'use:m20-chain-6');
    expect(progress(w, 'm20', 'chains')).toBe(1);
  });

  it('chains used before the captain has been heard earn nothing (the objectives run in order)', () => {
    const w = world();
    begin(w, 'm20');
    talk(w, 'wenna');
    for (let i = 0; i < 8; i++) killOf(w, 'steward-guard', M20_STEWARD_TAG, `s${i}`);
    interact(w, M20_CHAINS[0]);
    expect(progress(w, 'm20', 'chains')).toBe(0);
    talk(w, 'steward-captain');
    expect(current(w, 'm20')).toBe('chains');
  });

  it('counts only steward-guards of the steward tag, and each steward once', () => {
    const w = world();
    begin(w, 'm20');
    talk(w, 'wenna');
    killOf(w, 'steward-guard', 'm21.loyalists', 'x1');
    killOf(w, 'yard-veteran', M20_STEWARD_TAG, 'x2');
    killOf(w, 'steward-guard', M20_STEWARD_TAG, 's1');
    killOf(w, 'steward-guard', M20_STEWARD_TAG, 's1');
    expect(progress(w, 'm20', 'stewards')).toBe(1);
    expect(done(w, 'm20', 'stewards')).toBe(false);
  });

  it('the captain cannot be skipped: no persuasion shortcut past the fight', () => {
    const w = world();
    begin(w, 'm20');
    talk(w, 'wenna');
    talk(w, 'steward-captain');
    expect(done(w, 'm20', 'captain')).toBe(false);
    expect(current(w, 'm20')).toBe('stewards');
  });

  it('all seven notes are needed, an abandoned read earns nothing, and a note is counted once', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    breakChains(w, [1, 2, 3, 4, 5]);
    reads(w, M20_NOTES.slice(0, 6));
    talk(w, M20_NOTES[6], 'skip');
    talk(w, M20_NOTES[0], 'completed');
    expect(done(w, 'm20', 'search')).toBe(false);
    talk(w, M20_NOTES[6], 'completed');
    expect(done(w, 'm20', 'search')).toBe(true);
  });

  it('the Orsk beats credit only their own beat while current, and ignore another beat', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    breakChains(w, [1, 2, 3, 4, 5]);
    reads(w, M20_NOTES);
    talk(w, 'wyrmling-keeper');
    orsk(w, 'roar');
    orsk(w, 'gone');
    expect(done(w, 'm20', 'chainsBroken')).toBe(false);
    orsk(w, 'chainsBroken');
    expect(current(w, 'm20')).toBe('gone');
    orsk(w, 'gone');
    expect(current(w, 'm20')).toBe('aftermath');
  });

  it('the scene may play while Cael is still reading: the gone flag credits both beats when they come up', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    breakChains(w, [1, 2, 3, 4, 5]);
    // Orsk plays on the fifth chain, long before the keeper is heard
    orsk(w, 'chainsBroken');
    orsk(w, 'gone');
    w.flags.set(M20_ORSK_GONE, true);
    expect(done(w, 'm20', 'chainsBroken')).toBe(false);
    reads(w, M20_NOTES);
    talk(w, 'wyrmling-keeper');
    expect(done(w, 'm20', 'chainsBroken')).toBe(true);
    expect(done(w, 'm20', 'gone')).toBe(true);
    expect(current(w, 'm20')).toBe('aftermath');
  });

  it('keeps its progress across a save, mid-chains', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    breakChains(w, [4, 2, 5]);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m19'), m20]);
    w2.manager.load(data);
    expect(w2.manager.state('m20')).toBe('active');
    expect(current(w2, 'm20')).toBe('chains');
    expect(progress(w2, 'm20', 'chains')).toBe(3);
    interact(w2, M20_CHAINS[3 - 3]);
    interact(w2, M20_CHAINS[2]);
    expect(done(w2, 'm20', 'chains')).toBe(true);
  });

  it('a load after Orsk is gone credits both beats without a replay, and the rewards are paid once', () => {
    const w = world();
    begin(w, 'm20');
    toChains(w);
    breakChains(w, [1, 2, 3, 4, 5]);
    reads(w, M20_NOTES);
    w.flags.set(M20_ORSK_GONE, true);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m19'), m20]);
    w2.flags.set(M20_ORSK_GONE, true);
    w2.manager.load(data);
    w2.manager.recheck();
    talk(w2, 'wyrmling-keeper');
    expect(current(w2, 'm20')).toBe('aftermath');
    expect(w2.bus.of('wyrm.orsk')).toEqual([]);
    talk(w2, 'wenna');
    expect(w2.calls.filter((c) => c === 'xp:600:quest:m20')).toHaveLength(1);
  });

  it('the objective flags: started with the quest, the stewards out after the brief', () => {
    const w = world();
    const flags = installObjectiveFlags(M20D04.flags, w.bus, w.state, w.manager);
    begin(w, 'm20');
    expect(w.flags.get('story.m20.started')).toBe(true);
    expect(w.flags.get('story.m20.stewardsOut')).toBeUndefined();
    talk(w, 'wenna');
    expect(w.flags.get('story.m20.stewardsOut')).toBe(true);
    flags.dispose();
  });
});

describe('D04 The Deepdelve Descent', () => {
  function world(): W {
    const w = makeWorld([stub('m20'), d04]);
    finish(w, 'm20');
    return w;
  }
  const stage = (w: W, n: 1 | 2) => w.bus.emit('trigger.enter', { triggerId: `trg.q13.d04.stage${n}`, actorId: 'p' });
  const solved = (w: W, id: string) => w.bus.emit('puzzle.solved', { id });
  const toBoss = (w: W) => {
    talk(w, 'slagg');
    stage(w, 1);
    stage(w, 2);
    for (let i = 0; i < 10; i++) killOf(w, 'slag-crawler', 'd04.crawlers-a', `a${i}`);
    killOf(w, 'cinder-golem', 'd04.golem', 'g1');
    for (let i = 0; i < 3; i++) killOf(w, 'slag-crawler', 'd04.crawlers-b', `b${i}`);
    reads(w, D04_NOTES);
    solved(w, 'd04.pool-1');
    solved(w, 'd04.pool-2');
  };

  it('is refused until M20 is done', () => {
    const w = makeWorld([stub('m20'), d04]);
    expect(w.manager.start('d04')).toBe(false);
    finish(w, 'm20');
    expect(w.manager.start('d04')).toBe(true);
  });

  it('plays through the Slagmaw to the report, with the rewards once', () => {
    const w = world();
    begin(w, 'd04');
    toBoss(w);
    expect(current(w, 'd04')).toBe('slagmaw');
    w.bus.emit('boss.defeated', { bossId: 'the-slagmaw', actorId: 'boss' });
    expect(current(w, 'd04')).toBe('report');
    expect(w.manager.state('d04')).toBe('active');
    talk(w, 'slagg');
    expect(w.manager.state('d04')).toBe('completed');
    expect(w.calls.filter((c) => c === 'xp:900:quest:d04')).toHaveLength(1);
    expect(rewardItems(w).filter((i: string) => i === 'slag-core')).toHaveLength(1);
  });

  it('another boss, or another puzzle, earns nothing', () => {
    const w = world();
    begin(w, 'd04');
    toBoss(w);
    w.bus.emit('boss.defeated', { bossId: 'thrandil-redmane', actorId: 'boss' });
    w.bus.emit('boss.spared', { bossId: 'the-slagmaw', actorId: 'boss' });
    expect(done(w, 'd04', 'slagmaw')).toBe(false);
    const w2 = world();
    begin(w2, 'd04');
    talk(w2, 'slagg');
    stage(w2, 1);
    stage(w2, 2);
    for (let i = 0; i < 10; i++) killOf(w2, 'slag-crawler', 'd04.crawlers-a', `a${i}`);
    killOf(w2, 'cinder-golem', 'd04.golem', 'g1');
    for (let i = 0; i < 3; i++) killOf(w2, 'slag-crawler', 'd04.crawlers-b', `b${i}`);
    reads(w2, D04_NOTES);
    solved(w2, 'weeping-bellows');
    solved(w2, 'd04.pool-2');
    expect(done(w2, 'd04', 'pool1')).toBe(false);
    expect(done(w2, 'd04', 'pool2')).toBe(false);
    solved(w2, 'd04.pool-1');
    expect(current(w2, 'd04')).toBe('pool2');
    solved(w2, 'd04.pool-2');
    expect(current(w2, 'd04')).toBe('slagmaw');
  });

  it('the descents and the fights run in order: a crawler killed on the way down is not counted', () => {
    const w = world();
    begin(w, 'd04');
    talk(w, 'slagg');
    killOf(w, 'slag-crawler', 'd04.crawlers-a', 'early');
    stage(w, 2);
    expect(done(w, 'd04', 'stage2')).toBe(false);
    stage(w, 1);
    stage(w, 2);
    expect(current(w, 'd04')).toBe('crawlersA');
    expect(progress(w, 'd04', 'crawlersA')).toBe(0);
    for (let i = 0; i < 10; i++) killOf(w, 'slag-crawler', 'd04.crawlers-b', `wrongtag${i}`);
    expect(progress(w, 'd04', 'crawlersA')).toBe(0);
    for (let i = 0; i < 10; i++) killOf(w, 'slag-crawler', 'd04.crawlers-a', `a${i}`);
    expect(current(w, 'd04')).toBe('golem');
  });

  it('a pool solved earlier (its flag) credits the objective when it comes up', () => {
    const w = world();
    begin(w, 'd04');
    w.flags.set('story.d04.pool1', true);
    w.flags.set('story.d04.pool2', true);
    talk(w, 'slagg');
    stage(w, 1);
    stage(w, 2);
    for (let i = 0; i < 10; i++) killOf(w, 'slag-crawler', 'd04.crawlers-a', `a${i}`);
    killOf(w, 'cinder-golem', 'd04.golem', 'g1');
    for (let i = 0; i < 3; i++) killOf(w, 'slag-crawler', 'd04.crawlers-b', `b${i}`);
    reads(w, D04_NOTES);
    expect(current(w, 'd04')).toBe('slagmaw');
  });

  it('the outcome flag credits the Slagmaw on a load; "spared" or nothing does not', () => {
    const w = world();
    begin(w, 'd04');
    toBoss(w);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m20'), d04]);
    w2.manager.load(data);
    expect(current(w2, 'd04')).toBe('slagmaw');
    const w3 = makeWorld([stub('m20'), d04]);
    w3.flags.set(D04_OUTCOME_FLAG, 'defeated');
    w3.manager.load(data);
    w3.manager.recheck();
    expect(current(w3, 'd04')).toBe('report');
    const w4 = makeWorld([stub('m20'), d04]);
    w4.flags.set(D04_OUTCOME_FLAG, 'spared');
    w4.manager.load(data);
    w4.manager.recheck();
    expect(current(w4, 'd04')).toBe('slagmaw');
  });

  it('keeps its progress across a save, mid-descent', () => {
    const w = world();
    begin(w, 'd04');
    talk(w, 'slagg');
    stage(w, 1);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m20'), d04]);
    w2.manager.load(data);
    expect(current(w2, 'd04')).toBe('stage2');
    stage(w2, 2);
    expect(current(w2, 'd04')).toBe('crawlersA');
  });

  it('the objective flags chain the fights; accepting the quest does not arm the arena', () => {
    const w = world();
    const flags = installObjectiveFlags(M20D04.flags, w.bus, w.state, w.manager);
    begin(w, 'd04');
    expect(w.flags.has('story.d04.started')).toBe(false);
    talk(w, 'slagg');
    stage(w, 1);
    stage(w, 2);
    expect(w.flags.get('story.d04.crawlersOut')).toBe(true);
    expect(w.flags.get('story.d04.golemOut')).toBeUndefined();
    for (let i = 0; i < 10; i++) killOf(w, 'slag-crawler', 'd04.crawlers-a', `a${i}`);
    expect(w.flags.get('story.d04.golemOut')).toBe(true);
    killOf(w, 'cinder-golem', 'd04.golem', 'g1');
    expect(w.flags.get('story.d04.crawlersBOut')).toBe(true);
    expect(w.flags.has('story.d04.started')).toBe(false);
    flags.dispose();
  });
});
