// R10's optional duels against the real pieces they join: A5's trial service on a real damage resolver, the real
// dialogue runner and effect runner on the real flag store, and a copy of A13's three round trees (A13's branch is not
// merged, so the fixture below rebuilds its rounds exactly as `roundChoices` / `roundSegments` build them at 6ab7e35).
import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../../../actors/ActorRegistry';
import { DamageResolver } from '../../../../actors/DamageResolver';
import { playerInit } from '../../../../actors/teams';
import { GameEvents, type GameEventMap } from '../../../../core/events';
import { TRIAL_TUNING, Trials } from '../../../../companions/trials';
import { DialogueRunner } from '../../../../dialogue/DialogueRunner';
import { buildTree, type ChoiceSpec, type Line } from '../../../../dialogue/content/act2/build';
import { all, flagIs, not, objDone, objOpen, qActive } from '../../../../dialogue/content/act2/cond';
import { dialogueDefs } from '../../../../dialogue/content';
import { dialogueStrings } from '../../../../dialogue/strings.en';
import { validateDialogue } from '../../../../dialogue/validate';
import { AnchorRegistry } from '../../../../layout/AnchorRegistry';
import { WorldState } from '../../../../state/WorldState';
import { createEffectRunner } from '../../../effects';
import type { BusPort } from '../../../ports';
import type { QuestState } from '../../../types';
import { R10_DUEL_CHOICE_ID, R10_PERSUADED_EVENT, R10_TARGETS, r10RoundFlag, type R10Round } from './flags';
import { withR10Duels } from './r10Duels.dialogue';
import { R10Duels, R10_DUEL_ANCHOR, R10_DUEL_SPAWNER, R10_DUEL_SPAWNERS } from './r10Duels';

const DT = 1 / 60;

// ---- A13's round trees (fixture: src/dialogue/content/act2/oldsmoke/stewards.dialogue.ts at 6ab7e35) ----

const compromise = flagIs('story.r10.branch', 'compromise');
function roundChoices(n: R10Round): ChoiceSpec[] {
  const won = [{ setFlag: `story.r10.p.${n}`, value: true }, { event: 'story.r10.persuaded', payload: { n: String(n) } }] as ChoiceSpec['fx'];
  return [
    { id: 'evidence', t: 'Put the ledgers on the table.', go: `r10-round-${n}-won`, when: objDone('r10', 'read'), fx: won },
    { id: 'standing', t: 'Remind them whose Writ is in your satchel.', go: `r10-round-${n}-won`, when: { favour: 'grisel', atLeast: 10 }, fx: won },
    { id: 'bluff', t: 'Tell them the Council will order it settled.', go: `r10-round-${n}-hint` },
  ];
}
const roundStart = (n: R10Round) => all(qActive('r10'), compromise, objOpen('r10', 'talks'), not(flagIs(`story.r10.p.${n}`)));
function a13Tree(n: R10Round) {
  const { npcId, dialogueId } = R10_TARGETS[n];
  const S = (t: string): Line => ({ s: npcId, t });
  return buildTree({
    id: dialogueId,
    start: [{ when: roundStart(n), seg: `r10-round-${n}` }, { when: all(), seg: 'idle' }],
    segments: {
      [`r10-round-${n}`]: { lines: [S('Opener one.'), S('Opener two.'), S('I will not pretend I am easy to move.'), { s: npcId, t: 'Say your piece.', choices: roundChoices(n) }] },
      [`r10-round-${n}-won`]: { lines: [S('...All right.'), S('Tell the foreman I will sit.')] },
      [`r10-round-${n}-hint`]: { lines: [S('A bluff is a bluff.')] },
      idle: { lines: [S('Idle.')] },
    },
  });
}
const A13 = ([1, 2, 3] as const).map(a13Tree);
const A13_STRINGS: Record<string, string> = Object.assign({}, ...A13.map((t) => t.strings));

// ---- the rig ----

