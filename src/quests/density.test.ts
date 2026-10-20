// Act 1 density pass, batch 1: the new quest systems (notes, objective flags, looks, the save migration, the R01 field
// and sergeant bridges, bucket carries, prop conditions) and the quest fires, on success, failure and edge paths.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeWorld, FakeBus, fakeState } from './testKit';
import { QuestNotes, noteDialogueId } from './notes';
import { installObjectiveFlags } from './objectiveFlags';
import { QuestLooks, lookSpecs, lookVisible } from './looks';
import { QuestProps } from './props';
import { CarrySystem, type Carryable } from './carry';
import { installBridges, TORCH_USED_FLAG, R01_SCORCHED, M04_SERGEANT, R01_AFTERMATH } from './bridges';
import { QUEST_NOTES, NOTE_LOOKS } from './content/notes';
import { QUEST_PROPS } from './content/props';
import { CARRY_ITEMS } from './content/carry';
import { OBJECTIVE_FLAGS } from './content/objectiveFlags';
import { m02, M02_RUBBLE } from './content/m02.quest';
import { m03 } from './content/m03.quest';
import { m04 } from './content/m04.quest';
import { r01 } from './content/r01.quest';
import { m01 } from './content/m01.quest';
import { CrisisDressing, FIRE_FLAG } from '../tutorial/CrisisDressing';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import type { QuestDef } from './types';
import { PostDirector, POST_RULES } from './posts';
import { BRIGHTWATER_SPAWNERS } from '../enemies/brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from '../enemies/densitySpawners';
import { CORRIDOR_LAYOUT } from '../region/corridor.layout';
import { VAULT_DEF } from '../interiors/vaultDef';
import { HARROWMARK_DOOR_LOCKS, HARROWMARK_FLAG_BLOCKERS } from '../interiors/harrowmark/locks';
import { m05 } from './content/m05.quest';
import { d01, D01_BRAZIERS, D01_TABLETS } from './content/d01.quest';
import { npcCarter3 } from '../dialogue/content/npc-carter-3.dialogue';
import { evalCondition } from './conditions';

const at = { x: 1, y: 0, z: 2 };

describe('readable notes', () => {
  function setup(anchorOk = true) {
    const w = makeWorld([m03]);
    const registered = new Map<string, { enabled(): boolean; onInteract(): void; promptKey: string }>();
    const started: string[] = [];
    const codex: string[] = [];
    const warn = vi.fn();
    const notes = new QuestNotes(QUEST_NOTES, {
      bus: w.bus,
      env: () => ({ state: w.state, quests: w.manager }),
      anchor: () => (anchorOk ? at : undefined),
      register: (i) => { registered.set(i.id, i); return () => registered.delete(i.id); },
      startDialogue: (d, n) => { started.push(`${d}/${n}`); return true; },
      codexUnlock: (id) => codex.push(id),
      warn,
    });
    return { w, notes, registered, started, codex, warn };
  }

  it('registers every note once its anchor exists, and opens it as a dialogue under its own id', () => {
    const t = setup();
    t.notes.update();
    t.notes.update();
    expect([...t.registered.keys()].sort()).toEqual(QUEST_NOTES.map((n) => n.interactableId).sort());
    const badge = t.registered.get('use:note-m02-badge')!;
    expect(badge.enabled()).toBe(true);
    expect(badge.promptKey).toBe('quest.prompt.read');
    badge.onInteract();
    expect(t.started).toEqual(['note-m02-badge/note-m02-badge']);
    expect(noteDialogueId('use:note-m02-badge')).toBe('note-m02-badge');
  });

  it('waits for missing anchors and registers nothing', () => {
    const t = setup(false);
    t.notes.update();
    expect(t.registered.size).toBe(0);
    expect(t.notes.pending()).toHaveLength(QUEST_NOTES.length);
  });

  it('keeps the M03 study notes shut until the shard study is done, and the toll box shut until the post is down', () => {
    const t = setup();
    t.notes.update();
    const font = t.registered.get('use:note-m03-font')!;
    expect(font.enabled()).toBe(false);
    font.onInteract();
    expect(t.started).toEqual([]);
    t.w.manager.start('m03');
    t.w.manager.completeObjective('m03', 'o1');
    expect(font.enabled()).toBe(false);
    t.w.manager.completeObjective('m03', 'o2');
    expect(font.enabled()).toBe(true);
    expect(font.promptKey).toBe('quest.prompt.study');
    const box = t.registered.get('use:note-m04-toll-box')!;
    expect(box.enabled()).toBe(false);
    t.w.flags.set('world.brightwater.tollPost', true);
    expect(box.enabled()).toBe(true);
  });

  it('unlocks the codex entry only for a note read to its end', () => {
    const t = setup();
    t.w.bus.emit('dialogue.ended', { npcId: 'note-m03-wulfric', reason: 'skip' });
    t.w.bus.emit('dialogue.ended', { npcId: 'gaut', reason: 'completed' });
    expect(t.codex).toEqual([]);
    t.w.bus.emit('dialogue.ended', { npcId: 'note-m03-wulfric', reason: 'completed' });
    expect(t.codex).toEqual(['lore.wulfric']);
  });

  it('a register that throws gives up on that note only, with one warning; dispose unregisters', () => {
    const w = makeWorld();
    const warn = vi.fn();
    const ids: string[] = [];
    const before = w.bus.listeners('dialogue.ended');
    const notes = new QuestNotes(QUEST_NOTES, {
      bus: w.bus, env: () => ({ state: w.state, quests: w.manager }), anchor: () => at,
      register: (i) => { if (i.id === 'use:note-m02-badge') throw new Error('dup'); ids.push(i.id); return () => ids.splice(ids.indexOf(i.id), 1); },
      startDialogue: () => true, warn,
    });
    notes.update();
    notes.update();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(ids).toHaveLength(QUEST_NOTES.length - 1);
    notes.dispose();
    expect(ids).toEqual([]);
    expect(w.bus.listeners('dialogue.ended')).toBe(before);
  });
});

