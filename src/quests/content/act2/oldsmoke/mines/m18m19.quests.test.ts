// M18 and M19 through a real QuestManager over the shared fakes: the order of the objectives, what each event credits, A9's
// puzzle and shrine hooks, the stealth section, the sealed door flag, the rewards and the save round trip.
import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../../testKit';
import type { QuestDef } from '../../../../types';
import { validateQuest } from '../../../../validate';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { OLDSMOKE_NPC_DEFS } from '../../../../../oldsmoke/npcDefs';
import { M18M19, M18M19_NPC_DEFS } from './m18m19.content';
import { BELLOWS_LIT_FLAG, BELLOWS_PLAQUE, BELLOWS_PLAQUE_FLAG, BELLOWS_SOLVED_FLAG, M18_CRAWLERS_FLAG, M18_PIPES_NOTE, M18_SCENE, m18 } from './m18.quest';
import { M19_DOOR_OPEN_FLAG, M19_DOORS, M19_NURSERY_TRIGGER, M19_ROUTE_TRIGGER, M19_SCENE, M19_SECTION, m19 } from './m19.quest';

type W = ReturnType<typeof makeWorld>;
const talk = (w: W, npcId: string, reason?: string) => w.bus.emit('dialogue.ended', { npcId, reason });
const interact = (w: W, interactableId: string) => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action: 'interact' });
const done = (w: W, q: string, o: string) => w.manager.objectiveDone(q, o);
const current = (w: W, q: string): string | undefined => w.manager.objectives(q).find((o) => o.current)?.def.id;
const progress = (w: W, q: string, o: string): number => w.manager.objectives(q).find((x) => x.def.id === o)!.progress;
const killOf = (w: W, kind: string, tag: string, id: string) => w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind, spawnTag: tag });
const scene = (w: W, dialogueId: string, reason = 'completed') => w.bus.emit('dialogue.ended', { dialogueId, reason });
const stub = (id: string): QuestDef => ({ id, titleKey: `t.${id}`, summaryKey: `s.${id}`, objectives: [{ id: 'o', type: 'talk', target: `${id}-npc`, textKey: `o.${id}` }] });
const finish = (w: W, id: string) => { expect(w.manager.start(id)).toBe(true); talk(w, `${id}-npc`); expect(w.manager.state(id)).toBe('completed'); };
const begin = (w: W, id: string) => { expect(w.manager.start(id), `${id} starts`).toBe(true); };
const enter = (w: W, triggerId: string) => w.bus.emit('trigger.enter', { triggerId, actorId: 'p' });
const section = (w: W, phase: string, sectionId = M19_SECTION) => w.bus.emit('stealth.section', { sectionId, phase });