function rig(opts: { branch?: string; readDone?: boolean } = {}) {
  const events = new GameEvents(() => {});
  const state = new WorldState(events, () => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const feet = { x: 10, y: 2, z: 20 };
  const trials = new Trials({
    events,
    actors,
    addLethalHandler: (id, fn, order) => dr.addLethalHandler(id, fn, order),
    heal: (id, n) => dr.heal(id, n),
    playerFeet: () => feet,
  });
  const anchors = new AnchorRegistry();

  // R10 as A13's quest def runs it: `talks` counts `story.r10.persuaded` deduped by `n`, three to finish.
  const quest = new Map<string, QuestState>([['r10', 'active']]);
  const counted = new Set<string>();
  const persuaded: string[] = [];
  events.onAny((type, payload) => {
    if ((type as string) !== R10_PERSUADED_EVENT) return;
    const n = String((payload as { n: string }).n);
    persuaded.push(n);
    counted.add(n);
  });
  const done = (q: string, o: string): boolean =>
    q === 'r10' && ((o === 'talks' && counted.size >= 3) || (o === 'read' && opts.readDone !== false));
  const quests = {
    state: (id: string) => quest.get(id) ?? 'inactive',
    objectiveDone: done,
    start: () => false, complete: () => false, completeObjective: () => false,
  };
  state.setFlag('story.r10.branch', opts.branch ?? 'compromise');

  // The enemies service: the yard veteran as a real actor in the registry, so the trial scores real staggers.
  const alive = new Map<string, string>();
  const spawned: string[] = [];
  const enemies = {
    spawnGroup: (id: string): string[] => {
      if (alive.has(id)) return [];
      const at = anchors.find(R10_DUEL_SPAWNERS[0].anchor);
      if (!at) return [];
      const a = actors.spawn({ kind: 'yard-veteran', team: 'hostile', maxHealth: 70, maxPoise: 40 });
      alive.set(id, a.id);
      spawned.push(a.id);
      return [a.id];
    },
    despawnGroup: (id: string) => {
      const a = alive.get(id);
      if (!a) return;
      alive.delete(id);
      actors.despawn(a);
    },
  };

  // The dialogue: the real runner and effects, A13's trees passed through the hook as the dialogue plugin does.
  const patch = withR10Duels(A13.map((t) => t.def));
  const strings = { ...A13_STRINGS, ...patch.strings };
  const bus = events as unknown as BusPort;
  const effects = createEffectRunner({ state, quests, bus, sourceId: 'dialogue', warn: () => {} });
  const runner = new DialogueRunner({ bus, state, quests, effects, strings: { t: (k) => strings[k] ?? k, has: (k) => k in strings } });
  for (const def of patch.defs) runner.register(def);

  const warns: string[] = [];
  let svcTrials: Trials | undefined = trials;
  const duels = new R10Duels({
    events,
    state,
    quests: () => quests,
    enemies: () => enemies,
    trials: () => svcTrials,
    dialogueOpen: () => runner.isOpen,
    defineAnchor: (a) => anchors.define(a),
    playerFeet: () => feet,
    playerYaw: () => 0,
    warn: (m) => void warns.push(m),
  });

  const tick = (seconds = DT): void => {
    for (let t = 0; t < seconds; t += DT) {
      trials.fixedUpdate(DT);
      duels.fixedUpdate();
    }
  };
  const opp = (): string => duels.running()!.opponentId;
  /** One yield break: `by` staggers the other side, then the trial's pause runs out. */
  const breakBy = (by: 'player' | 'opponent'): void => {
    const o = opp();
    if (by === 'player') dr.stagger(o, player.id, 1000);
    else dr.stagger(player.id, o, 1000);
    tick(TRIAL_TUNING.pauseSeconds + 0.1);
  };
  /** Talks to round `n`'s speaker and picks the choice with this id; returns the choice ids that were offered. */
  const talk = (n: R10Round, choiceId: string | null): string[] => {
    const { dialogueId, npcId } = R10_TARGETS[n];
    expect(runner.start(dialogueId, npcId)).toBe(true);
    for (let i = 0; i < 20 && runner.isOpen && runner.view()!.choices.length === 0; i++) runner.advance();
    const offered = runner.view()?.choices.map((c) => c.id) ?? [];
    if (choiceId) {
      const c = runner.view()!.choices.find((x) => x.id === choiceId);
      expect(c, `choice ${choiceId} offered`).toBeDefined();
      runner.choose(c!.number);
    }
    for (let i = 0; i < 20 && runner.isOpen; i++) {
      if (runner.view()!.choices.length) runner.close('script');
      else runner.advance();
    }
    return offered;
  };
  const opening = (n: R10Round): string => {
    runner.start(R10_TARGETS[n].dialogueId, R10_TARGETS[n].npcId);
    const id = runner.view()!.nodeId;
    runner.close('script');
    return id;
  };
  const seen: { type: keyof GameEventMap; payload: unknown }[] = [];
  events.onAny((type, payload) => void seen.push({ type, payload }));
  const of = (type: keyof GameEventMap) => seen.filter((s) => s.type === type).map((s) => s.payload);
  /** Starts round `n`'s bout from its dialogue choice and runs the tick that begins it. */
  const duel = (n: R10Round): void => {
    talk(n, R10_DUEL_CHOICE_ID);
    tick();
    expect(duels.running()?.round).toBe(n);
  };
  return {
    events, state, actors, dr, player, trials, anchors, duels, runner, alive, spawned, persuaded, counted, quest, warns,
    tick, breakBy, talk, opening, of, duel, opp, strings, patch,
    dropTrials: () => void (svcTrials = undefined),
  };
}
type Rig = ReturnType<typeof rig>;

const winBout = (r: Rig): void => {
  for (let i = 0; i < 3; i++) r.breakBy('player');
};
const loseBout = (r: Rig): void => {
  for (let i = 0; i < 3; i++) r.breakBy('opponent');
};

// ---- the hook ----

describe('R10 duels: the dialogue hook', () => {
  it('on the game\'s own defs: only A13\'s three rounds change (none on main before A13 merges), each to a valid tree', () => {
    const targets = new Set(Object.values(R10_TARGETS).map((t) => t.dialogueId));
    const hasA13 = dialogueDefs.some((d) => targets.has(d.id));
    const p = withR10Duels(dialogueDefs);
    expect([...p.rounds].sort()).toEqual(hasA13 ? [1, 2, 3] : []);
    if (!hasA13) expect(p.strings).toEqual({});
    const strings: Record<string, string> = { ...dialogueStrings, ...p.strings };
    p.defs.forEach((d, i) => {
      if (!targets.has(d.id)) return void expect(d).toBe(dialogueDefs[i]);
      expect(d.nodes.slice(0, dialogueDefs[i].nodes.length).map((n) => n.id)).toEqual(dialogueDefs[i].nodes.map((n) => n.id));
      expect(validateDialogue(d, (k) => k in strings).errors).toEqual([]);
    });
  });

  it('adds one duel choice beside the three talk choices of each round, valid, with its strings, without changing the input', () => {
    const before = JSON.stringify(A13.map((t) => t.def));
    const p = withR10Duels(A13.map((t) => t.def));
    expect(JSON.stringify(A13.map((t) => t.def))).toBe(before);
    expect(p.rounds).toEqual([1, 2, 3]);
    for (const [i, def] of p.defs.entries()) {
      const n = (i + 1) as R10Round;
      const node = def.nodes.find((x) => x.choices?.some((c) => c.id === 'evidence'))!;
      expect(node.id).toBe(`r10-round-${n}-4`);
      expect(node.choices!.map((c) => c.id)).toEqual(['evidence', 'standing', 'bluff', 'duel']);
      expect(node.choices![3].effects).toEqual([{ event: 'story.r10duel.start', payload: { n: String(n) } }]);
      const strings = { ...A13_STRINGS, ...p.strings };
      expect(validateDialogue(def, (k) => k in strings).errors).toEqual([]);
    }
    // Idempotent: a second pass finds every round already offering the duel.
    const again = withR10Duels(p.defs);
    expect(again.rounds).toEqual([]);
    again.defs.forEach((d, i) => expect(d).toBe(p.defs[i]));
  });

  it('the second\'s spawner is manual, never saved and uses an existing def that yields', async () => {
    const { ENEMY_DEFS } = await import('../../../../enemies/defs');
    const [s] = R10_DUEL_SPAWNERS;
    expect(s).toMatchObject({ id: R10_DUEL_SPAWNER, activation: 'manual', ephemeral: true, count: 1, anchor: R10_DUEL_ANCHOR });
    expect(ENEMY_DEFS[s.enemy as keyof typeof ENEMY_DEFS].mercy).toMatchObject({ verb: 'spare', when: 'yielding' });
  });
});

// ---- the bout ----

describe('R10 duels: a bout instead of a talk', () => {
  it('a win writes the talk\'s own round flag and event, once, and puts the second and the ring away', () => {
    const r = rig();
    expect(r.talk(1, 'duel')).toEqual(['evidence', 'standing', 'bluff', 'duel']);
    // The bout waits for the dialogue to close, then starts on the next tick.
    r.tick();
    expect(r.trials.state()).toMatchObject({ id: 'r10.duel.1', breaksToWin: 3 });
    expect(r.anchors.find(R10_DUEL_ANCHOR)?.position).toEqual({ x: 10, y: 2, z: 15 });
    expect(r.alive.has(R10_DUEL_SPAWNER)).toBe(true);
    winBout(r);
    expect(r.state.getFlag('story.r10.p.1')).toBe(true);
    expect(r.persuaded).toEqual(['1']);
    expect(r.duels.running()).toBeNull();
    expect(r.trials.state()).toBeNull();
    expect(r.anchors.find(R10_DUEL_ANCHOR)).toBeUndefined();
    r.tick();
    expect(r.alive.has(R10_DUEL_SPAWNER)).toBe(false);
    // The round's talk is over: the speaker no longer opens on it.
    expect(r.opening(1)).toBe('idle');
  });

  it('a Spare of the yielding second also wins the round', () => {
    const r = rig();
    r.duel(2);
    r.events.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'yard-veteran', actorId: r.opp() });
    expect(r.state.getFlag('story.r10.p.2')).toBe(true);
    expect(r.persuaded).toEqual(['2']);
    expect(r.trials.state()).toBeNull();
    expect(r.duels.running()).toBeNull();
  });

  it('a loss writes nothing and the round opens again with both the duel (a retry) and the talk', () => {
    const r = rig();
    r.duel(1);
    loseBout(r);
    expect(r.of('trial.lost')).toEqual([{ trialId: 'r10.duel.1' }]);
    expect(r.of('trial.ended')).toEqual([{ trialId: 'r10.duel.1', reason: 'lost' }]);
    expect(r.state.getFlag('story.r10.p.1')).toBeUndefined();
    expect(r.persuaded).toEqual([]);
    r.tick();
    expect(r.alive.has(R10_DUEL_SPAWNER)).toBe(false);
    expect(r.anchors.find(R10_DUEL_ANCHOR)).toBeUndefined();
    // Retry: the same round's bout again, with a fresh second, and this time it is won.
    r.duel(1);
    expect(r.spawned).toHaveLength(2);
    winBout(r);
    expect(r.persuaded).toEqual(['1']);
  });

  it('after a loss Cael can fall back to the talk instead', () => {
    const r = rig();
    r.duel(3);
    loseBout(r);
    r.tick();
    expect(r.talk(3, 'evidence')).toContain('duel');
    expect(r.state.getFlag('story.r10.p.3')).toBe(true);
    expect(r.persuaded).toEqual(['3']);
    expect(r.duels.running()).toBeNull();
  });

  it('Cael\'s own yield, walking off or a teleport is a loss too: nothing written, the round stays open', () => {
    const r = rig();
    r.duel(1);
    r.trials.yield('r10.duel.1');
    expect(r.duels.running()).toBeNull();
    r.duel(1);
    r.trials.stop('r10.duel.1');
    expect(r.duels.running()).toBeNull();
    expect(r.state.getFlag('story.r10.p.1')).toBeUndefined();
    expect(r.persuaded).toEqual([]);
    expect(r.opening(1)).toBe('r10-round-1');
  });
});