describe('objective flags', () => {
  it('sets a flag when its objective is done, not on progress, and catches up on completed quests', () => {
    const w = makeWorld([m02, r01]);
    const of = installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
    w.manager.start('m02');
    for (let i = 1; i <= 2; i++) w.bus.emit('carry.delivered', { destinationId: 'm02.bakery-door', carryId: `b${i}` });
    expect(w.flags.get('story.m02.doorDoused')).toBe(true);
    w.bus.emit('trigger.enter', { triggerId: 'm02.bakery', actorId: 'p' });
    w.bus.emit('interact', { interactableId: M02_RUBBLE[0] });
    expect(w.flags.has('story.m02.rubbleCleared')).toBe(false); // one of two
    w.bus.emit('interact', { interactableId: M02_RUBBLE[0] }); // the same heap again
    expect(w.flags.has('story.m02.rubbleCleared')).toBe(false);
    w.bus.emit('interact', { interactableId: M02_RUBBLE[1] });
    expect(w.flags.get('story.m02.rubbleCleared')).toBe(true);
    // a save from before the flags existed: R01 completed, flags missing
    w.manager.start('r01');
    w.manager.complete('r01');
    w.flags.delete('story.r01.rootWoke');
    of.sync();
    expect(w.flags.get('story.r01.rootWoke')).toBe(true);
    const listening = w.bus.listeners('quest.objective');
    of.dispose();
    expect(w.bus.listeners('quest.objective')).toBe(listening - 1);
  });

  it('warns and carries on when the flag store throws', () => {
    const w = makeWorld([m02]);
    const warn = vi.fn();
    installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, { ...w.state, setFlag: () => { throw new Error('bad'); } }, w.manager, warn);
    w.manager.start('m02');
    expect(() => w.manager.completeObjective('m02', 'door')).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('save migration (sequential quests that grew)', () => {
  const load = (def: QuestDef, objectives: Record<string, number>, state = 'active') => {
    const w = makeWorld([def]);
    w.manager.load({ quests: { [def.id]: { state, objectives } } });
    return w;
  };

  it('an old mid-M03 save (o3 done, the new study objective unknown) keeps its place', () => {
    const w = load(m03, { o1: 1, o2: 1, o3: 1 });
    expect(w.manager.objectiveDone('m03', 'study')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m03', 'o4')).toBe(true);
  });

  it('an old M04 save past the post credits the sergeant and the four soldiers', () => {
    const w = load(m04, { o1: 1, o2: 1, o3: 2, o4: 1 });
    expect(w.manager.objectiveDone('m04', 'o3')).toBe(true);
    expect(w.manager.objectiveDone('m04', 'sergeant')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m04', 'ledger')).toBe(true);
  });

  it('leaves a save at the current objective alone, and never touches the last started objective', () => {
    const w = load(m04, { o1: 1, o2: 1, o3: 2 });
    expect(w.manager.objectiveDone('m04', 'o3')).toBe(false);
    expect(w.manager.isObjectiveCurrent('m04', 'o3')).toBe(true);
    expect(w.manager.objectives('m04').find((o) => o.def.id === 'o3')!.progress).toBe(2);
  });

  it('does not migrate non-sequential quests (M01) or completed ones', () => {
    const w = load(m01, { o1: 5, o2: 3 });
    expect(w.manager.objectiveDone('m01', 'tavern')).toBe(false);
    const c = load(m03, { o1: 1 }, 'completed');
    expect(c.manager.state('m03')).toBe('completed');
    expect(c.calls).toEqual([]); // no rewards re-run on load
  });

  it('a save made mid-objective in the new layout loads back to the same objective', () => {
    const w = makeWorld([m02]);
    w.manager.start('m02');
    for (const o of ['door', 'o1', 'rubble']) w.manager.completeObjective('m02', o);
    const saved = JSON.parse(JSON.stringify(w.manager.serialize()));
    const v = makeWorld([m02]);
    v.manager.load(saved);
    expect(v.manager.isObjectiveCurrent('m02', 'oven')).toBe(true);
    expect(v.manager.objectiveDone('m02', 'rubble')).toBe(true);
  });
});

describe('review fixes: legacy kill counts and saved dedupe keys', () => {
  it('a version 1 save at the old kill count counts as done (the old enemies are dead and never respawn)', () => {
    const w = makeWorld([m03, m04]);
    w.manager.load({ quests: { m03: { state: 'active', objectives: { o1: 1, o2: 1, study: 3, o3: 1, o4: 1, o5: 1, o6: 1 } }, m04: { state: 'active', objectives: { o1: 1, o2: 1, o3: 2 } } } }, 1);
    expect(w.manager.objectiveDone('m03', 'o6')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m03', 'o7')).toBe(true);
    expect(w.manager.objectiveDone('m04', 'o3')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m04', 'sergeant')).toBe(true);
  });

  it('a version 1 save short of the old count, and any version 2 save, keep their progress', () => {
    const w = makeWorld([m04]);
    w.manager.load({ quests: { m04: { state: 'active', objectives: { o1: 1, o2: 1, o3: 1 } } } }, 1);
    expect(w.manager.objectives('m04').find((o) => o.def.id === 'o3')!.progress).toBe(1);
    const v = makeWorld([m04]);
    v.manager.load({ quests: { m04: { state: 'active', objectives: { o1: 1, o2: 1, o3: 2 } } } }, 2);
    expect(v.manager.objectiveDone('m04', 'o3')).toBe(false);
  });

  it('only the two grown kill objectives carry a legacy count', () => {
    const legacy = [m01, m02, m03, m04, r01].flatMap((q) => q.objectives.filter((o) => o.legacyRequired !== undefined).map((o) => `${q.id}.${o.id}:${o.legacyRequired}`));
    expect(legacy).toEqual(['m03.o6:1', 'm04.o3:2']);
  });

  it('dedupe keys survive a save and load, so a scarecrow cleared before the save cannot count twice', () => {
    const w = makeWorld([r01]);
    w.manager.start('r01');
    for (const o of ['o1', 'shawl']) if (r01.objectives.some((x) => x.id === o)) w.manager.completeObjective('r01', o);
    expect(w.manager.isObjectiveCurrent('r01', 'o2')).toBe(true);
    w.bus.emit('scarecrow.cleared', { scarecrowId: 'r01.scarecrows#0' });
    const saved = JSON.parse(JSON.stringify(w.manager.serialize()));
    expect(saved.dedupe).toEqual({ r01: { o2: ['r01.scarecrows#0'] } });
    const v = makeWorld([r01]);
    v.manager.load(saved);
    v.bus.emit('scarecrow.cleared', { scarecrowId: 'r01.scarecrows#0' });
    expect(v.manager.objectives('r01').find((o) => o.def.id === 'o2')!.progress).toBe(1);
    v.bus.emit('scarecrow.cleared', { scarecrowId: 'r01.scarecrows#1' });
    expect(v.manager.objectives('r01').find((o) => o.def.id === 'o2')!.progress).toBe(2);
  });

  it('malformed or stale dedupe data is dropped, and a save with no keys has no dedupe field', () => {
    const w = makeWorld([r01]);
    expect(w.manager.serialize()).toEqual({ quests: {} });
    w.manager.load({ quests: { r01: { state: 'completed', objectives: {} } }, dedupe: { r01: { o2: ['x'] }, zz: 5, m01: null } });
    expect(w.manager.serialize().dedupe).toBeUndefined();
    const v = makeWorld([r01]);
    v.manager.load({ quests: { r01: { state: 'active', objectives: { o1: 1, shawl: 1 } } }, dedupe: { r01: { o2: [1, 'a'], nope: ['b'] } } });
    expect(v.manager.serialize().dedupe).toEqual({ r01: { o2: ['a'] } });
  });
});

describe('review fixes: spawns wait for the end of their lesson or note', () => {
  const flagOf = (q: string, o: string) => OBJECTIVE_FLAGS.find((f) => f.quest === q && f.objective === o)?.flag;
  const act = (id: string) => [...BRIGHTWATER_SPAWNERS, ...DENSITY_SPAWNERS_A].find((d) => d.id === id)!.activation;

  it('the churchyard, the ford pairs and both scarecrow groups gate on the objective flag, not the unlocked verb', () => {
    expect(act('brightwater.churchyard')).toEqual({ flag: flagOf('m03', 'o5') });
    expect(act('brightwater.ford.pair-1')).toEqual({ quest: 'm04', flag: flagOf('m04', 'o2') });
    expect(act('brightwater.ford.pair-2')).toEqual({ quest: 'm04', flag: flagOf('m04', 'o2') });
    expect(act('r01.scarecrows')).toEqual({ quest: 'r01', flag: flagOf('r01', 'shawl') });
    expect(act('r01.scarecrows-east')).toEqual({ quest: 'r01', flag: flagOf('r01', 'shawl') });
  });

  it('the flags go on only when the objective is done (a talk cut short sets nothing)', () => {
    const w = makeWorld([m03, r01]);
    const bridge = installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
    w.manager.start('r01');
    w.manager.start('m03');
    w.state.setFlag('enemies.mercy.release', true); // the verb unlocks mid-talk
    expect(w.state.getFlag('story.m03.releaseTaught')).not.toBe(true);
    expect(w.state.getFlag('story.r01.shawlRead')).not.toBe(true);
    for (const o of ['o1', 'shawl']) if (r01.objectives.some((x) => x.id === o)) w.manager.completeObjective('r01', o);
    expect(w.state.getFlag('story.r01.shawlRead')).toBe(true);
    bridge.dispose();
  });
});

describe('review fixes: NPC placement and lines', () => {
  it('Aldwin is left to his walk-off while M01 runs after he is found, even across an in-session load', () => {
    const w = makeWorld([m01]);
    const dir = new PostDirector(POST_RULES, () => ({ state: w.state, quests: w.manager }), () => w.npcs);
    w.manager.complete('m01');
    dir.update();
    expect(w.npcs.placed).toContainEqual(['aldwin', 'npc-post.aldwin']);
    const before = w.npcs.placed.length;
    // an earlier save loads: M01 active, the miller already found
    w.manager.load({ quests: { m01: { state: 'active', objectives: { miller: 1 } } } });
    w.state.setFlag('story.m01.millerSafe', true);
    dir.reset();
    dir.update();
    expect(w.npcs.placed.slice(before).filter(([id]) => id === 'aldwin')).toEqual([]);
    // not found yet: the mill post is restored as before
    w.state.setFlag('story.m01.millerSafe', false);
    dir.markDirty();
    dir.update();
    expect(w.npcs.placed.slice(before)).toContainEqual(['aldwin', 'npc-post.aldwin']);
  });

  it('Tobb is not at the Grey Goose door until it is doused', () => {
    const tobb = CORRIDOR_LAYOUT.npcs.find((n) => n.id === 'tobb')!;
    expect(tobb.presentWhen).toBe('story.m01.tavernDoused');
    expect(OBJECTIVE_FLAGS).toContainEqual({ quest: 'm01', objective: 'tavern', flag: 'story.m01.tavernDoused' });
  });

  it('the third carter says the wagons are chained after the post falls, and only leaves once the carters are heard', () => {
    const w = makeWorld([m04]);
    const env = { state: w.state, quests: w.manager };
    const start = () => (npcCarter3.start as { when: Parameters<typeof evalCondition>[0]; node: string }[]).find((e) => evalCondition(e.when, env))!.node;
    w.manager.load({ quests: { m04: { state: 'active', objectives: { o1: 1, o2: 1, o3: 4, sergeant: 1, ledger: 1, shown: 1, o4: 1 } } } });
    expect(start()).toBe('chained');
    w.manager.completeObjective('m04', 'wagons');
    expect(start()).toBe('east');
    w.manager.completeObjective('m04', 'carters');
    expect(start()).toBe('leaving');
  });
});

describe('R01 field and M04 sergeant bridges', () => {
  function r01World() {
    const w = makeWorld([r01]);
    installBridges(w.bus, w.state, w.manager);
    w.manager.start('r01');
    w.manager.completeObjective('r01', 'o1');
    w.manager.completeObjective('r01', 'shawl');
    return w;
  }

  it('a legacy save (any torch flag, no counts) past the clears is scorched once the root is done', () => {
    const w = makeWorld([r01]);
    w.flags.set(TORCH_USED_FLAG, true);
    w.manager.load({ quests: { r01: { state: 'active', objectives: { o1: 1, shawl: 1, o2: 6 } } } });
    installBridges(w.bus, w.state, w.manager);
    w.manager.completeObjective('r01', 'o2');
    expect(w.flags.has(R01_SCORCHED)).toBe(false); // 0 of 8 counted: wait for the root
    w.manager.completeObjective('r01', 'root');
    expect(w.flags.get(R01_SCORCHED)).toBe(true);
  });

  it('decides once: clears after the decision change nothing, and the aftermath needs every flag of its branch', () => {
    const w = r01World();
    for (let i = 0; i < 8; i++) w.bus.emit('scarecrow.cleared', { method: 'surge', scarecrowId: `s${i}` });
    expect(w.flags.get(R01_SCORCHED)).toBe(false);
    w.bus.emit('scarecrow.cleared', { method: 'torch', scarecrowId: 'late' });
    expect(w.flags.get(R01_SCORCHED)).toBe(false);
    w.manager.completeObjective('r01', 'root');
    // a scorched-branch bucket does nothing on a saved field
    w.flags.set('story.r01.bucket1.delivered', true);
    w.bus.emit('flag.changed', { key: 'story.r01.bucket1.delivered' });
    expect(w.flags.has(R01_AFTERMATH)).toBe(false);
    for (const n of [1, 2]) { w.flags.set(`story.r01.stake.${n}`, true); w.bus.emit('flag.changed', { key: `story.r01.stake.${n}` }); }
    expect(w.flags.has(R01_AFTERMATH)).toBe(false);
    w.flags.set('story.r01.stake.3', true);
    w.bus.emit('flag.changed', { key: 'story.r01.stake.3' });
    expect(w.flags.get(R01_AFTERMATH)).toBe(true);
  });

  it('records the sergeant spared or killed, whichever comes first', () => {
    const w = makeWorld([m04]);
    installBridges(w.bus, w.state, w.manager);
    w.bus.emit('mercy', { verb: 'spare', creature: 'blighted-soldier', actorId: 's1' });
    expect(w.flags.has(M04_SERGEANT)).toBe(false);
    w.bus.emit('mercy', { verb: 'spare', creature: 'toll-sergeant', actorId: 'sg' });
    w.bus.emit('actor.died', { actorId: 'sg', kind: 'toll-sergeant' });
    expect(w.flags.get(M04_SERGEANT)).toBe('spared');
    const k = makeWorld([m04]);
    installBridges(k.bus, k.state, k.manager);
    k.bus.emit('actor.died', { actorId: 'sg', kind: 'toll-sergeant' });
    expect(k.flags.get(M04_SERGEANT)).toBe('killed');
  });
});

describe('looks', () => {
  const specs = lookSpecs(QUEST_PROPS, QUEST_NOTES, NOTE_LOOKS);
  const spec = (key: string) => specs.find((s) => s.key === key)!;

  it('shows props once their quest has begun, hides spent ones, and shows planted stakes only once used', () => {
    const w = makeWorld([m02, r01]);
    const rubble = spec('use:m02-rubble-1');
    expect(lookVisible(rubble, w.manager, w.state)).toBe(false);
    w.manager.start('m02');
    expect(lookVisible(rubble, w.manager, w.state)).toBe(true);
    w.flags.set('story.m02.rubble.1', true);
    expect(lookVisible(rubble, w.manager, w.state)).toBe(false);
    const stake = spec('use:r01-stake-1');
    w.manager.start('r01');
    expect(lookVisible(stake, w.manager, w.state)).toBe(false);
    w.flags.set('story.r01.stake.1', true);
    expect(lookVisible(stake, w.manager, w.state)).toBe(true);
    expect(lookVisible(spec('use:note-m03-wulfric'), w.manager, w.state)).toBe(true); // notes always show
  });

  it('builds each look once at its anchor, tolerates a failing build, and disposes them all', () => {
    const w = makeWorld();
    const built: string[] = [];
    const disposed: string[] = [];
    const warn = vi.fn();
    const looks = new QuestLooks(specs, {
      state: w.state, quests: w.manager, warn,
      anchor: (id) => (id === 'm02.order-board' ? undefined : { ...at, yaw: 0 }),
      build: (look, _p) => {
        if (look === 'grave') throw new Error('no grave');
        built.push(look);
        return { setVisible: () => {}, dispose: () => disposed.push(look) };
      },
    });
    looks.update();
    looks.update();
    expect(looks.builtKeys()).not.toContain('use:note-m02-order'); // no anchor yet
    expect(looks.builtKeys()).not.toContain('use:note-m03-wulfric'); // its build failed
    // one warning per failed build (every grave look fails here)
    expect(warn).toHaveBeenCalledTimes(Object.values(NOTE_LOOKS).filter((l) => l === 'grave').length);
    expect(built.length).toBe(looks.builtKeys().length);
    looks.dispose();
    expect(disposed.length).toBe(built.length);
  });
});

describe('bucket carries and prop conditions', () => {
  function carryWorld(defs: QuestDef[]) {
    const w = makeWorld(defs);
    const regs = new Map<string, { enabled?(): boolean; onInteract(): void }>();
    const carryables: Carryable[] = CARRY_ITEMS.map((c) => ({
      id: c.id, interactableId: c.interactableId, home: () => at, setPosition: () => {}, setVisible: () => {},
      deliveredFlag: c.deliveredFlag, questId: c.questId, objectiveId: c.objectiveId, destination: c.destination,
      ...(c.requiresFlag ? { requires: () => w.flags.get(c.requiresFlag!) === true } : {}),
    }));
    const carry = new CarrySystem({
      bus: w.bus,
      flags: { get: (k) => w.flags.get(k) === true, set: (k, v) => { w.flags.set(k, v); } },
      player: { id: () => 'p', feet: () => at, addMoveModifier: () => () => {} },
      interactables: { register: (i) => { regs.set(i.id, i); return () => regs.delete(i.id); } },
      objectiveCurrent: (q, o) => w.manager.isObjectiveCurrent(q, o),
      carryables,
      isActionHeld: () => false,
    });
    return { w, regs, carry };
  }

  it('R01 buckets are pickable only on a scorched field, during the aftermath', () => {
    const { w, regs, carry } = carryWorld([r01]);
    w.manager.start('r01');
    for (const o of ['o1', 'shawl', 'o2', 'root']) w.manager.completeObjective('r01', o);
    const b = regs.get('pickup:bucket-r01-1')!;
    expect(b.enabled!()).toBe(false);
    w.flags.set(R01_SCORCHED, true);
    expect(b.enabled!()).toBe(true);
    b.onInteract();
    expect(carry.carryingId).toBe('bucket-r01-1');
    w.bus.emit('trigger.enter', { triggerId: 'r01.stubble', actorId: 'p' });
    expect(w.flags.get('story.r01.bucket1.delivered')).toBe(true);
    expect(carry.carryingId).toBeNull();
  });

  it('M01 buckets wait for their objective to be current; a delivered bucket cannot be taken again', () => {
    const { w, regs } = carryWorld([m01]);
    const b = regs.get('pickup:bucket-m01-1')!;
    expect(b.enabled!()).toBe(false); // M01 not started
    w.manager.start('m01');
    expect(b.enabled!()).toBe(true); // non-sequential: every objective is current
    b.onInteract();
    w.bus.emit('trigger.enter', { triggerId: 'm01.tavern-door', actorId: 'p' });
    expect(b.enabled!()).toBe(false);
  });

  it('a prop with a condition stays shut while it fails, and with no condition env at all', () => {
    const w = makeWorld([r01]);
    const regs = new Map<string, { enabled(): boolean; onInteract(): void }>();
    const ports = {
      bus: w.bus, state: w.state, quests: w.manager, anchor: () => at,
      register: (i: { id: string; enabled(): boolean; onInteract(): void }) => { regs.set(i.id, i); return () => {}; },
    };
    new QuestProps(QUEST_PROPS, { ...ports, env: () => ({ state: w.state, quests: w.manager }) }).update();
    w.manager.start('r01');
    for (const o of ['o1', 'shawl', 'o2', 'root']) w.manager.completeObjective('r01', o);
    const props = new QuestProps(QUEST_PROPS, { ...ports, env: () => ({ state: w.state, quests: w.manager }) });
    props.update();
    const stake = regs.get('use:r01-stake-1')!;
    expect(stake.enabled()).toBe(true);
    w.flags.set(R01_SCORCHED, true);
    expect(stake.enabled()).toBe(false);
    stake.onInteract();
    expect(w.flags.has('story.r01.stake.1')).toBe(false);
    w.flags.set(R01_SCORCHED, false);
    const bare = new Map<string, { enabled(): boolean }>();
    new QuestProps(QUEST_PROPS, { ...ports, register: (i) => { bare.set(i.id, i); return () => {}; } }).update();
    expect(bare.get('use:r01-stake-1')!.enabled()).toBe(false);
  });
});

describe('quest fires (CrisisDressing)', () => {
  function dressing(flags: Record<string, boolean>, quests: Record<string, string>) {
    const scene = new THREE.Scene();
    const anchors = new Map(BRIGHTWATER_LAYOUT.anchors.map((a) => [a.id, a]));
    const dress = new CrisisDressing({
      scene,
      anchors: { find: (id) => { const a = anchors.get(id); return a && { position: { x: a.x, y: 0, z: a.z } }; } },
      questState: (q) => quests[q] ?? 'inactive',
      flag: (k) => flags[k] === true,
      quality: () => 'high',
    });
    const lit = (id: string) => scene.getObjectByName(`crisis-fire:${id}`)!.visible;
    return { dress, lit, flags, quests };
  }

  it('the Grey Goose door burns until its buckets douse it', () => {
    const t = dressing({ [FIRE_FLAG]: true }, { m01: 'active' });
    t.dress.update(0.1, { x: -17, y: 0, z: 135 });
    expect(t.lit('kettlewick.fire-tavern-door')).toBe(true);
    t.flags['story.m01.tavernDoused'] = true;
    t.dress.refresh();
    t.dress.update(0.1, { x: -17, y: 0, z: 135 });
    expect(t.lit('kettlewick.fire-tavern-door')).toBe(false);
  });

  it('the stubble fire burns only on a scorched field, until it is beaten out or R01 ends', () => {
    const t = dressing({}, { r01: 'active' });
    t.dress.update(0.1, { x: 30, y: 0, z: 38 });
    expect(t.lit('r01.fire-stubble')).toBe(false);
    t.flags['story.r01.scorched'] = true;
    t.dress.refresh();
    t.dress.update(0.1, { x: 30, y: 0, z: 38 });
    expect(t.lit('r01.fire-stubble')).toBe(true);
    t.flags['story.r01.stubbleOut'] = true;
    t.dress.refresh();
    t.dress.update(0.1, { x: 30, y: 0, z: 38 });
    expect(t.lit('r01.fire-stubble')).toBe(false);
    delete t.flags['story.r01.stubbleOut'];
    t.quests.r01 = 'completed';
    t.dress.refresh();
    t.dress.update(0.1, { x: 30, y: 0, z: 38 });
    expect(t.lit('r01.fire-stubble')).toBe(false);
  });
});

describe('density content tables', () => {
  it('every carry item, note and prop has a layout anchor, and every destination a trigger', () => {
    // the vault's anchors are its interior def's (defined at runtime)
    const anchors = new Set([...BRIGHTWATER_LAYOUT.anchors, ...VAULT_DEF.anchors].map((a) => a.id));
    const triggers = new Set(BRIGHTWATER_LAYOUT.triggers.map((t) => t.id));
    for (const c of CARRY_ITEMS) {
      expect(anchors.has(c.homeAnchor), c.homeAnchor).toBe(true);
      expect(triggers.has(c.destination), c.destination).toBe(true);
    }
    // Harrowmark's notes (batch 4) are checked in densityC.test.ts
    for (const n of QUEST_NOTES.filter((x) => !/note-(m08|m09|m10|d02)-/.test(x.interactableId))) expect(anchors.has(n.anchorId), n.anchorId).toBe(true);
    const brightwaterProps = QUEST_PROPS.filter((p) => ['m02', 'm03', 'm04', 'r01', 'd01'].includes(p.objective[0]));
    for (const p of brightwaterProps) expect(anchors.has(p.anchorId), p.anchorId).toBe(true);
  });

  it('a FakeBus and fake state need no other wiring for the bridges (smoke)', () => {
    const bus = new FakeBus();
    const { state } = fakeState();
    const w = makeWorld();
    const off = installBridges(bus, state, w.manager);
    expect(typeof off).toBe('function');
    off();
  });
});

describe('batch 2: the Dead Road and the vault', () => {
  const spawner = (id: string) => DENSITY_SPAWNERS_A.find((d) => d.id === id)!;

  it('a quest-level objective flag goes on when the quest starts, and catches up on active or completed saves only', () => {
    const w = makeWorld([d01]);
    const bridge = installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
    bridge.sync();
    expect(w.state.getFlag('story.d01.vaultOpen')).not.toBe(true);
    w.manager.start('d01');
    expect(w.state.getFlag('story.d01.vaultOpen')).toBe(true);
    bridge.dispose();
    const v = makeWorld([d01]);
    const b2 = installObjectiveFlags(OBJECTIVE_FLAGS, v.bus, v.state, v.manager);
    v.manager.load({ quests: { d01: { state: 'active', objectives: { o1: 1 } } } });
    b2.sync();
    expect(v.state.getFlag('story.d01.vaultOpen')).toBe(true);
    expect(v.state.getFlag('story.d01.antechamberClear')).not.toBe(true);
    b2.dispose();
  });

  it('locks the vault door on story.d01.vaultOpen and the arena gate on the antechamber, and gates the new groups', () => {
    expect(HARROWMARK_DOOR_LOCKS.vault).toBe('story.d01.vaultOpen');
    expect(HARROWMARK_FLAG_BLOCKERS['vault.arena.gate']).toBe('story.d01.antechamberClear');
    // gates that close once their own kill objective is done, so a save credited past them raises nobody
    expect(spawner('density.m05.shrine').activation).toEqual({ flag: 'story.m05.stonesStruck', until: 'story.m05.shrineHeld' });
    expect(spawner('density.d01.antechamber').activation).toEqual({ flag: 'story.d01.braziersLit', until: 'story.d01.antechamberClear' });
    expect(OBJECTIVE_FLAGS).toContainEqual({ quest: 'm05', objective: 'push', flag: 'story.m05.shrineHeld' });
    expect(spawner('density.deadroad.barrow')).toMatchObject({ activation: 'auto', respawn: 'never', count: 2 });
  });

  it('M05: the shrine push waits for the stones as an objective (so the journal first), and only its own wraiths count', () => {
    const w = makeWorld([m05]);
    const bridge = installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
    w.manager.start('m05');
    w.flags.set('world.deadroad.wardstones.done', true);
    w.bus.emit('wardstones.complete', {});
    expect(w.state.getFlag('story.m05.stonesStruck')).not.toBe(true); // the journal is still current
    w.bus.emit('dialogue.ended', { npcId: 'note-m05-journal', reason: 'completed' });
    expect(w.manager.objectiveDone('m05', 'o1')).toBe(true);
    expect(w.state.getFlag('story.m05.stonesStruck')).toBe(true);
    w.bus.emit('actor.died', { actorId: 'p1', killerId: 'p', kind: 'ash-wraith', spawnTag: 'brightwater.deadroad.patrol-1' });
    expect(w.manager.objectives('m05').find((o) => o.def.id === 'push')!.progress).toBe(0);
    for (let i = 0; i < 4; i++) w.bus.emit('actor.died', { actorId: `s${i}`, killerId: 'p', kind: 'ash-wraith', spawnTag: 'm05.shrine' });
    expect(w.manager.isObjectiveCurrent('m05', 'o2')).toBe(true);
    bridge.dispose();
  });

  it('old saves keep their place: past the stones credits the journal, past the shrine credits the push', () => {
    const a = makeWorld([m05]);
    a.manager.load({ quests: { m05: { state: 'active', objectives: { o1: 1 } } } }, 1);
    expect(a.manager.objectiveDone('m05', 'journal')).toBe(true);
    expect(a.manager.isObjectiveCurrent('m05', 'push')).toBe(true);
    const b = makeWorld([m05]);
    b.manager.load({ quests: { m05: { state: 'active', objectives: { o1: 1, o2: 1 } } } }, 1);
    expect(b.manager.isObjectiveCurrent('m05', 'o3')).toBe(true);
    const c = makeWorld([d01]);
    c.manager.load({ quests: { d01: { state: 'active', objectives: { o1: 1, o2: 1 } } } }, 1);
    for (const o of ['tablets', 'braziers', 'wake']) expect(c.manager.objectiveDone('d01', o), o).toBe(true);
    expect(c.manager.isObjectiveCurrent('d01', 'o3')).toBe(true);
  });

  it('an old save credited past a push or the walls syncs both gate flags, so those groups stay away', () => {
    const open = (flags: { getFlag(k: string): unknown }, act: { flag?: string; until?: string }) =>
      flags.getFlag(act.flag!) === true && flags.getFlag(act.until!) !== true;
    const a = makeWorld([m05]);
    const ba = installObjectiveFlags(OBJECTIVE_FLAGS, a.bus, a.state, a.manager);
    a.manager.load({ quests: { m05: { state: 'active', objectives: { o1: 1, o2: 1 } } } }, 1);
    ba.sync();
    expect(open(a.state, spawner('density.m05.shrine').activation as { flag: string; until: string })).toBe(false);
    ba.dispose();
    const b = makeWorld([d01]);
    const bb = installObjectiveFlags(OBJECTIVE_FLAGS, b.bus, b.state, b.manager);
    b.manager.load({ quests: { d01: { state: 'active', objectives: { o1: 1, o2: 1, o3: 1 } } } }, 1);
    bb.sync();
    expect(open(b.state, spawner('density.d01.antechamber').activation as { flag: string; until: string })).toBe(false);
    // a live run in between: the walls are open after the braziers and shut again when the wake is done
    const c = makeWorld([d01]);
    const bc = installObjectiveFlags(OBJECTIVE_FLAGS, c.bus, c.state, c.manager);
    c.manager.start('d01');
    for (const o of ['o1', 'tablets', 'braziers']) c.manager.completeObjective('d01', o);
    expect(open(c.state, spawner('density.d01.antechamber').activation as { flag: string; until: string })).toBe(true);
    c.manager.completeObjective('d01', 'wake');
    expect(open(c.state, spawner('density.d01.antechamber').activation as { flag: string; until: string })).toBe(false);
    bb.dispose();
    bc.dispose();
  });

  it('D01: the braziers are props enabled only while their objective is current, each counted once', () => {
    const braziers = QUEST_PROPS.filter((p) => p.objective[0] === 'd01' && p.objective[1] === 'braziers');
    expect(braziers.map((p) => p.interactableId)).toEqual(D01_BRAZIERS);
    expect(new Set(braziers.map((p) => p.usedFlag)).size).toBe(3);
    expect(QUEST_NOTES.map((n) => n.interactableId)).toEqual(expect.arrayContaining(D01_TABLETS.map((t) => `use:${t}`)));
  });
});
