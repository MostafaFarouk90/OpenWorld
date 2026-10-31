// Act 1 side jobs j01 to j11 (plans/act1-side-content.md), at the logic level: offers hidden before their conditions, every
// success path, both loaf choices, j03 from either stone, j08 with a spared and a killed cutpurse, j09's repeat bouts paying
// nothing, j10 refused without j04, j11's grate shut without the key, a save and reload in the middle of each job, an old save
// with every job inactive, the pay band and the XP and gold guard for Act 2 entry, the content tables against the layouts, the
// spawners (outside every patrol and trigger box, prop-free, armed by a flag, no respawn) and the reusable starting-note and
// notice-board pieces.
// The headless run over the real game is src/integration/side.e2e.test.ts.
import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../testKit';
import { questDefs } from '../index';
import { dialogueDefs } from '../../../dialogue/content';
import { dialogueStrings, npcNameFallbackStrings } from '../../../dialogue/strings.en';
import { questStrings } from '../../strings.en';
import { DialogueRunner } from '../../../dialogue/DialogueRunner';
import { validateDialogue } from '../../../dialogue/validate';
import { createEffectRunner } from '../../effects';
import { installObjectiveFlags } from '../../objectiveFlags';
import { OBJECTIVE_FLAGS } from '../objectiveFlags';
import type { StringsPort } from '../../ports';
import type { FlagValue } from '../../types';
import {
  SIDE_CARRY, SIDE_CODEX, SIDE_NOTE_CODEX, SIDE_OBJECTIVE_FLAGS, SIDE_PROPS, SIDE_QUEST_CODEX, SIDE_QUEST_DEFS, SIDE_QUEST_IDS, SIDE_QUEST_NOTES,
  SIDE_POST_RULES, boardNotice, startingNote,
} from './index';
import { D02_PREREQUISITES } from '../d02.quest';
import { J05_NOTICE } from './dialogues.hm';
import { resolvePosts } from '../../posts';
import purseSource from '../../../economy/Purse.ts?raw';
import { installSideCodex } from './codex';
import { SIDE_SPAWNERS } from '../../../enemies/sideSpawners';
import { HARROWMARK_SPAWNERS } from '../../../enemies/harrowmarkSpawners';
import { SIDE_LAYOUT_HM } from '../../../harrowmark/side.layout';
import { KEYED_GRATES } from '../../../interiors/keyedGrates';
import { HARROWMARK_FLAG_BLOCKERS } from '../../../interiors/harrowmark/locks';
import { NO_KILL_XP_TAGS, KILL_XP_BASE, xpForLevel } from '../../../progression/tuning';
import { makeProgression } from '../../../progression/testkit';
import { grateAnswer } from '../../../interiors/keyedGrates';
import { ACT1_FIXTURES, readAct1Fixture } from '../../../save/__fixtures__/act1';
import { SLICE_SPAWNERS } from '../../../enemies/spawnerDefs';
import { BRIGHTWATER_SPAWNERS } from '../../../enemies/brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from '../../../enemies/densitySpawners';
import { BRIGHTWATER_LAYOUT } from '../../../region/brightwater.layout';
import { HARROWMARK_LAYOUT } from '../../../harrowmark/harrowmark.layout';
import { UNDERWAYS_DEF } from '../../../interiors/underways/generate';
import { CORRIDOR_LAYOUT } from '../../../region/corridor.layout';
import { DEADROAD_LAYOUT } from '../../../region/deadroad.layout';
import { DENSITY_LAYOUT_A } from '../../../region/density.layout';
import { pointInFootprint } from '../../../region/geometry';
import { classOf } from '../../../env/PlacementField';
import { TILES } from '../../../env/tiles';
import { NPC_DEFS } from '../../../npcs/npcDefs';
import { HARROWMARK_NPC_DEFS, HARROWMARK_NPC_STRINGS_EN } from '../../../harrowmark/npcDefs';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const LAYOUTS = [BRIGHTWATER_LAYOUT, CORRIDOR_LAYOUT, DEADROAD_LAYOUT, DENSITY_LAYOUT_A, HARROWMARK_LAYOUT];
const anchorList = LAYOUTS.flatMap((l) => l.anchors);
/** The Underways' own anchors are local metres (the j11 spur lives there); everything else is world metres. */
const interiorAnchor = (id: string) => UNDERWAYS_DEF.anchors.find((x) => x.id === id);
const at = (id: string) => {
  const a = anchorList.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};

/** A real QuestManager (every shipped quest) with the real dialogue runner, effects, objective-flag bridge and codex hook. */
function world() {
  const w = makeWorld(questDefs);
  const unlocked: string[] = [];
  const effects = createEffectRunner({
    state: w.state, quests: w.manager, bus: w.bus, sourceId: 'test',
    progression: () => ({ grantXp: () => {}, grantSkillPoint: () => {}, grantAbility: () => {} }),
    inventory: () => ({ remove: () => true, addGold: () => {}, gold: 0 }),
  } as never);
  const strings: StringsPort = { t: (k: string) => all[k] ?? `[[${k}]]`, has: (k: string) => k in all };
  const dr = new DialogueRunner({ bus: w.bus, state: w.state, quests: w.manager, effects, strings });
  for (const d of dialogueDefs) dr.register(d);
  const bridge = installObjectiveFlags([...OBJECTIVE_FLAGS, ...SIDE_OBJECTIVE_FLAGS], w.bus, w.state, w.manager);
  installSideCodex(w.bus, SIDE_QUEST_CODEX, (id: string) => unlocked.push(id));
  const settle = () => bridge.sync();
  return { ...w, dr, unlocked, settle };
}
type W = ReturnType<typeof world>;

/** xp and gold paid since the world was built (the quest rewards go through the progression and inventory ports). */
const paid = (w: W) => ({
  xp: w.calls.filter((c: string) => c.startsWith('xp:')).reduce((n: number, c: string) => n + Number(c.split(':')[1]), 0),
  gold: w.gold.n,
});
const rewardOf = (id: string) => {
  const r = SIDE_QUEST_DEFS.find((d) => d.id === id)!.rewards ?? [];
  return {
    xp: r.reduce((n: number, e) => n + ('xp' in e ? e.xp : 0), 0),
    gold: r.reduce((n: number, e) => n + ('giveGold' in e ? e.giveGold : 0), 0),
  };
};

/** Marks a quest completed without playing it (a loaded save), then clears what that paid. */
function done(w: W, ...ids: string[]) {
  for (const id of ids) expect(w.manager.complete(id), id).toBe(true);
  w.calls.length = 0;
  w.gold.n = 0;
  w.settle();
}

