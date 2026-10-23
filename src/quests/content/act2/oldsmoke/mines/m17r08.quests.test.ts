// M17 and R08 through a real QuestManager over the shared fakes: the order of the objectives, what each event credits, the
// lift flag, the swarm and carry objectives, the bell order at the prop, the rewards and the save round trip.
import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../../testKit';
import type { QuestDef } from '../../../../types';
import { validateQuest } from '../../../../validate';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { QuestProps } from '../../../../props';
import { M17R08 } from './m17r08.content';
import { LIFT_RESTORED_FLAG, M17_FLOOR_TRIGGER, M17_HEAD_TRIGGER, M17_LIFT_TRIGGER, M17_MINERS, M17_NOTES, M17_PARTS, M17_SWARM_FLAG, M17_VENTS, M17_WINCH, m17 } from './m17.quest';
import { R08_BELL_FLAG, R08_LAID_FLAG, R08_LETTER, R08_RELICS, R08_TASKS, r08 } from './r08.quest';

type W = ReturnType<typeof makeWorld>;
const talk = (w: W, npcId: string, reason?: string) => w.bus.emit('dialogue.ended', { npcId, reason });
const interact = (w: W, interactableId: string) => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action: 'interact' });
const done = (w: W, q: string, o: string) => w.manager.objectiveDone(q, o);
const current = (w: W, q: string): string | undefined => w.manager.objectives(q).find((o) => o.current)?.def.id;
const progress = (w: W, q: string, o: string): number => w.manager.objectives(q).find((x) => x.def.id === o)!.progress;
const killOf = (w: W, kind: string, tag: string, id: string) => w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind, spawnTag: tag });
const reads = (w: W, ids: readonly string[]) => { for (const id of ids) talk(w, id, 'completed'); };
const delivered = (w: W, id: string, destinationId = M17_LIFT_TRIGGER) => w.bus.emit('carry.delivered', { carryId: id, destinationId });
const stub = (id: string): QuestDef => ({ id, titleKey: `t.${id}`, summaryKey: `s.${id}`, objectives: [{ id: 'o', type: 'talk', target: `${id}-npc`, textKey: `o.${id}` }] });
const finish = (w: W, id: string) => { expect(w.manager.start(id)).toBe(true); talk(w, `${id}-npc`); expect(w.manager.state(id)).toBe('completed'); };
const begin = (w: W, id: string) => { expect(w.manager.start(id), `${id} starts`).toBe(true); };
const rewardItems = (w: W) => w.bus.of('loot.granted').flatMap((p: any) => p.items.map((i: any) => i.itemId));
const enter = (w: W, triggerId: string) => w.bus.emit('trigger.enter', { triggerId, actorId: 'p' });