describe('content shape', () => {
  const strings = { ...M18M19.strings };

  it('both quests validate against the string table, under the ids m18 and m19, and every objective has text', () => {
    const has = (k: string) => k in strings;
    expect(M18M19.quests.map((q) => q.id)).toEqual(['m18', 'm19']);
    for (const q of M18M19.quests) {
      expect(validateQuest(q, has), q.id).toEqual([]);
      for (const o of q.objectives) expect(strings[o.textKey], `${q.id}.${o.id}`).toBeTruthy();
    }
  });

  it('M18 follows M17 and M19 follows M18', () => {
    expect(m18.startWhen).toEqual({ quest: 'm17', state: 'completed' });
    expect(m19.startWhen).toEqual({ quest: 'm18', state: 'completed' });
  });

  it('every prop, flag row, trigger, spawner and talk target points at something real', () => {
    const objs = new Map(M18M19.quests.map((q) => [q.id, new Set(q.objectives.map((o) => o.id))]));
    for (const p of M18M19.props) {
      expect(objs.get(p.objective[0])!.has(p.objective[1]), p.interactableId).toBe(true);
      expect(strings[p.promptKey], p.promptKey).toBeTruthy();
    }
    for (const f of M18M19.flags) if (f.objective) expect(objs.get(f.quest)!.has(f.objective), f.flag).toBe(true);
    const trg = new Set(M18M19.triggers.map((t) => t.id));
    expect(trg.has(M19_ROUTE_TRIGGER)).toBe(true);
    expect(trg.has(M19_NURSERY_TRIGGER)).toBe(true);
    for (const o of m19.objectives.filter((x) => x.type === 'goTo')) expect(trg.has(o.target as string), o.id).toBe(true);
    const notes = new Set(M18M19.notes.map((n) => n.id));
    expect(notes.has(M18_PIPES_NOTE)).toBe(true);
    const npcs = new Set([...OLDSMOKE_NPC_DEFS, ...M18M19_NPC_DEFS].map((d) => d.id));
    for (const q of M18M19.quests) for (const o of q.objectives.filter((x) => x.type === 'talk')) expect(npcs.has(o.target as string), `${q.id}.${o.id}`).toBe(true);
    for (const s of M18M19.spawners) expect(['m18', 'm19']).toContain((s.activation as { quest: string }).quest);
  });

  it('the crawlers wake on the lore objective\'s flag and the doors open the sealed-door flag', () => {
    expect(M18M19.spawners.find((s) => s.tag === 'm18.crawler')!.activation).toEqual({ quest: 'm18', flag: M18_CRAWLERS_FLAG });
    expect(M18M19.flags).toContainEqual({ quest: 'm18', objective: 'lore', flag: M18_CRAWLERS_FLAG });
    expect(M18M19.flags).toContainEqual({ quest: 'm19', objective: 'doors', flag: M19_DOOR_OPEN_FLAG });
  });

  it('the stealth section guards are the m19 spawner group (watch guards, never respawning, live with the quest)', () => {
    const g = M18M19.spawners.find((s) => s.id === 'stealth.m19.watch')!;
    expect(g.enemy).toBe('watch-guard');
    expect(g.respawn).toBe('never');
    expect(g.activation).toEqual({ quest: 'm19' });
  });

  it('no content writes A9\'s flags: not a quest effect, not a flag row, not a reward', () => {
    const A9 = [BELLOWS_LIT_FLAG, BELLOWS_SOLVED_FLAG, 'world.bellows.shortcutOpen', BELLOWS_PLAQUE_FLAG];
    for (const f of M18M19.flags) expect(A9).not.toContain(f.flag);
    for (const q of M18M19.quests) {
      const text = JSON.stringify({ s: q.onStart, c: q.onComplete, r: q.rewards });
      for (const f of A9) expect(text).not.toContain(f);
    }
  });
});