/** Opens a dialogue and runs it to its end, picking choices by 1-based number; returns the node ids visited. */
function play(w: W, id: string, npc: string, picks: number[] = []): string[] {
  expect(w.dr.start(id, npc), `${id} starts`).toBe(true);
  const seen: string[] = [];
  let k = 0;
  for (let i = 0; i < 100 && w.dr.isOpen; i++) {
    const v = w.dr.view()!;
    seen.push(v.nodeId);
    if (v.choices.length) w.dr.choose(picks[k++] ?? 1); else w.dr.advance();
  }
  expect(w.dr.isOpen).toBe(false);
  w.settle();
  return seen;
}
const firstNode = (w: W, id: string, npc: string) => {
  expect(w.dr.start(id, npc)).toBe(true);
  const n = w.dr.view()!.nodeId;
  w.dr.close('script');
  return n;
};
const enter = (w: W, triggerId: string) => w.bus.emit('trigger.enter', { triggerId, actorId: 'p' });
const deliver = (w: W, carryId: string) => w.bus.emit('carry.delivered', { destinationId: 'j01.fold', carryId });
const use = (w: W, interactableId: string) => { w.bus.emit('interact', { interactableId, action: 'interact' }); w.settle(); };
const killTagged = (w: W, actorId: string, spawnTag: string) => w.bus.emit('actor.died', { actorId, killerId: 'p', kind: 'ash-wraith', spawnTag });
const progress = (w: W, q: string, o: string) => w.manager.objectives(q).find((v) => v.def.id === o)!.progress;
const openOffers = (w: W) => { done(w, 'm02'); w.flags.set('quest.m02.farewellSeen', true); };

describe('side jobs: content', () => {
  it('registers j01 to j11 once, appended to questDefs', () => {
    expect(SIDE_QUEST_IDS).toEqual(['j01', 'j02', 'j03', 'j04', 'j05', 'j06', 'j07', 'j08', 'j09', 'j10', 'j11']);
    const ids = questDefs.map((d) => d.id);
    for (const j of SIDE_QUEST_IDS) expect(ids.filter((i) => i === j)).toHaveLength(1);
  });

  it('pays 50 to 120 XP and 10 to 30 gold per job', () => {
    for (const j of SIDE_QUEST_IDS) {
      const { xp, gold } = rewardOf(j);
      expect(xp, `${j} xp`).toBeGreaterThanOrEqual(50);
      expect(xp, `${j} xp`).toBeLessThanOrEqual(120);
      expect(gold, `${j} gold`).toBeGreaterThanOrEqual(10);
      expect(gold, `${j} gold`).toBeLessThanOrEqual(30);
    }
  });

  it('uses only existing objective types and no other quest reads a job', () => {
    for (const d of SIDE_QUEST_DEFS) for (const o of d.objectives) expect(['goTo', 'interact', 'kill', 'carry', 'talk', 'event']).toContain(o.type);
    for (const d of questDefs) {
      if (SIDE_QUEST_IDS.includes(d.id)) continue;
      const refs = JSON.stringify([d.startWhen, d.objectives.map((o) => [o.when, o.doneWhen])]);
      expect(refs, d.id).not.toMatch(/"quest":"j0\d"/);
      expect(refs, d.id).not.toMatch(/story\.j0\d/);
    }
  });

  it('every prop, carry item, note and codex entry has its anchor, trigger and string', () => {
    const triggers = new Set([...LAYOUTS.flatMap((l) => l.triggers).map((t) => t.id), ...UNDERWAYS_DEF.triggers.map((t) => t.id)]);
    const anyAnchor = (id: string) => (interiorAnchor(id) ? id : at(id).id);
    for (const p of SIDE_PROPS) anyAnchor(p.anchorId);
    for (const c of SIDE_CARRY) {
      anyAnchor(c.homeAnchor);
      expect(triggers.has(c.destination), c.destination).toBe(true);
    }
    for (const n of SIDE_QUEST_NOTES) anyAnchor(n.anchorId);
    for (const d of SIDE_QUEST_DEFS) for (const o of d.objectives) if (o.type === 'goTo') expect(triggers.has(o.target as string), `${d.id}.${o.id}`).toBe(true);
    for (const id of SIDE_NOTE_CODEX) {
      const slug = id.replace(/^lore\./, '');
      expect(all[`codex.lore.${slug}.name`], id).toBeDefined();
      expect(all[`codex.lore.${slug}.body`], id).toBeDefined();
    }
    expect(SIDE_QUEST_CODEX).toEqual({ j03: SIDE_CODEX.waystones, j07: SIDE_CODEX.niches, j09: SIDE_CODEX.openBoard, j11: SIDE_CODEX.cartTracks });
    for (const id of ['orla', 'osmund']) {
      expect(NPC_DEFS.some((d) => d.id === id), id).toBe(true);
      expect(BRIGHTWATER_LAYOUT.npcs.find((n) => n.id === id)!.presentWhen).toBe('story.side.kettlewickOpen');
      at(`npc-post.${id}`);
    }
    // the Harrowmark cast: three new NPCs with defs, names and posts; the sergeant waits for the board to open
    for (const id of ['sergeant', 'crumb', 'chandler']) {
      expect(HARROWMARK_NPC_DEFS.some((d) => d.id === id), id).toBe(true);
      expect(HARROWMARK_NPC_STRINGS_EN[`npc.${id}.name`], id).toBeTruthy();
      expect(HARROWMARK_LAYOUT.npcs.filter((n) => n.id === id)).toHaveLength(1);
      at(HARROWMARK_LAYOUT.npcs.find((n) => n.id === id)!.post);
    }
    expect(HARROWMARK_LAYOUT.npcs.find((n) => n.id === 'sergeant')!.presentWhen).toBe('story.side.boardOpen');
    for (const post of ['npc-post.crumb.wait', 'npc-post.crumb.home']) at(post);
  });

  it('the merged dialogues validate', () => {
    for (const id of [
      'npc-hob', 'npc-edda', 'npc-aldwin', 'npc-tobb', 'npc-orla', 'npc-osmund', 'note-j03-bluff', 'note-j03-tablet', 'scene-act1-camp',
      'npc-stallholder-1', 'npc-sexton', 'npc-aldith', 'npc-stane', 'npc-rook', 'npc-sergeant', 'npc-crumb', 'npc-chandler', 'npc-dunstan',
      'note-j05-notice', 'note-j06-notice', 'note-j07-notice', 'note-j11-waybill',
    ]) {
      const def = dialogueDefs.find((d) => d.id === id)!;
      expect(def, id).toBeDefined();
      const r = validateDialogue(def, (k: string) => k in all);
      expect(r.errors, id).toEqual([]);
    }
  });
});

describe('side jobs: offers wait for their conditions', () => {
  it('Hob offers j01 only once M02 is done', () => {
    const w = world();
    expect(firstNode(w, 'npc-hob', 'hob')).not.toBe('j01-offer');
    w.manager.start('m02');
    expect(firstNode(w, 'npc-hob', 'hob')).not.toBe('j01-offer');
    done(w, 'm02');
    expect(firstNode(w, 'npc-hob', 'hob')).toBe('j01-offer');
    expect(play(w, 'npc-hob', 'hob', [4])).toEqual(['j01-offer', 'j01-later']);
    expect(w.manager.state('j01')).toBe('inactive');
  });

  it('Edda offers j02 after M02 and her farewell, not before', () => {
    const w = world();
    expect(firstNode(w, 'npc-edda', 'edda')).not.toBe('j02-offer');
    done(w, 'm02');
    expect(firstNode(w, 'npc-edda', 'edda')).not.toBe('j02-offer'); // her farewell comes first
    w.flags.set('quest.m02.farewellSeen', true);
    expect(firstNode(w, 'npc-edda', 'edda')).toBe('j02-offer');
    expect(play(w, 'npc-edda', 'edda', [2])).toEqual(['j02-offer', 'j02-later']);
    expect(w.manager.state('j02')).toBe('inactive');
  });

  it('Tobb offers j04 only after M05 and the bond is told', () => {
    const w = world();
    expect(firstNode(w, 'npc-tobb', 'tobb')).not.toBe('j04-offer');
    done(w, 'm05');
    expect(firstNode(w, 'npc-tobb', 'tobb')).not.toBe('j04-offer'); // an old save with no bond flag: no offer
    w.flags.set('story.m05.tobbBond', true);
    expect(firstNode(w, 'npc-tobb', 'tobb')).toBe('j04-offer');
    expect(play(w, 'npc-tobb', 'tobb', [2])).toEqual(['j04-offer', 'j04-offer-2', 'j04-later']);
    expect(w.manager.state('j04')).toBe('inactive');
  });

  it('j03 cannot start before a stone is read', () => {
    const w = world();
    expect(w.manager.start('j03')).toBe(false);
    expect(w.manager.state('j03')).toBe('inactive');
  });
});