describe('R10 duels: the talks still work, and nothing pays twice', () => {
  it('the talk alone wins all three rounds as before, and the duel is never started', () => {
    const r = rig();
    for (const n of [1, 2, 3] as const) r.talk(n, 'evidence');
    expect(r.persuaded).toEqual(['1', '2', '3']);
    expect(r.counted.size).toBe(3);
    for (const n of [1, 2, 3] as const) expect(r.state.getFlag(r10RoundFlag(n))).toBe(true);
    expect(r.spawned).toEqual([]);
    // The bluff still only hints.
    const r2 = rig();
    r2.talk(2, 'bluff');
    expect(r2.persuaded).toEqual([]);
  });

  it('two duels and a talk finish the three rounds with one event per round', () => {
    const r = rig();
    r.duel(1);
    winBout(r);
    r.talk(2, 'evidence');
    r.tick();
    r.duel(3);
    winBout(r);
    expect(r.persuaded).toEqual(['1', '2', '3']);
    expect(r.counted.size).toBe(3);
  });

  it('a round won by duel is not paid again: no second win, no talk, no second bout', () => {
    const r = rig();
    r.duel(2);
    const id = r.opp();
    winBout(r);
    // A late win or Spare for the finished bout does nothing.
    r.events.emit('trial.won', { trialId: 'r10.duel.2' });
    r.events.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'yard-veteran', actorId: id });
    expect(r.duels.request(2)).toBe(false);
    r.events.emit('story.r10duel.start' as never, { n: '2' } as never);
    r.tick();
    expect(r.duels.running()).toBeNull();
    expect(r.opening(2)).toBe('idle');
    expect(r.persuaded).toEqual(['2']);
  });

  it('a round won by talk cannot be duelled, and a talk won while its bout runs ends the bout unpaid', () => {
    const r = rig();
    r.talk(1, 'evidence');
    expect(r.duels.request(1)).toBe(false);
    r.duel(2);
    // The round's talk is won from a second conversation while the bout runs (the dialogue offers it: the flag is unset).
    r.talk(2, 'evidence');
    r.tick();
    expect(r.duels.running()).toBeNull();
    expect(r.trials.state()).toBeNull();
    r.tick();
    expect(r.alive.has(R10_DUEL_SPAWNER)).toBe(false);
    expect(r.persuaded).toEqual(['1', '2']);
  });

  it('offers nothing off the compromise branch, outside R10, once the talks are done, or while a bout runs', () => {
    expect(rig({ branch: 'miners' }).duels.request(1)).toBe(false);
    const r = rig();
    r.quest.set('r10', 'completed');
    expect(r.duels.request(1)).toBe(false);
    const r2 = rig();
    r2.duel(1);
    expect(r2.duels.request(2)).toBe(false);
    const r3 = rig();
    for (const n of [1, 2, 3] as const) r3.talk(n, 'evidence');
    r3.state.clearFlag('story.r10.p.3');
    expect(r3.duels.request(3)).toBe(false);
  });
});