describe('M18 Breath for the Bellows', () => {
  function world(): W {
    const w = makeWorld([stub('m17'), m18]);
    finish(w, 'm17');
    return w;
  }
  const toKills = (w: W) => {
    talk(w, 'pike');
    interact(w, BELLOWS_PLAQUE);
    talk(w, M18_PIPES_NOTE, 'completed');
    talk(w, 'pike-apprentice');
    talk(w, 'pike');
  };
  const clear = (w: W) => { for (let i = 0; i < 6; i++) killOf(w, 'slag-crawler', 'm18.crawler', `c${i}`); };

  it('is refused until M17 is done', () => {
    const w = makeWorld([stub('m17'), m18]);
    expect(w.manager.start('m18')).toBe(false);
    finish(w, 'm17');
    expect(w.manager.start('m18')).toBe(true);
  });

  it('plays through to the report on A9\'s puzzle and rekindle events, with the XP once', () => {
    const w = world();
    begin(w, 'm18');
    toKills(w);
    expect(current(w, 'm18')).toBe('crawlers');
    clear(w);
    expect(current(w, 'm18')).toBe('solve');
    w.bus.emit('puzzle.solved', { id: 'weeping-bellows' });
    expect(current(w, 'm18')).toBe('rekindle');
    w.bus.emit('shrine.rekindled', { shrineId: 'weeping-bellows' });
    expect(current(w, 'm18')).toBe('breathe');
    scene(w, M18_SCENE);
    expect(current(w, 'm18')).toBe('report');
    expect(w.manager.state('m18')).toBe('active');
    talk(w, 'pike');
    expect(w.manager.state('m18')).toBe('completed');
    expect(w.calls.filter((c) => c === 'xp:550:quest:m18')).toHaveLength(1);
    // finished quests ignore a second round of the same events
    w.bus.emit('puzzle.solved', { id: 'weeping-bellows' });
    talk(w, 'pike');
    expect(w.calls.filter((c) => c === 'xp:550:quest:m18')).toHaveLength(1);
  });

  it('never writes the shrine flag, or any other of A9\'s flags, however it ends', () => {
    const w = world();
    installObjectiveFlags(M18M19.flags, w.bus, w.state, w.manager);
    begin(w, 'm18');
    toKills(w);
    clear(w);
    w.bus.emit('puzzle.solved', { id: 'weeping-bellows' });
    w.bus.emit('shrine.rekindled', { shrineId: 'weeping-bellows' });
    scene(w, M18_SCENE);
    talk(w, 'pike');
    expect(w.manager.state('m18')).toBe('completed');
    for (const k of w.flags.keys()) expect(k, k).not.toMatch(/^(shrine\.|world\.bellows\.)/);
    expect(w.flags.get('story.m18.started')).toBe(true);
    expect(w.flags.get(M18_CRAWLERS_FLAG)).toBe(true);
  });

  it('counts only the weeping-bellows puzzle and the weeping-bellows shrine', () => {
    const w = world();
    begin(w, 'm18');
    toKills(w);
    clear(w);
    w.bus.emit('puzzle.solved', { id: 'd04.pool-1' });
    w.bus.emit('puzzle.solved', {});
    expect(done(w, 'm18', 'solve')).toBe(false);
    w.bus.emit('puzzle.solved', { id: 'weeping-bellows' });
    w.bus.emit('shrine.rekindled', { shrineId: 'quenchstone' });
    w.bus.emit('shrine.rekindled', { shrineId: 'hushed-anvil' });
    expect(done(w, 'm18', 'rekindle')).toBe(false);
    w.bus.emit('shrine.rekindled', { shrineId: 'weeping-bellows' });
    expect(done(w, 'm18', 'rekindle')).toBe(true);
  });

  it('a puzzle solved before the quest reached it, or before the quest began, is credited from A9\'s flags', () => {
    const w = world();
    w.flags.set(BELLOWS_SOLVED_FLAG, true);
    w.flags.set(BELLOWS_LIT_FLAG, true);
    w.flags.set(BELLOWS_PLAQUE_FLAG, true);
    begin(w, 'm18');
    talk(w, 'pike');
    expect(current(w, 'm18')).toBe('pipes'); // the plaque was read already
    talk(w, M18_PIPES_NOTE, 'completed');
    talk(w, 'pike-apprentice');
    talk(w, 'pike');
    clear(w);
    expect(current(w, 'm18')).toBe('breathe'); // solve and rekindle close on reaching them
    scene(w, M18_SCENE);
    talk(w, 'pike');
    expect(w.manager.state('m18')).toBe('completed');
  });

  it('events come in order: the puzzle before the crawlers earns nothing without the flag', () => {
    const w = world();
    begin(w, 'm18');
    toKills(w);
    w.bus.emit('puzzle.solved', { id: 'weeping-bellows' });
    expect(done(w, 'm18', 'solve')).toBe(false);
    clear(w);
    expect(current(w, 'm18')).toBe('solve');
  });

  it('counts six distinct crawlers of the cavern tag and nothing else', () => {
    const w = world();
    begin(w, 'm18');
    toKills(w);
    killOf(w, 'slag-crawler', 'other.tag', 'x1');
    killOf(w, 'ember-hound', 'm18.crawler', 'x2');
    for (let i = 0; i < 5; i++) killOf(w, 'slag-crawler', 'm18.crawler', `c${i}`);
    killOf(w, 'slag-crawler', 'm18.crawler', 'c0'); // the same crawler again
    expect(progress(w, 'm18', 'crawlers')).toBe(5);
    expect(done(w, 'm18', 'crawlers')).toBe(false);
    killOf(w, 'slag-crawler', 'm18.crawler', 'c5');
    expect(done(w, 'm18', 'crawlers')).toBe(true);
  });

  it('the pipes need the note read to its end, and the plaque is A9\'s own interactable', () => {
    const w = world();
    begin(w, 'm18');
    talk(w, 'pike');
    interact(w, 'use:note-m18-plaque'); // not A9's plaque
    expect(done(w, 'm18', 'plaque')).toBe(false);
    interact(w, BELLOWS_PLAQUE);
    talk(w, M18_PIPES_NOTE, 'skip');
    expect(done(w, 'm18', 'pipes')).toBe(false);
    talk(w, M18_PIPES_NOTE, 'completed');
    expect(done(w, 'm18', 'pipes')).toBe(true);
  });

  it('the scene counts when it completes and not when it is skipped or another scene ends', () => {
    const w = world();
    w.flags.set(BELLOWS_SOLVED_FLAG, true);
    w.flags.set(BELLOWS_LIT_FLAG, true);
    w.flags.set(BELLOWS_PLAQUE_FLAG, true);
    begin(w, 'm18');
    talk(w, 'pike');
    talk(w, M18_PIPES_NOTE, 'completed');
    talk(w, 'pike-apprentice');
    talk(w, 'pike');
    clear(w);
    scene(w, M18_SCENE, 'skip');
    scene(w, 'scene-m19-nursery');
    expect(done(w, 'm18', 'breathe')).toBe(false);
    scene(w, M18_SCENE);
    expect(done(w, 'm18', 'breathe')).toBe(true);
  });

  it('keeps its progress across a save, mid-crawlers', () => {
    const w = world();
    begin(w, 'm18');
    toKills(w);
    for (let i = 0; i < 3; i++) killOf(w, 'slag-crawler', 'm18.crawler', `c${i}`);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m17'), m18]);
    w2.manager.load(data);
    expect(w2.manager.state('m18')).toBe('active');
    expect(current(w2, 'm18')).toBe('crawlers');
    expect(progress(w2, 'm18', 'crawlers')).toBe(3);
    for (let i = 3; i < 6; i++) killOf(w2, 'slag-crawler', 'm18.crawler', `c${i}`);
    expect(current(w2, 'm18')).toBe('solve');
    // a crawler killed before the save does not count twice after it
    killOf(w2, 'slag-crawler', 'm18.crawler', 'c0');
    expect(progress(w2, 'm18', 'crawlers')).toBe(6);
  });
});