describe('side jobs: success paths', () => {
  it('j01: offer, three sites, three lambs, report, pay', () => {
    const w = world();
    done(w, 'm02');
    expect(play(w, 'npc-hob', 'hob', [1, 2, 3])).toEqual(['j01-offer', 'j01-where', 'j01-offer', 'j01-why', 'j01-offer', 'j01-yes']);
    expect(w.manager.state('j01')).toBe('active');
    expect(firstNode(w, 'npc-hob', 'hob')).toBe('j01-remind');
    play(w, 'npc-hob', 'hob'); // an early word does not close the job
    expect(w.manager.state('j01')).toBe('active');
    for (const t of ['j01.scar', 'j01.scarecrows', 'j01.ford']) enter(w, t);
    deliver(w, 'lamb-3');
    deliver(w, 'lamb-3'); // a repeat delivery of one lamb counts once
    deliver(w, 'lamb-1');
    expect(w.manager.objectiveDone('j01', 'lambs')).toBe(false);
    deliver(w, 'lamb-2');
    expect(w.manager.objectiveDone('j01', 'lambs')).toBe(true);
    expect(firstNode(w, 'npc-hob', 'hob')).toBe('j01-back');
    expect(play(w, 'npc-hob', 'hob')).toEqual(['j01-back', 'j01-back-2']);
    expect(w.manager.state('j01')).toBe('completed');
    expect(paid(w)).toEqual(rewardOf('j01'));
    expect(firstNode(w, 'npc-hob', 'hob')).not.toBe('j01-offer');
  });

  const doors = (w: W, loaf: 1 | 2) => {
    openOffers(w);
    expect(play(w, 'npc-edda', 'edda', [1])).toEqual(['j02-offer', 'j02-yes']);
    expect(w.manager.state('j02')).toBe('active');
    use(w, 'use:j02-basket');
    expect(w.manager.objectiveDone('j02', 'basket')).toBe(true);
    play(w, 'npc-orla', 'orla', [loaf]);
    play(w, 'npc-aldwin', 'aldwin');
    play(w, 'npc-osmund', 'osmund');
    expect(w.manager.objectiveDone('j02', 'osmund')).toBe(true);
  };

  it.each([[1, 'left', 'j02-left', 'j02-kept'], [2, 'kept', 'j02-kept', 'j02-left']] as const)(
    'j02: choice %i sets the loaf flag to %s and Edda remarks on exactly that',
    (pick, flag, remark, other) => {
      const w = world();
      doors(w, pick);
      expect(w.flags.get('story.j02.loaf')).toBe(flag);
      const seen = play(w, 'npc-edda', 'edda');
      expect(seen[0]).toBe('j02-back');
      expect(seen).toContain(remark);
      expect(seen).not.toContain(other);
      expect(w.manager.state('j02')).toBe('completed');
      expect(paid(w)).toEqual(rewardOf('j02'));
    },
  );

  it('j02: the doors go in order (the basket first, then Orla, Aldwin, the sexton)', () => {
    const w = world();
    openOffers(w);
    play(w, 'npc-edda', 'edda', [1]);
    play(w, 'npc-orla', 'orla', [1]); // before the basket: nothing counts
    expect(w.manager.objectiveDone('j02', 'orla')).toBe(false);
    use(w, 'use:j02-basket');
    play(w, 'npc-osmund', 'osmund'); // out of order: nothing counts
    expect(w.manager.objectiveDone('j02', 'osmund')).toBe(false);
    play(w, 'npc-orla', 'orla', [1]);
    expect(w.manager.objectiveDone('j02', 'orla')).toBe(true);
  });

  it.each(['bluff', 'tablet'] as const)('j03: started from the %s, then the pair and the other stone', (firstStone) => {
    const w = world();
    const note = (n: 'bluff' | 'tablet') => play(w, `note-j03-${n}`, `note-j03-${n}`);
    const other = firstStone === 'bluff' ? 'tablet' : 'bluff';
    expect(w.flags.has('story.j03.started')).toBe(false);
    note(firstStone);
    expect(w.manager.state('j03')).toBe('active');
    expect(w.flags.get('story.j03.started')).toBe(true); // arms the barrow pair
    expect(w.manager.objectiveDone('j03', firstStone)).toBe(true);
    expect(w.manager.objectiveDone('j03', other)).toBe(false);
    killTagged(w, 'road-1', 'deadroad.barrow'); // other wraiths do not count
    expect(progress(w, 'j03', 'wake')).toBe(0);
    killTagged(w, 'b1', 'j03.barrow');
    killTagged(w, 'b1', 'j03.barrow'); // the same wraith twice counts once
    expect(progress(w, 'j03', 'wake')).toBe(1);
    killTagged(w, 'b2', 'j03.barrow');
    expect(w.manager.objectiveDone('j03', 'wake')).toBe(true);
    expect(w.manager.state('j03')).toBe('active');
    note(other);
    expect(w.manager.state('j03')).toBe('completed');
    expect(paid(w)).toEqual(rewardOf('j03'));
    expect(w.unlocked).toEqual([SIDE_CODEX.waystones]);
    note('bluff'); // reading again restarts nothing
    expect(w.manager.state('j03')).toBe('completed');
  });

  it.each([[1, 'ash', 'j04-ash'], [2, 'grain', 'j04-grain'], [3, 'bread', 'j04-bread']] as const)('j04: the fire ring, then verse %i (%s)', (pick, verse, reply) => {
    const w = world();
    done(w, 'm05');
    w.flags.set('story.m05.tobbBond', true);
    expect(play(w, 'npc-tobb', 'tobb', [1])).toEqual(['j04-offer', 'j04-offer-2', 'j04-yes']);
    expect(w.manager.state('j04')).toBe('active');
    expect(firstNode(w, 'npc-tobb', 'tobb')).toBe('j04-remind');
    use(w, 'use:j04-fire');
    expect(w.manager.objectiveDone('j04', 'fire')).toBe(true);
    expect(firstNode(w, 'npc-tobb', 'tobb')).toBe('j04-verse');
    expect(play(w, 'npc-tobb', 'tobb', [pick])).toEqual(['j04-verse', reply, 'j04-sung']);
    expect(w.flags.get('story.j04.verse')).toBe(verse);
    expect(w.manager.state('j04')).toBe('completed');
    expect(paid(w)).toEqual(rewardOf('j04'));
  });

  it('the camp scene sings the verse when given and says nothing of it when not', () => {
    for (const verse of ['ash', 'grain', 'bread', undefined] as const) {
      const w = world();
      if (verse) w.flags.set('story.j04.verse', verse);
      const seen = play(w, 'scene-act1-camp', 'camp');
      for (const v of ['ash', 'grain', 'bread']) expect(seen.includes(`verse-${v}`), `${verse} / ${v}`).toBe(v === verse);
    }
  });
});

