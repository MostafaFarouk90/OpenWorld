// Act 1 side jobs j01 to j04 (plans/act1-side-content.md), at the logic level: offers hidden before their conditions, every
// success path, both loaf choices, j03 from either stone, a save and reload in the middle of each job, an old save with every
// job inactive, the pay band, the content tables against the layouts, the barrow spawners (outside every patrol and trigger
// box, prop-free, armed by a flag, no respawn) and the reusable starting-note and notice-board pieces.
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
  boardNotice, startingNote,
} from './index';
import { installSideCodex } from './codex';
import { SIDE_SPAWNERS } from '../../../enemies/sideSpawners';
import { SLICE_SPAWNERS } from '../../../enemies/spawnerDefs';
import { BRIGHTWATER_SPAWNERS } from '../../../enemies/brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from '../../../enemies/densitySpawners';
import { BRIGHTWATER_LAYOUT } from '../../../region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../../../region/corridor.layout';
import { DEADROAD_LAYOUT } from '../../../region/deadroad.layout';
import { DENSITY_LAYOUT_A } from '../../../region/density.layout';
import { pointInFootprint } from '../../../region/geometry';
import { classOf } from '../../../env/PlacementField';
import { TILES } from '../../../env/tiles';
import { NPC_DEFS } from '../../../npcs/npcDefs';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const LAYOUTS = [BRIGHTWATER_LAYOUT, CORRIDOR_LAYOUT, DEADROAD_LAYOUT, DENSITY_LAYOUT_A];
const anchorList = LAYOUTS.flatMap((l) => l.anchors);
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
  it('registers j01 to j04 once, appended to questDefs', () => {
    expect(SIDE_QUEST_IDS).toEqual(['j01', 'j02', 'j03', 'j04']);
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
    const triggers = new Set(LAYOUTS.flatMap((l) => l.triggers).map((t) => t.id));
    for (const p of SIDE_PROPS) at(p.anchorId);
    for (const c of SIDE_CARRY) {
      at(c.homeAnchor);
      expect(triggers.has(c.destination), c.destination).toBe(true);
    }
    for (const n of SIDE_QUEST_NOTES) at(n.anchorId);
    for (const d of SIDE_QUEST_DEFS) for (const o of d.objectives) if (o.type === 'goTo') expect(triggers.has(o.target as string), `${d.id}.${o.id}`).toBe(true);
    for (const id of SIDE_NOTE_CODEX) {
      const slug = id.replace(/^lore\./, '');
      expect(all[`codex.lore.${slug}.name`], id).toBeDefined();
      expect(all[`codex.lore.${slug}.body`], id).toBeDefined();
    }
    expect(SIDE_QUEST_CODEX).toEqual({ j03: SIDE_CODEX.waystones });
    for (const id of ['orla', 'osmund']) {
      expect(NPC_DEFS.some((d) => d.id === id), id).toBe(true);
      expect(BRIGHTWATER_LAYOUT.npcs.find((n) => n.id === id)!.presentWhen).toBe('story.side.kettlewickOpen');
      at(`npc-post.${id}`);
    }
  });

  it('the merged dialogues validate', () => {
    for (const id of ['npc-hob', 'npc-edda', 'npc-aldwin', 'npc-tobb', 'npc-orla', 'npc-osmund', 'note-j03-bluff', 'note-j03-tablet', 'scene-act1-camp']) {
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

describe('side jobs: the barrow spawners', () => {
  const spawnIds = SIDE_SPAWNERS.flatMap((s) => [s.anchor, ...(s.memberAnchors ?? [])]);
  const rows = Object.values(TILES).flat().filter((r) => classOf(r.id) !== 'ground');
  const triggers = LAYOUTS.flatMap((l) => l.triggers);
  const structures = LAYOUTS.flatMap((l) => l.structures);

  /** Every patrol's bounding box: layout patrols, spawner patrols, and patrol.* anchor groups. */
  const patrolBoxes = () => {
    const groups = new Map<string, { x: number; z: number }[]>();
    for (const a of anchorList) {
      if (!a.id.startsWith('patrol.')) continue;
      const parts = a.id.split('.');
      const key = parts.slice(0, parts.length > 3 ? 3 : 2).join('.');
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    for (const p of LAYOUTS.flatMap((l) => l.patrols)) groups.set(p.id, p.points.map(at));
    for (const s of [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...DENSITY_SPAWNERS_A]) {
      if (Array.isArray(s.patrol)) groups.set(`spawner:${s.id}`, (s.patrol as string[]).flatMap((id) => anchorList.filter((a) => a.id === id)));
    }
    return [...groups].filter(([, pts]) => pts.length > 0).map(([id, pts]) => ({
      id, x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)),
    }));
  };

  it('arms on the quest-level flag, never respawns, and the kill objective counts by its tag', () => {
    expect(SIDE_SPAWNERS).toHaveLength(1);
    expect(SIDE_SPAWNERS[0]).toMatchObject({ tag: 'j03.barrow', enemy: 'ash-wraith', count: 2, respawn: 'never', activation: { flag: 'story.j03.started' } });
    expect(SIDE_OBJECTIVE_FLAGS).toContainEqual({ quest: 'j03', flag: 'story.j03.started' });
    expect(SIDE_QUEST_DEFS.find((q) => q.id === 'j03')!.objectives.find((o) => o.id === 'wake')).toMatchObject({ spawnTag: 'j03.barrow', required: 2 });
  });

  it('every spawn anchor exists', () => {
    expect(new Set(spawnIds)).toEqual(new Set(['spawn.j03.barrow-1', 'spawn.j03.barrow-2']));
    for (const id of spawnIds) at(id);
  });

  it('stands outside every patrol box (6 m) and every trigger volume (4 m)', () => {
    const boxes = patrolBoxes();
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const id of new Set(spawnIds)) {
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

  it('is prop-free: no environment prop within 3 m and no structure footprint within 1 m', () => {
    for (const id of new Set(spawnIds)) {
      const { x, z } = at(id);
      for (const r of rows) expect(Math.hypot(r.x - x, r.z - z), `${id} near ${r.id} at ${r.x},${r.z}`).toBeGreaterThanOrEqual(3);
      for (const s of structures) expect(pointInFootprint(s, x, z, 1), `${id} in ${s.id}`).toBe(false);
    }
  });

  it('keeps the three batch 2 Dead Road points of interest where they were', () => {
    for (const id of ['poi.deadroad.stone-1', 'poi.deadroad.stone-2', 'poi.deadroad.barrow']) at(id);
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