describe('R10 duels: save, load and teardown', () => {
  it('a save made mid-bout holds no bout; loading it ends the bout unpaid and the round can be fought again', () => {
    const r = rig();
    r.duel(1);
    r.breakBy('player');
    const saved = JSON.parse(JSON.stringify(r.state.serialize()));
    expect(JSON.stringify(saved)).not.toMatch(/r10duel|r10\.duel|story\.r10\.p\./);
    // The load as the game runs it: the companions entry ends the trial first, then the flags, then `save.loaded`.
    r.trials.beginLoad();
    r.state.load(saved);
    r.events.emit('save.loaded', { slot: 'test' });
    expect(r.duels.running()).toBeNull();
    expect(r.trials.state()).toBeNull();
    expect(r.anchors.find(R10_DUEL_ANCHOR)).toBeUndefined();
    r.tick();
    expect(r.alive.has(R10_DUEL_SPAWNER)).toBe(false);
    expect(r.persuaded).toEqual([]);
    expect(r.state.getFlag('story.r10.branch')).toBe('compromise');
    r.duel(1);
    expect(r.trials.state()).toMatchObject({ id: 'r10.duel.1', player: 0, opponent: 0 });
    winBout(r);
    expect(r.persuaded).toEqual(['1']);
  });

  it('loading a save where the round was already won stops a running bout without paying', () => {
    const r = rig();
    r.talk(3, 'evidence');
    const saved = JSON.parse(JSON.stringify(r.state.serialize()));
    r.state.clearFlag('story.r10.p.3');
    r.duel(3);
    // A load whose flags arrive while the trial is still up (no companions entry ran first).
    r.state.load(saved);
    r.tick();
    expect(r.duels.running()).toBeNull();
    expect(r.trials.state()).toBeNull();
    r.events.emit('save.loaded', { slot: 'test' });
    expect(r.persuaded).toEqual(['3']);
  });

  it('a dialogue choice made just before a load does not start a bout after it', () => {
    const r = rig();
    r.talk(1, 'duel');
    r.events.emit('save.loaded', { slot: 'test' });
    r.tick();
    expect(r.duels.running()).toBeNull();
    expect(r.spawned).toEqual([]);
  });

  it('teardown mid-bout stops the trial, puts the second and the ring away, and listens to nothing afterwards', () => {
    const r = rig();
    r.duel(2);
    const id = r.opp();
    r.duels.dispose();
    expect(r.trials.state()).toBeNull();
    expect(r.alive.has(R10_DUEL_SPAWNER)).toBe(false);
    expect(r.anchors.find(R10_DUEL_ANCHOR)).toBeUndefined();
    r.events.emit('story.r10duel.start' as never, { n: '1' } as never);
    r.events.emit('trial.won', { trialId: 'r10.duel.2' });
    r.events.emit('mercy', { verb: 'spare', tier: 'normal', track: null, creature: 'yard-veteran', actorId: id });
    r.duels.fixedUpdate();
    expect(r.duels.request(1)).toBe(false);
    expect(r.persuaded).toEqual([]);
    expect(r.spawned).toHaveLength(1);
    r.duels.dispose();
  });

  it('a missing trials service warns and leaves nothing behind', () => {
    const r = rig();
    r.dropTrials();
    r.talk(1, 'duel');
    r.tick();
    expect(r.duels.running()).toBeNull();
    expect(r.spawned).toEqual([]);
    expect(r.warns.join()).toMatch(/no enemies or trials/);
  });
});