describe('side jobs: saves', () => {
  /** A fresh world loaded from the saved quests and flags, as the game would on a reload. */
  const reload = (w: W): W => {
    const v = world();
    for (const [k, x] of w.flags) v.flags.set(k, x as FlagValue);
    v.manager.load(JSON.parse(JSON.stringify(w.manager.serialize())));
    v.settle();
    return v;
  };

  it('an old save (quests but no jobs) loads with every job inactive and no job flag', () => {
    const w = world();
    done(w, 'm02', 'm05');
    const old = JSON.parse(JSON.stringify(w.manager.serialize()));
    for (const j of SIDE_QUEST_IDS) delete old.quests[j];
    const v = world();
    v.manager.load(old);
    v.settle();
    for (const j of SIDE_QUEST_IDS) expect(v.manager.state(j), j).toBe('inactive');
    expect([...v.flags.keys()].filter((k) => /^story\.j0\d/.test(k))).toEqual([]);
    expect(v.flags.get('story.side.kettlewickOpen')).toBe(true); // the catch-up for the Kettlewick lanes
    expect(firstNode(v, 'npc-hob', 'hob')).toBe('j01-offer');
  });

  it('mid j01 (one site, one lamb home)', () => {
    const w = world();
    done(w, 'm02');
    play(w, 'npc-hob', 'hob', [3]);
    enter(w, 'j01.scar');
    deliver(w, 'lamb-1');
    const v = reload(w);
    expect(v.manager.state('j01')).toBe('active');
    expect(v.manager.objectiveDone('j01', 'scar')).toBe(true);
    expect(progress(v, 'j01', 'lambs')).toBe(1);
    deliver(v, 'lamb-1'); // already counted before the save
    expect(progress(v, 'j01', 'lambs')).toBe(1);
    deliver(v, 'lamb-2');
    deliver(v, 'lamb-3');
    expect(v.manager.objectiveDone('j01', 'lambs')).toBe(true);
  });

  it('mid j02 (the basket taken, Orla\'s door done, the loaf kept)', () => {
    const w = world();
    openOffers(w);
    play(w, 'npc-edda', 'edda', [1]);
    use(w, 'use:j02-basket');
    play(w, 'npc-orla', 'orla', [2]);
    const v = reload(w);
    expect(v.manager.isObjectiveCurrent('j02', 'aldwin')).toBe(true);
    play(v, 'npc-aldwin', 'aldwin');
    play(v, 'npc-osmund', 'osmund');
    expect(play(v, 'npc-edda', 'edda')).toContain('j02-kept');
    expect(v.manager.state('j02')).toBe('completed');
  });

  it('mid j03 (the bluff read, one wraith down): still armed, and the count resumes', () => {
    const w = world();
    play(w, 'note-j03-bluff', 'note-j03-bluff');
    killTagged(w, 'b1', 'j03.barrow');
    const v = reload(w);
    expect(v.manager.state('j03')).toBe('active');
    expect(v.flags.get('story.j03.started')).toBe(true);
    expect(progress(v, 'j03', 'wake')).toBe(1);
    killTagged(v, 'b2', 'j03.barrow');
    play(v, 'note-j03-tablet', 'note-j03-tablet');
    expect(v.manager.state('j03')).toBe('completed');
  });

  it('mid j04 (the fire lit): Tobb asks for the verse', () => {
    const w = world();
    done(w, 'm05');
    w.flags.set('story.m05.tobbBond', true);
    play(w, 'npc-tobb', 'tobb', [1]);
    use(w, 'use:j04-fire');
    const v = reload(w);
    expect(firstNode(v, 'npc-tobb', 'tobb')).toBe('j04-verse');
  });
});