describe('content shape', () => {
  it('both quests validate against the string table', () => {
    const has = (k: string) => k in M17R08.strings;
    for (const q of M17R08.quests) expect(validateQuest(q, has), q.id).toEqual([]);
  });

  it('exports m17 and r08 under those ids and every objective has text', () => {
    expect(M17R08.quests.map((q) => q.id)).toEqual(['m17', 'r08']);
    for (const q of M17R08.quests) for (const o of q.objectives) expect(M17R08.strings[o.textKey], `${q.id}.${o.id}`).toBeTruthy();
  });

  it('M17 follows M16 (not R10) and R08 follows M17', () => {
    expect(m17.startWhen).toEqual({ quest: 'm16', state: 'completed' });
    expect(r08.startWhen).toEqual({ quest: 'm17', state: 'completed' });
  });

  it('every prop objective, carry objective, trigger, spawner flag and flag row points at a real objective', () => {
    const objs = new Map(M17R08.quests.map((q) => [q.id, new Set(q.objectives.map((o) => o.id))]));
    for (const p of M17R08.props) expect(objs.get(p.objective[0])!.has(p.objective[1]), p.interactableId).toBe(true);
    for (const c of M17R08.carry) expect(objs.get(c.questId)!.has(c.objectiveId), c.id).toBe(true);
    const trg = new Set(M17R08.triggers.map((t) => t.id));
    for (const c of M17R08.carry) expect(trg.has(c.destination), c.id).toBe(true);
    for (const o of m17.objectives.filter((x) => x.type === 'goTo')) expect(trg.has(o.target as string), o.id).toBe(true);
    for (const f of M17R08.flags) if (f.objective) expect(objs.get(f.quest)!.has(f.objective), f.flag).toBe(true);
    for (const s of M17R08.spawners) expect(['m17', 'r08']).toContain((s.activation as { quest: string }).quest);
  });

  it('the swarm wakes on the first vent\'s own flag and the wraiths on the bell\'s', () => {
    expect(M17R08.props.find((p) => p.interactableId === M17_VENTS[0])!.usedFlag).toBe(M17_SWARM_FLAG);
    expect(M17R08.spawners.find((s) => s.tag === 'm17.drop')!.activation).toEqual({ quest: 'm17', flag: M17_SWARM_FLAG });
    expect(M17R08.props.find((p) => p.interactableId === 'use:r08-bell')!.usedFlag).toBe(R08_BELL_FLAG);
    expect(M17R08.spawners.find((s) => s.tag === 'r08.shift')!.activation).toEqual({ quest: 'r08', flag: R08_BELL_FLAG });
  });

  it('the swarm is twelve crawlers on twelve ceiling anchors, the shift five wraiths; neither respawns', () => {
    const drop = M17R08.spawners.find((s) => s.tag === 'm17.drop')!;
    expect(drop.count).toBe(12);
    expect(drop.memberAnchors).toHaveLength(12);
    expect(new Set(drop.memberAnchors).size).toBe(12);
    expect(M17R08.spawners.find((s) => s.tag === 'r08.shift')!.count).toBe(5);
    for (const s of M17R08.spawners) expect(s.respawn).toBe('never');
  });

  it('props, notes and carry items have distinct ids and the notes cover every reads objective', () => {
    const ids = [...M17R08.props.map((p) => p.interactableId), ...M17R08.carry.map((c) => c.interactableId)];
    expect(new Set(ids).size).toBe(ids.length);
    const noteIds = M17R08.notes.map((n) => n.id);
    expect(new Set(noteIds).size).toBe(noteIds.length);
    for (const id of [...M17_NOTES, ...R08_RELICS, R08_LETTER]) expect(noteIds).toContain(id);
    expect(M17R08.notes.find((n) => n.id === R08_LETTER)!.lines).toHaveLength(6);
    for (const n of M17R08.notes) if (n.codexId) expect(M17R08.strings[`codex.${n.codexId}.name`], n.id).toBeTruthy();
  });

  it('no note shares an anchor with a prop or another note, so both stay usable', () => {
    const anchors = [...M17R08.props.map((p) => p.anchorId), ...M17R08.notes.map((n) => n.anchorId)];
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('reward items are registered with strings, and no string carries a dash or the literal name', () => {
    for (const i of M17R08.items) { expect(M17R08.itemStrings[i.nameKey]).toBeTruthy(); expect(M17R08.itemStrings[i.descKey]).toBeTruthy(); }
    for (const [k, v] of Object.entries({ ...M17R08.strings, ...M17R08.itemStrings })) {
      expect(v, k).not.toMatch(/[‒-―]| - /);
      expect(v, k).not.toMatch(/Cael/);
    }
    for (const n of M17R08.notes) for (const l of n.lines) expect(l).not.toMatch(/[‒-―]| - |Cael/);
  });
});

describe('M17 Down the Oldsmoke Shaft', () => {
  function world(): W {
    const w = makeWorld([stub('m16'), m17]);
    finish(w, 'm16');
    return w;
  }
  const toWinch = (w: W) => {
    talk(w, 'slagg');
    talk(w, 'winch-wright');
    for (const p of M17_PARTS) interact(w, p);
    reads(w, M17_NOTES);
  };
  const toVents = (w: W) => { toWinch(w); interact(w, M17_WINCH); enter(w, M17_FLOOR_TRIGGER); };
  const toMiners = (w: W) => {
    toVents(w);
    interact(w, M17_VENTS[0]);
    for (let i = 0; i < 12; i++) killOf(w, 'slag-crawler', 'm17.drop', `c${i}`);
    for (const v of M17_VENTS.slice(1)) interact(w, v);
  };
  const toThanks = (w: W) => {
    toMiners(w);
    delivered(w, 'm17-miner-1');
    delivered(w, 'm17-miner-2');
    enter(w, M17_HEAD_TRIGGER);
  };

  it('is refused until M16 is done', () => {
    const w = makeWorld([stub('m16'), m17]);
    expect(w.manager.start('m17')).toBe(false);
    finish(w, 'm16');
    expect(w.manager.start('m17')).toBe(true);
  });

  it('plays through to the report, paying 500 XP and the helm once', () => {
    const w = world();
    begin(w, 'm17');
    toThanks(w);
    expect(current(w, 'm17')).toBe('thanks');
    reads(w, M17_MINERS);
    expect(w.manager.state('m17')).toBe('active');
    talk(w, 'slagg');
    expect(w.manager.state('m17')).toBe('completed');
    expect(w.calls.filter((c) => c === 'xp:500:quest:m17')).toHaveLength(1);
    expect(rewardItems(w).filter((i) => i === 'miners-helm')).toHaveLength(1);
  });

  it('credits the steps in order: the winch before its parts, the ride before the winch, the vents before the ride do nothing', () => {
    const w = world();
    begin(w, 'm17');
    talk(w, 'winch-wright'); // before Slagg
    expect(current(w, 'm17')).toBe('brief');
    talk(w, 'slagg');
    interact(w, M17_WINCH); // before the wright and the parts
    interact(w, M17_PARTS[0]);
    enter(w, M17_FLOOR_TRIGGER);
    expect(current(w, 'm17')).toBe('wright');
    talk(w, 'winch-wright');
    interact(w, M17_WINCH);
    expect(done(w, 'm17', 'winch')).toBe(false);
    for (const p of M17_PARTS) interact(w, p);
    interact(w, M17_VENTS[0]);
    expect(current(w, 'm17')).toBe('search');
    expect(w.flags.get(LIFT_RESTORED_FLAG)).toBeUndefined();
  });

  it('counts each part and each note once', () => {
    const w = world();
    begin(w, 'm17');
    talk(w, 'slagg');
    talk(w, 'winch-wright');
    interact(w, M17_PARTS[0]);
    interact(w, M17_PARTS[0]);
    interact(w, 'use:m17-part-9');
    expect(progress(w, 'm17', 'parts')).toBe(1);
    interact(w, M17_PARTS[1]);
    interact(w, M17_PARTS[2]);
    expect(done(w, 'm17', 'parts')).toBe(true);
    talk(w, M17_NOTES[0], 'completed');
    talk(w, M17_NOTES[0], 'completed');
    talk(w, M17_NOTES[1], 'skip'); // an abandoned read is not a read
    expect(progress(w, 'm17', 'search')).toBe(1);
    talk(w, M17_NOTES[1], 'completed');
    expect(current(w, 'm17')).toBe('winch');
  });

  it('writes the lift flag once, when the winch objective completes, and not for a quest never reaching it', () => {
    const w = makeWorld([stub('m16'), m17]);
    const flags = installObjectiveFlags(M17R08.flags, w.bus, w.state, w.manager);
    finish(w, 'm16');
    begin(w, 'm17');
    expect(w.flags.get('story.m17.started')).toBe(true);
    expect(w.flags.get(LIFT_RESTORED_FLAG)).toBeUndefined();
    toWinch(w);
    expect(w.flags.get(LIFT_RESTORED_FLAG)).toBeUndefined();
    let writes = 0;
    const orig = w.state.setFlag;
    w.state.setFlag = (k, v) => { if (k === LIFT_RESTORED_FLAG) writes++; orig(k, v); };
    interact(w, M17_WINCH);
    expect(w.flags.get(LIFT_RESTORED_FLAG)).toBe(true);
    interact(w, M17_WINCH);
    flags.sync();
    talk(w, 'slagg');
    expect(writes).toBe(1);
    flags.dispose();
  });

  it('a spurious flag sync before the winch does not set the lift flag', () => {
    const w = makeWorld([stub('m16'), m17]);
    const flags = installObjectiveFlags(M17R08.flags, w.bus, w.state, w.manager);
    finish(w, 'm16');
    begin(w, 'm17');
    toWinch(w);
    flags.sync();
    expect(w.flags.get(LIFT_RESTORED_FLAG)).toBeUndefined();
  });

  it('the first vent is its own step and the swarm counts only twelve crawlers of its tag, each once', () => {
    const w = world();
    begin(w, 'm17');
    toVents(w);
    expect(current(w, 'm17')).toBe('vent1');
    interact(w, M17_VENTS[1]); // a later vent first earns nothing
    expect(current(w, 'm17')).toBe('vent1');
    interact(w, M17_VENTS[0]);
    expect(current(w, 'm17')).toBe('swarm');
    killOf(w, 'slag-crawler', 'other', 'x');
    killOf(w, 'ember-hound', 'm17.drop', 'y');
    for (let i = 0; i < 11; i++) killOf(w, 'slag-crawler', 'm17.drop', `c${i}`);
    killOf(w, 'slag-crawler', 'm17.drop', 'c0'); // the same crawler twice
    expect(progress(w, 'm17', 'swarm')).toBe(11);
    expect(done(w, 'm17', 'swarm')).toBe(false);
    killOf(w, 'slag-crawler', 'm17.drop', 'c11');
    expect(done(w, 'm17', 'swarm')).toBe(true);
    expect(current(w, 'm17')).toBe('vents');
  });

  it('needs all three remaining vents, each once', () => {
    const w = world();
    begin(w, 'm17');
    toVents(w);
    interact(w, M17_VENTS[0]);
    for (let i = 0; i < 12; i++) killOf(w, 'slag-crawler', 'm17.drop', `c${i}`);
    interact(w, M17_VENTS[1]);
    interact(w, M17_VENTS[1]);
    interact(w, M17_VENTS[0]); // the first again is not one of the three
    expect(progress(w, 'm17', 'vents')).toBe(1);
    interact(w, M17_VENTS[2]);
    expect(done(w, 'm17', 'vents')).toBe(false);
    interact(w, M17_VENTS[3]);
    expect(done(w, 'm17', 'vents')).toBe(true);
    expect(current(w, 'm17')).toBe('miners');
  });

  it('carries both miners: each counts once, a wrong destination counts for nothing', () => {
    const w = world();
    begin(w, 'm17');
    toMiners(w);
    delivered(w, 'm17-miner-1', 'trg.elsewhere');
    expect(progress(w, 'm17', 'miners')).toBe(0);
    delivered(w, 'm17-miner-1');
    delivered(w, 'm17-miner-1');
    expect(progress(w, 'm17', 'miners')).toBe(1);
    expect(current(w, 'm17')).toBe('miners');
    delivered(w, 'm17-miner-2');
    expect(done(w, 'm17', 'miners')).toBe(true);
    expect(current(w, 'm17')).toBe('up');
  });

  it('the ride up counts on the lift top, and the thanks need both miners to finish a read', () => {
    const w = world();
    begin(w, 'm17');
    toMiners(w);
    enter(w, M17_HEAD_TRIGGER); // before the miners are carried
    expect(current(w, 'm17')).toBe('miners');
    delivered(w, 'm17-miner-1');
    delivered(w, 'm17-miner-2');
    enter(w, M17_HEAD_TRIGGER);
    talk(w, 'miner-hale', 'completed');
    talk(w, 'miner-hale', 'completed');
    talk(w, 'miner-brig', 'skip');
    expect(done(w, 'm17', 'thanks')).toBe(false);
    talk(w, 'miner-brig', 'completed');
    expect(current(w, 'm17')).toBe('report');
  });

  it('keeps its progress across a save, mid-swarm and mid-carry', () => {
    const w = world();
    begin(w, 'm17');
    toVents(w);
    interact(w, M17_VENTS[0]);
    for (let i = 0; i < 5; i++) killOf(w, 'slag-crawler', 'm17.drop', `c${i}`);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m16'), m17]);
    w2.manager.load(data);
    expect(current(w2, 'm17')).toBe('swarm');
    expect(progress(w2, 'm17', 'swarm')).toBe(5);
    killOf(w2, 'slag-crawler', 'm17.drop', 'c0'); // already counted before the save: still once
    expect(progress(w2, 'm17', 'swarm')).toBe(5);
    for (let i = 5; i < 12; i++) killOf(w2, 'slag-crawler', 'm17.drop', `c${i}`);
    for (const v of M17_VENTS.slice(1)) interact(w2, v);
    delivered(w2, 'm17-miner-1');
    const data2 = JSON.parse(JSON.stringify(w2.manager.serialize()));
    const w3 = makeWorld([stub('m16'), m17]);
    w3.manager.load(data2);
    expect(progress(w3, 'm17', 'miners')).toBe(1);
    delivered(w3, 'm17-miner-1');
    expect(progress(w3, 'm17', 'miners')).toBe(1);
    delivered(w3, 'm17-miner-2');
    expect(current(w3, 'm17')).toBe('up');
  });

  it('a saved lift flag survives: a world loaded after the winch still has it, and the objective flags catch up on load', () => {
    const w = makeWorld([stub('m16'), m17]);
    finish(w, 'm16');
    begin(w, 'm17');
    toWinch(w);
    interact(w, M17_WINCH);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m16'), m17]); // an older save: the quest is past the winch but the flag was never written
    w2.manager.load(data);
    const flags = installObjectiveFlags(M17R08.flags, w2.bus, w2.state, w2.manager);
    flags.sync();
    expect(w2.flags.get(LIFT_RESTORED_FLAG)).toBe(true);
    flags.dispose();
  });
});

describe('R08 Pickett\'s Last Shift', () => {
  function world(): W {
    const w = makeWorld([stub('m17'), r08]);
    finish(w, 'm17');
    return w;
  }
  const toTasks = (w: W) => { talk(w, 'pickett'); reads(w, R08_RELICS); };
  const toWraiths = (w: W) => { toTasks(w); for (const t of R08_TASKS) interact(w, t); };
  const toLetter = (w: W) => {
    toWraiths(w);
    for (let i = 0; i < 5; i++) killOf(w, 'ash-wraith', 'r08.shift', `w${i}`);
    talk(w, 'shift-crew');
  };

  it('is refused until M17 is done', () => {
    const w = makeWorld([stub('m17'), r08]);
    expect(w.manager.start('r08')).toBe(false);
  });

  it('plays through to the rest, paying 400 XP and the lantern once and writing the laid flag', () => {
    const w = makeWorld([stub('m17'), r08]);
    const flags = installObjectiveFlags(M17R08.flags, w.bus, w.state, w.manager);
    finish(w, 'm17');
    begin(w, 'r08');
    toLetter(w);
    expect(current(w, 'r08')).toBe('letter');
    expect(w.flags.get(R08_LAID_FLAG)).toBeUndefined();
    talk(w, R08_LETTER, 'completed');
    talk(w, 'pickett');
    expect(w.manager.state('r08')).toBe('completed');
    expect(w.flags.get('story.r08.started')).toBe(true);
    expect(w.flags.get(R08_LAID_FLAG)).toBe(true);
    expect(w.calls.filter((c) => c === 'xp:400:quest:r08')).toHaveLength(1);
    expect(rewardItems(w).filter((i) => i === 'picketts-lantern')).toHaveLength(1);
    flags.dispose();
  });

  it('has no choice and no favour: nothing in the quest touches the tracks', () => {
    const w = world();
    begin(w, 'r08');
    toLetter(w);
    talk(w, R08_LETTER, 'completed');
    talk(w, 'pickett');
    expect(w.favour).toEqual({});
    expect(JSON.stringify(r08.rewards)).not.toContain('favour');
  });

  it('the six relics count once each, and the steps before them earn nothing', () => {
    const w = world();
    begin(w, 'r08');
    reads(w, R08_RELICS); // before Pickett
    expect(current(w, 'r08')).toBe('brief');
    talk(w, 'pickett');
    reads(w, R08_RELICS.slice(0, 3));
    reads(w, R08_RELICS.slice(0, 3));
    talk(w, R08_RELICS[3], 'skip');
    expect(progress(w, 'r08', 'relics')).toBe(3);
    reads(w, R08_RELICS.slice(3));
    expect(current(w, 'r08')).toBe('tasks');
  });

  it('counts the four tasks once each', () => {
    const w = world();
    begin(w, 'r08');
    toTasks(w);
    interact(w, R08_TASKS[0]);
    interact(w, R08_TASKS[0]);
    expect(progress(w, 'r08', 'tasks')).toBe(1);
    for (const t of R08_TASKS.slice(1)) interact(w, t);
    expect(current(w, 'r08')).toBe('wraiths');
  });

  it('counts only ash wraiths of the shift tag, each once, five of them', () => {
    const w = world();
    begin(w, 'r08');
    toWraiths(w);
    killOf(w, 'ash-wraith', 'wild', 'x');
    killOf(w, 'slag-crawler', 'r08.shift', 'y');
    for (let i = 0; i < 4; i++) killOf(w, 'ash-wraith', 'r08.shift', `w${i}`);
    killOf(w, 'ash-wraith', 'r08.shift', 'w0');
    expect(progress(w, 'r08', 'wraiths')).toBe(4);
    killOf(w, 'ash-wraith', 'r08.shift', 'w4');
    expect(current(w, 'r08')).toBe('crew');
  });

  it('the letter must be read to its end and Pickett\'s rest waits for it', () => {
    const w = world();
    begin(w, 'r08');
    toLetter(w);
    talk(w, 'pickett');
    expect(w.manager.state('r08')).toBe('active');
    talk(w, R08_LETTER, 'skip');
    expect(done(w, 'r08', 'letter')).toBe(false);
    talk(w, R08_LETTER, 'completed');
    expect(current(w, 'r08')).toBe('report');
  });

  it('keeps its progress across a save, mid-tasks and mid-shift', () => {
    const w = world();
    begin(w, 'r08');
    toTasks(w);
    interact(w, R08_TASKS[0]);
    interact(w, R08_TASKS[1]);
    const data = JSON.parse(JSON.stringify(w.manager.serialize()));
    const w2 = makeWorld([stub('m17'), r08]);
    w2.manager.load(data);
    expect(current(w2, 'r08')).toBe('tasks');
    interact(w2, R08_TASKS[1]);
    expect(progress(w2, 'r08', 'tasks')).toBe(2);
    interact(w2, R08_TASKS[2]);
    interact(w2, R08_TASKS[3]);
    expect(current(w2, 'r08')).toBe('wraiths');
    for (let i = 0; i < 3; i++) killOf(w2, 'ash-wraith', 'r08.shift', `w${i}`);
    const w3 = makeWorld([stub('m17'), r08]);
    w3.manager.load(JSON.parse(JSON.stringify(w2.manager.serialize())));
    expect(progress(w3, 'r08', 'wraiths')).toBe(3);
    killOf(w3, 'ash-wraith', 'r08.shift', 'w0');
    expect(progress(w3, 'r08', 'wraiths')).toBe(3);
  });
});

/** QuestProps over the quest manager: which prop answers when, and what its use writes. */
describe('M17 and R08 props through QuestProps', () => {
  function harness(w: W) {
    const regs = new Map<string, { enabled(): boolean; onInteract(): void }>();
    const props = new QuestProps(M17R08.props, {
      bus: w.bus, state: w.state, quests: w.manager as any,
      env: () => ({ state: w.state, quests: w.manager } as any),
      anchor: () => ({ x: 0, y: 0, z: 0 }),
      register: (i) => { regs.set(i.id, i); return () => { regs.delete(i.id); }; },
    });
    props.update();
    const use = (id: string) => {
      const r = regs.get(id)!;
      if (r.enabled()) { r.onInteract(); interact(w, id); }
      return r.enabled();
    };
    return { regs, props, use };
  }

  it('the bell is dead until pump, cart and prop are done, in any order, and tolls the shift once', () => {
    const w = makeWorld([stub('m17'), r08]);
    finish(w, 'm17');
    begin(w, 'r08');
    const h = harness(w);
    talk(w, 'pickett');
    reads(w, R08_RELICS);
    h.use('use:r08-bell');
    expect(w.flags.get(R08_BELL_FLAG)).toBeUndefined();
    expect(progress(w, 'r08', 'tasks')).toBe(0);
    h.use('use:r08-prop');
    h.use('use:r08-pump');
    h.use('use:r08-bell');
    expect(w.flags.get(R08_BELL_FLAG)).toBeUndefined();
    h.use('use:r08-cart');
    expect(h.regs.get('use:r08-bell')!.enabled()).toBe(true);
    h.use('use:r08-bell');
    expect(w.flags.get(R08_BELL_FLAG)).toBe(true);
    expect(done(w, 'r08', 'tasks')).toBe(true);
    // a spent prop is off, so it cannot be counted or rung again
    expect(h.regs.get('use:r08-bell')!.enabled()).toBe(false);
    expect(h.regs.get('use:r08-pump')!.enabled()).toBe(false);
  });

  it('M17 props answer only on their own objective: the first vent wakes the swarm, a later one cannot', () => {
    const w = makeWorld([stub('m16'), m17]);
    finish(w, 'm16');
    begin(w, 'm17');
    const h = harness(w);
    talk(w, 'slagg');
    talk(w, 'winch-wright');
    expect(h.regs.get(M17_WINCH)!.enabled()).toBe(false);
    expect(h.regs.get(M17_PARTS[0])!.enabled()).toBe(true);
    for (const p of M17_PARTS) h.use(p);
    reads(w, M17_NOTES);
    expect(h.regs.get(M17_WINCH)!.enabled()).toBe(true);
    h.use(M17_WINCH);
    enter(w, M17_FLOOR_TRIGGER);
    expect(h.regs.get(M17_VENTS[1])!.enabled()).toBe(false);
    expect(w.flags.get(M17_SWARM_FLAG)).toBeUndefined();
    h.use(M17_VENTS[0]);
    expect(w.flags.get(M17_SWARM_FLAG)).toBe(true);
    expect(h.regs.get(M17_VENTS[0])!.enabled()).toBe(false);
  });
});

describe('carry specs', () => {
  it('two miners, each delivered to the lift trigger, with the quest objective and a delivered flag of their own', () => {
    expect(M17R08.carry.map((c) => c.id)).toEqual(['m17-miner-1', 'm17-miner-2']);
    for (const c of M17R08.carry) {
      expect(c.destination).toBe(M17_LIFT_TRIGGER);
      expect(c.questId).toBe('m17');
      expect(c.deliveredFlag).toMatch(/^story\.m17\.miner[12]\.delivered$/);
    }
  });
});