describe('M19 What Grisel Hides', () => {
  function world(): W {
    const w = makeWorld([stub('m18'), m19]);
    finish(w, 'm18');
    return w;
  }
  const doors = (w: W) => { for (const d of M19_DOORS) interact(w, d); };
  const toDoors = (w: W) => {
    talk(w, 'wenna');
    enter(w, M19_ROUTE_TRIGGER);
    section(w, 'entered');
    section(w, 'cleared');
  };

  it('is refused until M18 is done, and while M18 is still open', () => {
    const w = makeWorld([stub('m18'), m19]);
    expect(w.manager.start('m19')).toBe(false);
    expect(w.manager.start('m18')).toBe(true);
    expect(w.manager.start('m19')).toBe(false);
    talk(w, 'm18-npc');
    expect(w.manager.start('m19')).toBe(true);
  });

  it('plays through confession, lead, stealth, doors, reveal and both talks, with the XP once', () => {
    const w = world();
    begin(w, 'm19');
    talk(w, 'wenna'); // the offer\'s own end credits the confession
    expect(current(w, 'm19')).toBe('route');
    enter(w, M19_ROUTE_TRIGGER);
    expect(current(w, 'm19')).toBe('stealth');
    section(w, 'entered');
    expect(done(w, 'm19', 'stealth')).toBe(false);
    section(w, 'cleared');
    expect(current(w, 'm19')).toBe('doors');
    doors(w);
    expect(current(w, 'm19')).toBe('reveal');
    scene(w, M19_SCENE);
    expect(current(w, 'm19')).toBe('nursery');
    talk(w, 'wenna');
    expect(current(w, 'm19')).toBe('report'); // one talk does not close both
    expect(w.manager.state('m19')).toBe('active');
    talk(w, 'wenna');
    expect(w.manager.state('m19')).toBe('completed');
    expect(w.calls.filter((c) => c === 'xp:550:quest:m19')).toHaveLength(1);
    talk(w, 'wenna');
    expect(w.calls.filter((c) => c === 'xp:550:quest:m19')).toHaveLength(1);
  });

  it('the lead is credited at the stealth start trigger only for the player, and only once the confession is done', () => {
    const w = world();
    begin(w, 'm19');
    enter(w, M19_ROUTE_TRIGGER); // before the confession ends
    expect(done(w, 'm19', 'route')).toBe(false);
    talk(w, 'wenna');
    w.bus.emit('trigger.enter', { triggerId: M19_ROUTE_TRIGGER, actorId: 'wyrm' });
    w.bus.emit('trigger.enter', { triggerId: 'trg.q13.m17.floor', actorId: 'p' });
    expect(done(w, 'm19', 'route')).toBe(false);
    enter(w, M19_ROUTE_TRIGGER);
    expect(done(w, 'm19', 'route')).toBe(true);
  });

  it('only the cleared phase of the m19 section counts: not entered, not exited, not another section', () => {
    const w = world();
    begin(w, 'm19');
    talk(w, 'wenna');
    enter(w, M19_ROUTE_TRIGGER);
    section(w, 'entered');
    section(w, 'exited');
    section(w, 'cleared', 'm21.grisel-hall');
    section(w, 'cleared', 'm09.counting-house');
    expect(done(w, 'm19', 'stealth')).toBe(false);
    section(w, 'cleared');
    expect(done(w, 'm19', 'stealth')).toBe(true);
  });

  it('the stealth section cleared before the lead is done earns nothing (the section is not live yet)', () => {
    const w = world();
    begin(w, 'm19');
    talk(w, 'wenna');
    section(w, 'cleared');
    expect(done(w, 'm19', 'stealth')).toBe(false);
    enter(w, M19_ROUTE_TRIGGER);
    expect(current(w, 'm19')).toBe('stealth');
  });

  it('the sealed door needs three distinct locks, and opens its flag on the third', () => {
    const w = world();
    installObjectiveFlags(M18M19.flags, w.bus, w.state, w.manager);
    begin(w, 'm19');
    toDoors(w);
    interact(w, M19_DOORS[0]);
    interact(w, M19_DOORS[0]);
    interact(w, M19_DOORS[1]);
    interact(w, 'use:m19-door-9');
    expect(progress(w, 'm19', 'doors')).toBe(2);
    expect(w.flags.get(M19_DOOR_OPEN_FLAG)).toBeUndefined();
    interact(w, M19_DOORS[2]);
    expect(done(w, 'm19', 'doors')).toBe(true);
    expect(w.flags.get(M19_DOOR_OPEN_FLAG)).toBe(true);
  });

  it('the reveal counts when the scene completes, not when it is skipped, another scene ends, or the doors are still shut', () => {
    const w = world();
    begin(w, 'm19');
    toDoors(w);
    scene(w, M19_SCENE); // doors not done: the objective is not current
    expect(done(w, 'm19', 'reveal')).toBe(false);
    doors(w);
    scene(w, M19_SCENE, 'skip');
    scene(w, 'scene-m18-breath');
    expect(done(w, 'm19', 'reveal')).toBe(false);
    scene(w, M19_SCENE);
    expect(done(w, 'm19', 'reveal')).toBe(true);
  });

  it('the quest\'s own scene end is not a talk with Wenna: the nursery talk still needs the conversation', () => {
    const w = world();
    begin(w, 'm19');
    toDoors(w);
    doors(w);
    w.bus.emit('dialogue.ended', { dialogueId: M19_SCENE, npcId: 'scene.m19', reason: 'completed' });
    expect(current(w, 'm19')).toBe('nursery');
  });

  it('keeps its progress across a save, mid-doors', () => {
    const w = world();
    begin(w, 'm19');
    toDoors(w);
    interact(w, M19_DOORS[0]);
    interact(w, M19_DOORS[1]);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m18'), m19]);
    w2.manager.load(data);
    expect(w2.manager.state('m19')).toBe('active');
    expect(current(w2, 'm19')).toBe('doors');
    interact(w2, M19_DOORS[1]); // already counted before the save
    expect(progress(w2, 'm19', 'doors')).toBe(2);
    interact(w2, M19_DOORS[2]);
    expect(current(w2, 'm19')).toBe('reveal');
  });
});