describe('side jobs: the spawners', () => {
  const rows = Object.values(TILES).flat().filter((r) => classOf(r.id) !== 'ground');
  const triggers = LAYOUTS.flatMap((l) => l.triggers);
  const structures = LAYOUTS.flatMap((l) => l.structures);
  /** The world spawners of the jobs (the interior hounds and j09's R02 anchors have their own tests). */
  const worldSpawners = SIDE_SPAWNERS.filter((s) => s.id === 'side.j03.barrow' || s.id === 'side.j08.cutpurses');
  const worldSpawnIds = worldSpawners.flatMap((s) => [s.anchor, ...(s.memberAnchors ?? [])]);

  /** Every patrol's bounding box: layout patrols, spawner patrols, and patrol.* anchor groups. */
  const patrolBoxes = () => {
    const groups = new Map<string, { x: number; z: number }[]>();
    for (const a of anchorList) {
      if (!a.id.startsWith('patrol.') && !a.id.startsWith('harrowmark.patrol.')) continue;
      const parts = a.id.split('.');
      const key = parts.slice(0, parts.length > 3 ? 3 : 2).join('.');
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    for (const p of LAYOUTS.flatMap((l) => l.patrols)) groups.set(p.id, p.points.map(at));
    for (const s of [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...DENSITY_SPAWNERS_A, ...HARROWMARK_SPAWNERS]) {
      if (Array.isArray(s.patrol)) groups.set(`spawner:${s.id}`, (s.patrol as string[]).flatMap((id) => anchorList.filter((a) => a.id === id)));
    }
    return [...groups].filter(([, pts]) => pts.length > 0).map(([id, pts]) => ({
      id, x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)),
    }));
  };

  it('every group arms on a flag a quest writes and never respawns', () => {
    expect(SIDE_SPAWNERS.map((s) => s.id)).toEqual([
      'side.j03.barrow', 'side.j08.cutpurses', 'side.j11.hounds', 'side.j09.bout-1', 'side.j09.bout-2', 'side.j09.bout-3', 'side.j09.repeat',
    ]);
    for (const s of SIDE_SPAWNERS) expect(s.respawn, s.id).toBe('never');
    const by = (id: string) => SIDE_SPAWNERS.find((s) => s.id === id)!;
    expect(by('side.j03.barrow')).toMatchObject({ tag: 'j03.barrow', enemy: 'ash-wraith', count: 2, activation: { flag: 'story.j03.started' } });
    expect(SIDE_OBJECTIVE_FLAGS).toContainEqual({ quest: 'j03', flag: 'story.j03.started' });
    expect(SIDE_QUEST_DEFS.find((q) => q.id === 'j03')!.objectives.find((o) => o.id === 'wake')).toMatchObject({ spawnTag: 'j03.barrow', required: 2 });
    // j08: the pair, armed by the second remark (an objective flag)
    expect(by('side.j08.cutpurses')).toMatchObject({ tag: 'j08.cutpurse', enemy: 'alley-cutpurse', count: 2, activation: { quest: 'j08', flag: 'story.j08.alleyWoke' } });
    expect(SIDE_OBJECTIVE_FLAGS).toContainEqual({ quest: 'j08', objective: 'bark2', flag: 'story.j08.alleyWoke' });
    expect(SIDE_QUEST_DEFS.find((q) => q.id === 'j08')!.objectives.find((o) => o.id === 'cutpurses')).toMatchObject({ target: 'alley-cutpurse', spawnTag: 'j08.cutpurse', required: 2 });
    // j11: the two hounds, armed once the job runs and the grate is open (the flag the keyed grate writes and the blocker follows)
    expect(by('side.j11.hounds')).toMatchObject({ tag: 'j11.hounds', enemy: 'ember-hound', count: 2, activation: { quest: 'j11', flag: 'world.underways.cartway' } });
    expect(HARROWMARK_FLAG_BLOCKERS['underways.cartway.gate']).toBe('world.underways.cartway');
    expect(KEYED_GRATES[0]!.openFlag).toBe('world.underways.cartway');
    expect(SIDE_QUEST_DEFS.find((q) => q.id === 'j11')!.objectives.find((o) => o.id === 'hounds')).toMatchObject({ target: 'ember-hound', spawnTag: 'j11.hounds', required: 2 });
    // j09: one veteran per bout, flags written by Stane's dialogue, on R02's own Bastion spot
    for (const n of [1, 2, 3]) {
      expect(by(`side.j09.bout-${n}`)).toMatchObject({ tag: `j09.b${n}`, enemy: 'yard-veteran', count: 1, activation: { quest: 'j09', flag: `story.j09.b${n}` } });
      expect(SIDE_QUEST_DEFS.find((q) => q.id === 'j09')!.objectives.find((o) => o.id === `bout${n}`)).toMatchObject({ target: 'yard-veteran', spawnTag: `j09.b${n}` });
    }
    expect(by('side.j09.repeat')).toMatchObject({ tag: 'j09.repeat', enemy: 'yard-veteran', count: 1, activation: { flag: 'story.j09.repeat' } });
    for (const s of SIDE_SPAWNERS.filter((x) => x.id.startsWith('side.j09'))) expect(s.anchor, s.id).toBe('spawn.r02.bastion-bout');
    for (const tag of ['j09.b1', 'j09.b2', 'j09.b3', 'j09.repeat']) expect(NO_KILL_XP_TAGS).toContain(tag);
  });

  it('every spawn anchor exists (the hounds in the Underways def, the rest in the world layouts)', () => {
    expect(new Set(worldSpawnIds)).toEqual(new Set(['spawn.j03.barrow-1', 'spawn.j03.barrow-2', 'spawn.j08.cutpurse-1', 'spawn.j08.cutpurse-2']));
    for (const id of worldSpawnIds) at(id);
    at('spawn.r02.bastion-bout');
    for (const id of ['j11.spawn.hound-1', 'j11.spawn.hound-2']) expect(interiorAnchor(id), id).toBeTruthy();
  });

  it('the world groups stand outside every patrol box (6 m) and every trigger volume (4 m)', () => {
    const boxes = patrolBoxes();
    expect(boxes.length).toBeGreaterThanOrEqual(10);
    for (const id of new Set(worldSpawnIds)) {
      const { x, z } = at(id);
      for (const b of boxes) expect(x < b.x0 - 6 || x > b.x1 + 6 || z < b.z0 - 6 || z > b.z1 + 6, `${id} inside patrol ${b.id}`).toBe(true);
      for (const t of triggers) {
        const inside = t.shape === 'sphere'
          ? Math.hypot(x - t.x, z - t.z) <= t.radius + 4
          : Math.abs(x - t.x) <= t.half[0] + 4 && Math.abs(z - t.z) <= t.half[2] + 4;
        expect(inside, `${id} inside trigger ${t.id}`).toBe(false);
      }
    }
  });

  it('the world groups are prop-free: no environment prop within 3 m and no structure footprint within 1 m', () => {
    for (const id of new Set(worldSpawnIds)) {
      const { x, z } = at(id);
      for (const r of rows) expect(Math.hypot(r.x - x, r.z - z), `${id} near ${r.id} at ${r.x},${r.z}`).toBeGreaterThanOrEqual(3);
      for (const s of structures) expect(pointInFootprint(s, x, z, 1), `${id} in ${s.id}`).toBe(false);
    }
  });

  it('the hounds stand clear of the spur\'s triggers (1.5 m), the grate (3 m) and the waybill (2 m), inside a room', () => {
    for (const id of ['j11.spawn.hound-1', 'j11.spawn.hound-2']) {
      const a = interiorAnchor(id)!;
      for (const t of UNDERWAYS_DEF.triggers) {
        expect(Math.abs(a.x - t.center.x) <= t.half.x + 1.5 && Math.abs(a.z - t.center.z) <= t.half.z + 1.5, `${id} in ${t.id}`).toBe(false);
      }
      const dist = (o: string) => Math.hypot(a.x - interiorAnchor(o)!.x, a.z - interiorAnchor(o)!.z);
      expect(dist('j11.grate')).toBeGreaterThan(3);
      expect(dist('j11.waybill')).toBeGreaterThan(2);
      expect(UNDERWAYS_DEF.rooms.some((r) => a.x > r.x0 && a.x < r.x1 && a.z > r.z0 && a.z < r.z1), `${id} in a room`).toBe(true);
    }
  });

  it('keeps the three batch 2 Dead Road points of interest where they were', () => {
    for (const id of ['poi.deadroad.stone-1', 'poi.deadroad.stone-2', 'poi.deadroad.barrow']) at(id);
  });

  it('every new Harrowmark anchor, trigger and NPC post is clear of props, structures and the other anchors', () => {
    const mine = SIDE_LAYOUT_HM;
    for (const a of mine.anchors) {
      for (const r of rows) expect(Math.hypot(r.x - a.x, r.z - a.z), `${a.id} near ${r.id}`).toBeGreaterThanOrEqual(1.5);
      for (const s of HARROWMARK_LAYOUT.structures.filter((x) => x.mode !== 'open')) expect(pointInFootprint(s, a.x, a.z, 0.5), `${a.id} in ${s.id}`).toBe(false);
      for (const b of HARROWMARK_LAYOUT.anchors) if (b.id !== a.id) expect(Math.hypot(b.x - a.x, b.z - a.z), `${a.id} on ${b.id}`).toBeGreaterThanOrEqual(0.5);
    }
    for (const t of mine.triggers) {
      if (t.shape !== 'sphere') continue;
      for (const r of rows) expect(Math.hypot(r.x - t.x, r.z - t.z), `${t.id} holds ${r.id}`).toBeGreaterThan(t.radius);
    }
    // the three notices are 4 m apart and 5 m from the sergeant; no note shares a spot with a post, prop or carry
    const spot = (id: string) => at(id);
    expect(Math.hypot(spot('j05.notice').x - spot('j06.notice').x, spot('j05.notice').z - spot('j06.notice').z)).toBeGreaterThanOrEqual(4);
    expect(Math.hypot(spot('j06.notice').x - spot('npc-post.sergeant').x, spot('j06.notice').z - spot('npc-post.sergeant').z)).toBeGreaterThanOrEqual(5);
  });
});

describe('side jobs: the reusable starting note and notice board', () => {
  it('a starting note writes its flag and starts its quest once', () => {
    const p = startingNote({ id: 'note-x', anchorId: 'j01.fold', quest: 'j01', flag: 'story.j01.x', speakers: ['note', 'cael'], look: 'box' });
    expect(p.note).toEqual({ interactableId: 'use:note-x', anchorId: 'j01.fold' });
    expect(p.look).toEqual({ id: 'use:note-x', look: 'box' });
    expect(p.dialogue.nodes.map((n) => n.speaker)).toEqual(['note', 'cael']);
    expect(p.dialogue.nodes[1]!.effects).toEqual([
      { setFlag: 'story.j01.x', value: true },
      { if: { quest: 'j01', state: 'inactive' }, then: [{ startQuest: 'j01' }] },
    ]);
  });

  it('a notice reads only while its job is on offer or running', () => {
    const p = boardNotice({ id: 'note-board-test', anchorId: 'j01.fold', quest: 'j01', flag: 'story.j01.noticeRead', offerWhen: { flag: 'story.board.open' }, lines: 2 });
    expect(p.dialogue.nodes).toHaveLength(2);
    expect(p.note.when).toEqual({ any: [{ flag: 'story.board.open' }, { quest: 'j01', state: 'active' }] });
  });
});

// ---- round 2: j05 to j11 ----

const kill2 = (w: W, id: string, kind: string, tag: string) => w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind, spawnTag: tag });
const carried = (w: W, dest: string, carryId: string) => w.bus.emit('carry.delivered', { destinationId: dest, carryId });
const readyJ09 = (w: W) => { done(w, ...['m06', 'r02'].filter((q) => w.manager.state(q) !== 'completed')); w.flags.set('story.m06.started', true); };
const afterD02 = (w: W) => { done(w, ...[...D02_PREREQUISITES, 'd02'].filter((q) => w.manager.state(q) !== 'completed')); };
const afterM06 = (w: W) => { done(w, 'm06'); };
const afterM07 = (w: W) => { done(w, 'm06', 'm07'); w.flags.set('story.m06.started', true); };

describe('side jobs j05 to j11: offers wait for their conditions', () => {
  it('no job starts before its condition holds (startWhen refuses)', () => {
    const w = world();
    for (const j of ['j05', 'j06', 'j07', 'j08', 'j09', 'j10', 'j11']) expect(w.manager.start(j), j).toBe(false);
    afterM06(w);
    expect(w.manager.start('j07')).toBe(false); // needs M07
    expect(w.manager.start('j09')).toBe(false); // needs R02
    expect(w.manager.start('j11')).toBe(false); // needs D02
  });

  it('the sergeant, Stane, Tobb and Rook offer only when their conditions hold', () => {
    const w = world();
    expect(firstNode(w, 'npc-sergeant', 'sergeant')).toBe('idle');
    expect(firstNode(w, 'npc-stane', 'stane')).not.toBe('j09-offer');
    expect(firstNode(w, 'npc-rook', 'rook')).not.toBe('j11-offer');
    expect(firstNode(w, 'npc-tobb', 'tobb')).not.toBe('j10-offer');
    afterM06(w);
    expect(firstNode(w, 'npc-sergeant', 'sergeant')).toBe('j08-offer');
    done(w, 'm07', 'j04');
    expect(firstNode(w, 'npc-tobb', 'tobb')).toBe('j10-offer');
    readyJ09(w);
    expect(firstNode(w, 'npc-stane', 'stane')).toBe('j09-offer');
    afterD02(w);
    expect(firstNode(w, 'npc-rook', 'rook')).toBe('j11-offer');
  });

  it('the board notices start their job only once M06 (or M07 for the chapel) is done', () => {
    const w = world();
    expect(J05_NOTICE.note.when).toBeDefined();
    play(w, 'note-j05-notice', 'note-j05-notice');
    expect(w.manager.state('j05')).toBe('inactive');
    afterM06(w);
    play(w, 'note-j05-notice', 'note-j05-notice');
    expect(w.manager.state('j05')).toBe('active');
    play(w, 'note-j07-notice', 'note-j07-notice');
    expect(w.manager.state('j07')).toBe('inactive');
  });

  it('j10 is refused without j04 and without M07', () => {
    const w = world();
    done(w, 'm07');
    expect(w.manager.start('j10')).toBe(false);
    done(w, 'j04');
    expect(w.manager.start('j10')).toBe(true);
    const v = world();
    done(v, 'j04');
    expect(v.manager.start('j10')).toBe(false);
  });
});