describe('the pair', () => {
  it('M18 then M19 chain through the quest manager and both pay their XP once', () => {
    const w = makeWorld([stub('m17'), m18, m19]);
    finish(w, 'm17');
    begin(w, 'm18');
    expect(w.manager.start('m19')).toBe(false);
    for (const [obj, fire] of [
      ['brief', () => talk(w, 'pike')], ['plaque', () => interact(w, BELLOWS_PLAQUE)], ['pipes', () => talk(w, M18_PIPES_NOTE, 'completed')],
      ['apprentice', () => talk(w, 'pike-apprentice')], ['lore', () => talk(w, 'pike')],
    ] as const) { expect(current(w, 'm18')).toBe(obj); fire(); }
    for (let i = 0; i < 6; i++) killOf(w, 'slag-crawler', 'm18.crawler', `c${i}`);
    w.bus.emit('puzzle.solved', { id: 'weeping-bellows' });
    w.bus.emit('shrine.rekindled', { shrineId: 'weeping-bellows' });
    scene(w, M18_SCENE);
    talk(w, 'pike');
    expect(w.manager.state('m18')).toBe('completed');
    begin(w, 'm19');
    talk(w, 'wenna');
    enter(w, M19_ROUTE_TRIGGER);
    section(w, 'cleared');
    for (const d of M19_DOORS) interact(w, d);
    scene(w, M19_SCENE);
    talk(w, 'wenna');
    talk(w, 'wenna');
    expect(w.manager.state('m19')).toBe('completed');
    expect(w.calls.filter((c) => c.startsWith('xp:550:quest:'))).toEqual(['xp:550:quest:m18', 'xp:550:quest:m19']);
  });
});