describe('side jobs j05 to j11: success paths', () => {
  const finish = (w: W, id: string) => {
    expect(w.manager.state(id), id).toBe('completed');
    const r = rewardOf(id);
    expect(paid(w), id).toEqual(r);
    expect(r.xp).toBeGreaterThanOrEqual(50);
    expect(r.xp).toBeLessThanOrEqual(120);
    expect(r.gold).toBeGreaterThanOrEqual(10);
    expect(r.gold).toBeLessThanOrEqual(30);
  };

  it('j05: notice, owner, three places, the hound, report, pay', () => {
    const w = world();
    afterM06(w);
    play(w, 'note-j05-notice', 'note-j05-notice');
    play(w, 'npc-stallholder-1', 'stallholder-1');
    for (const n of [1, 2, 3]) enter(w, `j05.search-${n}`);
    play(w, 'npc-crumb', 'crumb');
    expect(w.manager.state('j05')).toBe('active');
    play(w, 'npc-stallholder-1', 'stallholder-1');
    finish(w, 'j05');
  });

  it('j05: Crumb waits at the third place while the job runs and is at home otherwise', () => {
    const w = world();
    const at2 = () => resolvePosts(SIDE_POST_RULES, { state: w.state, quests: w.manager } as never).crumb!.anchorId;
    expect(at2()).toBe('npc-post.crumb.home');
    afterM06(w);
    play(w, 'note-j05-notice', 'note-j05-notice');
    expect(at2()).toBe('npc-post.crumb.home');
    play(w, 'npc-stallholder-1', 'stallholder-1');
    expect(at2()).toBe('npc-post.crumb.wait');
    for (const n of [1, 2, 3]) enter(w, `j05.search-${n}`);
    play(w, 'npc-crumb', 'crumb');
    expect(at2()).toBe('npc-post.crumb.home');
  });

  it('j06: notice, the smith, the crate to the forge, report, pay', () => {
    const w = world();
    afterM06(w);
    play(w, 'note-j06-notice', 'note-j06-notice');
    play(w, 'npc-dunstan', 'dunstan');
    carried(w, 'j06.forge', 'crate-j06');
    play(w, 'npc-dunstan', 'dunstan');
    finish(w, 'j06');
  });

  it('j07: notice, chandler, candles, three niches, report, pay, and the codex entry', () => {
    const w = world();
    afterM07(w);
    play(w, 'note-j07-notice', 'note-j07-notice');
    play(w, 'npc-chandler', 'chandler');
    use(w, 'use:j07-candles');
    for (const n of [1, 2, 3]) use(w, `use:j07-niche-${n}`);
    play(w, 'npc-sexton', 'sexton');
    finish(w, 'j07');
    expect(w.unlocked).toContain(SIDE_CODEX.niches);
  });

  it('j08: orders, four lanes with two remarks, the pair killed, report, pay', () => {
    const w = world();
    afterM06(w);
    play(w, 'npc-sergeant', 'sergeant', [1]);
    enter(w, 'j08.lane-1');
    enter(w, 'j08.lane-2');
    play(w, 'npc-dunstan', 'dunstan');
    enter(w, 'j08.lane-3');
    expect(w.flags.get('story.j08.alleyWoke')).toBeFalsy();
    play(w, 'npc-aldith', 'aldith');
    expect(w.flags.get('story.j08.alleyWoke')).toBe(true);
    enter(w, 'j08.lane-4');
    kill2(w, 'c1', 'alley-cutpurse', 'j08.cutpurse');
    kill2(w, 'c2', 'alley-cutpurse', 'j08.cutpurse');
    play(w, 'npc-sergeant', 'sergeant');
    finish(w, 'j08');
  });

  it('j08: sparing counts, and a cutpurse from another group does not', () => {
    const w = world();
    afterM06(w);
    play(w, 'npc-sergeant', 'sergeant', [1]);
    for (const l of ['j08.lane-1', 'j08.lane-2']) enter(w, l);
    play(w, 'npc-dunstan', 'dunstan');
    enter(w, 'j08.lane-3');
    play(w, 'npc-aldith', 'aldith');
    enter(w, 'j08.lane-4');
    kill2(w, 'x1', 'alley-cutpurse', 'other.group');
    expect(progress(w, 'j08', 'cutpurses')).toBe(0);
    w.bus.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'alley-cutpurse', actorId: 'c1', spawnTag: 'j08.cutpurse' });
    kill2(w, 'c2', 'alley-cutpurse', 'j08.cutpurse');
    expect(w.manager.objectiveDone('j08', 'cutpurses')).toBe(true);
    play(w, 'npc-sergeant', 'sergeant');
    finish(w, 'j08');
  });

  it('j09: three bouts and three words, then Stane closes the book', () => {
    const w = world();
    readyJ09(w);
    play(w, 'npc-stane', 'stane', [1]);
    expect(w.manager.state('j09')).toBe('active');
    expect(w.flags.get('story.j09.b1')).toBe(true);
    kill2(w, 'v1', 'yard-veteran', 'j09.b1');
    play(w, 'npc-stane', 'stane');
    expect(w.flags.get('story.j09.b2')).toBe(true);
    kill2(w, 'v2', 'yard-veteran', 'j09.b2');
    play(w, 'npc-stane', 'stane');
    expect(w.flags.get('story.j09.b3')).toBe(true);
    kill2(w, 'v3', 'yard-veteran', 'j09.b3');
    play(w, 'npc-stane', 'stane');
    finish(w, 'j09');
    expect(w.unlocked).toContain(SIDE_CODEX.openBoard);
  });

  it('j09: the trainer talk stays reachable from the offer', () => {
    const w = world();
    readyJ09(w);
    w.flags.set('story.m07.classOpen', true);
    expect(firstNode(w, 'npc-stane', 'stane')).toBe('j09-offer');
    const seen = play(w, 'npc-stane', 'stane', [3]);
    expect(seen).toContain('trainer-open-2');
    expect(w.manager.state('j09')).toBe('inactive');
  });

  it('j10: the fire, then the verse; the choice is kept and the camp sings it', () => {
    const w = world();
    afterM07(w);
    done(w, 'j04');
    play(w, 'npc-tobb', 'tobb', [1]);
    expect(w.manager.state('j10')).toBe('active');
    use(w, 'use:j10-fire');
    play(w, 'npc-tobb', 'tobb', [2]);
    finish(w, 'j10');
    expect(w.flags.get('story.j10.verse')).toBe('gate');
    const camp = dialogueDefs.find((d) => d.id === 'scene-act1-camp')!;
    const ids = camp.nodes.map((n) => n.id);
    for (const id of ['verse2-forge', 'verse2-gate', 'verse2-window']) expect(ids).toContain(id);
  });

  it('j11: Rook, the grate, two track points, two hounds, the waybill, report, pay', () => {
    const w = world();
    afterD02(w);
    play(w, 'npc-rook', 'rook', [1]);
    expect(w.manager.state('j11')).toBe('active');
    w.flags.set('world.underways.cartway', true);
    w.bus.emit('interact', { interactableId: 'use:j11-grate', action: 'interact' });
    w.settle();
    expect(w.manager.objectiveDone('j11', 'grate')).toBe(true);
    enter(w, 'trg.underways.j11-track-1');
    enter(w, 'trg.underways.j11-track-2');
    kill2(w, 'h1', 'ember-hound', 'j11.hounds');
    kill2(w, 'h2', 'ember-hound', 'j11.hounds');
    play(w, 'note-j11-waybill', 'note-j11-waybill');
    play(w, 'npc-rook', 'rook');
    finish(w, 'j11');
    expect(w.unlocked).toContain(SIDE_CODEX.cartTracks);
  });

  it('j11: the grate refuses without the key and opens with it', () => {
    expect(grateAnswer(false, false)).toBe('shut'); // shut, no key: refuses
    expect(grateAnswer(false, true)).toBe('open'); // shut, key: turns
    expect(grateAnswer(true, false)).toBe('none'); // already open
    expect(grateAnswer(true, true)).toBe('none');
    expect(KEYED_GRATES[0]!.itemId).toBe('sewer-master-key');
  });

  it('the waybill points at the Crucible and never names the crates as evidence', () => {
    const text = Object.entries(all).filter(([k]) => k.includes('j11.waybill') || k.includes('note-j11-waybill')).map(([, v]) => v).join(' ').toLowerCase();
    expect(text).toContain('crucible');
    expect(text).not.toMatch(/crate|evidence|proof/);
  });
});

describe('side jobs j05 to j11: saves and old saves', () => {
  const reload = (w: W): W => {
    const v = world();
    for (const [k, x] of w.flags) v.flags.set(k, x as FlagValue);
    v.manager.load(JSON.parse(JSON.stringify(w.manager.serialize())));
    v.settle();
    return v;
  };

  it('mid j05 (two places searched): resumes at the third', () => {
    const w = world();
    afterM06(w);
    play(w, 'note-j05-notice', 'note-j05-notice');
    play(w, 'npc-stallholder-1', 'stallholder-1');
    enter(w, 'j05.search-1');
    enter(w, 'j05.search-2');
    const v = reload(w);
    expect(v.manager.isObjectiveCurrent('j05', 'search3')).toBe(true);
    enter(v, 'j05.search-3');
    play(v, 'npc-crumb', 'crumb');
    play(v, 'npc-stallholder-1', 'stallholder-1');
    expect(v.manager.state('j05')).toBe('completed');
  });

  it('mid j06 (the crate taken): the delivery still counts', () => {
    const w = world();
    afterM06(w);
    play(w, 'note-j06-notice', 'note-j06-notice');
    play(w, 'npc-dunstan', 'dunstan');
    const v = reload(w);
    carried(v, 'j06.forge', 'crate-j06');
    play(v, 'npc-dunstan', 'dunstan');
    expect(v.manager.state('j06')).toBe('completed');
  });

  it('mid j07 (the candles lit, one niche): the count resumes', () => {
    const w = world();
    afterM07(w);
    play(w, 'note-j07-notice', 'note-j07-notice');
    play(w, 'npc-chandler', 'chandler');
    use(w, 'use:j07-candles');
    use(w, 'use:j07-niche-1');
    const v = reload(w);
    use(v, 'use:j07-niche-2');
    use(v, 'use:j07-niche-3');
    play(v, 'npc-sexton', 'sexton');
    expect(v.manager.state('j07')).toBe('completed');
  });

  it('mid j08 (the cutpurses armed, one down): still armed, the count resumes', () => {
    const w = world();
    afterM06(w);
    play(w, 'npc-sergeant', 'sergeant', [1]);
    for (const l of ['j08.lane-1', 'j08.lane-2']) enter(w, l);
    play(w, 'npc-dunstan', 'dunstan');
    enter(w, 'j08.lane-3');
    play(w, 'npc-aldith', 'aldith');
    enter(w, 'j08.lane-4');
    kill2(w, 'c1', 'alley-cutpurse', 'j08.cutpurse');
    const v = reload(w);
    expect(v.flags.get('story.j08.alleyWoke')).toBe(true);
    expect(progress(v, 'j08', 'cutpurses')).toBe(1);
    kill2(v, 'c2', 'alley-cutpurse', 'j08.cutpurse');
    play(v, 'npc-sergeant', 'sergeant');
    expect(v.manager.state('j08')).toBe('completed');
  });

  it('mid j09 (bout two called): the flag and the count survive', () => {
    const w = world();
    readyJ09(w);
    play(w, 'npc-stane', 'stane', [1]);
    kill2(w, 'v1', 'yard-veteran', 'j09.b1');
    play(w, 'npc-stane', 'stane');
    const v = reload(w);
    expect(v.flags.get('story.j09.b2')).toBe(true);
    kill2(v, 'v2', 'yard-veteran', 'j09.b2');
    expect(v.manager.objectiveDone('j09', 'bout2')).toBe(true);
  });

  it('mid j10 (the fire lit): Tobb asks for the verse', () => {
    const w = world();
    afterM07(w);
    done(w, 'j04');
    play(w, 'npc-tobb', 'tobb', [1]);
    use(w, 'use:j10-fire');
    expect(firstNode(reload(w), 'npc-tobb', 'tobb')).toBe('j10-verse');
  });

  it('mid j11 (the grate open, one track point): resumes', () => {
    const w = world();
    afterD02(w);
    play(w, 'npc-rook', 'rook', [1]);
    w.flags.set('world.underways.cartway', true);
    w.bus.emit('interact', { interactableId: 'use:j11-grate', action: 'interact' });
    w.settle();
    enter(w, 'trg.underways.j11-track-1');
    const v = reload(w);
    expect(v.manager.isObjectiveCurrent('j11', 'track2')).toBe(true);
    enter(v, 'trg.underways.j11-track-2');
    kill2(v, 'h1', 'ember-hound', 'j11.hounds');
    kill2(v, 'h2', 'ember-hound', 'j11.hounds');
    expect(v.manager.objectiveDone('j11', 'hounds')).toBe(true);
  });

  it('an old save loads with all eleven jobs inactive, no job flag, and the offers present', () => {
    const w = world();
    done(w, 'm02', 'm05', 'm06', 'm07');
    const old = JSON.parse(JSON.stringify(w.manager.serialize()));
    for (const j of SIDE_QUEST_IDS) delete old.quests[j];
    const v = world();
    v.manager.load(old);
    v.settle();
    for (const j of SIDE_QUEST_IDS) expect(v.manager.state(j), j).toBe('inactive');
    expect([...v.flags.keys()].filter((k) => /^story\.j(0\d|1\d)/.test(k))).toEqual([]);
    expect(firstNode(v, 'npc-sergeant', 'sergeant')).toBe('j08-offer');
  });
});

describe('j09: repeat bouts pay no xp and no gold, and a yard veteran yielding pays no favour', () => {
  it('a tagged j09 kill pays nothing, an untagged R02 kill pays', () => {
    const { p } = makeProgression();
    const base = (spawnTag: string | null, id: string) => ({ actorId: id, kind: 'yard-veteran', team: 'hostile', level: 3, killerId: 'player', spawnTag });
    for (const t of ['j09.b1', 'j09.b2', 'j09.b3', 'j09.repeat']) expect(p.onKill(base(t, `a-${t}`)), t).toBe(0);
    expect(p.onKill(base('r02.bout', 'ctl'))).toBeGreaterThan(0);
    expect(p.onMercy({ actorId: 'm1', kind: 'yard-veteran', level: 3, spawnTag: 'j09.repeat' })).toBe(0);
    expect(p.onMercy({ actorId: 'm2', kind: 'yard-veteran', level: 3, spawnTag: 'r02.bout' })).toBeGreaterThan(0);
  });

  it('the yard veteran has no favour track', () => {
    const w = world();
    let track: unknown = 'unset';
    w.bus.on('mercy', (e: { track: unknown }) => { track = e.track; });
    w.bus.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'yard-veteran', actorId: 'v', spawnTag: 'j09.repeat' });
    expect(track).toBeNull();
  });

  it('the repeat flag arms the single repeat bout; the job itself stays completed', () => {
    const w = world();
    readyJ09(w);
    play(w, 'npc-stane', 'stane', [1]);
    for (const [n, id] of [[1, 'v1'], [2, 'v2'], [3, 'v3']] as const) {
      kill2(w, id, 'yard-veteran', `j09.b${n}`);
      play(w, 'npc-stane', 'stane');
    }
    expect(w.manager.state('j09')).toBe('completed');
    expect(firstNode(w, 'npc-stane', 'stane')).toBe('j09-again');
    play(w, 'npc-stane', 'stane', [1]);
    expect(w.flags.get('story.j09.repeat')).toBe(true);
    const before = paid(w);
    kill2(w, 'rep', 'yard-veteran', 'j09.repeat');
    expect(paid(w)).toEqual(before);
    expect(w.manager.state('j09')).toBe('completed');
  });
});

describe('the xp and gold guard: all eleven jobs leave Act 2 entry within half a level of baseline', () => {
  it('level delta under 0.5 and gold within the 250 margin', async () => {
    const fx = await readAct1Fixture(ACT1_FIXTURES.complete) as { entries: { progression: { data: { xp: number } }; inventory: { data: { gold: number } } } };
    const base = fx.entries.progression.data.xp;
    const level = (xp: number) => {
      let l = 1;
      while (xpForLevel(l + 1) <= xp) l++;
      const lo = xpForLevel(l), hi = xpForLevel(l + 1);
      return l + (xp - lo) / (hi - lo);
    };
    const rewards = SIDE_QUEST_DEFS.reduce((n, d) => n + rewardOf(d.id).xp, 0);
    const gold = SIDE_QUEST_DEFS.reduce((n, d) => n + rewardOf(d.id).gold, 0);
    // kill xp at scale <= 1: j03 2 wraiths, j08 2 cutpurses, j11 2 hounds; the j09 tags pay 0
    const kills = 2 * KILL_XP_BASE['ash-wraith']! + 2 * KILL_XP_BASE['alley-cutpurse']! + 2 * KILL_XP_BASE['ember-hound']!;
    const delta = level(base + rewards + kills) - level(base);
    expect(delta, `+${rewards} reward xp, +${kills} kill xp at base ${base}`).toBeLessThan(0.5);
    expect(gold).toBeLessThanOrEqual(250);
    expect(fx.entries.inventory.data.gold + gold).toBeLessThanOrEqual(fx.entries.inventory.data.gold + 250);
  });

  it('no side spawner tag feeds the purse economy', () => {
    const tags = SIDE_SPAWNERS.map((s) => s.tag);
    for (const t of tags) expect(purseSource.includes(`'${t}'`), t).toBe(false);
  });
});
