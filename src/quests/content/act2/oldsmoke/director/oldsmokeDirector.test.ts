// The Oldsmoke quest director against stub services on the real event bus and flag store: the M16 rekindle, the M22 scenes,
// the complete flags and the triggers it registers.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { WorldState } from '../../../../../state/WorldState';
import type { QuestState } from '../../../../types';
import { OLDSMOKE_QUEST_IDS } from '../index';
import { OLDSMOKE_TRIGGERS } from '../all';
import { M16_BRAZIER, M16_BRAZIER_ID } from '../m16.quest';
import { M22_BANNER } from '../m22.quest';
import { M17R08_NPC_DEFS } from '../mines/m17r08.content';
import { M18M19_NPC_DEFS } from '../mines/m18m19.content';
import { M20D04_NPC_DEFS } from '../mines/m20d04.content';
import plugin from './oldsmokeDirector.plugin';

function rig(opts: { anchors?: boolean; npcs?: boolean } = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const quest = new Map<string, QuestState>();
  const current = new Set<string>();
  const dialogues: Array<[string, string]> = [];
  const triggers: string[] = [];
  const busy = { on: false };
  const rechecks = { n: 0 };
  const interiors = { current: null as string | null, setBlocker: () => true };
  const inside = new Set<string>();
  const rekindled: unknown[] = [];
  const registeredNpcs: string[] = [];
  const registeredStrings: Array<Record<string, string>> = [];
  services.provide('quests' as never, {
    state: (id: string) => quest.get(id) ?? 'inactive',
    objectiveDone: () => false,
    isObjectiveCurrent: (q: string, o: string) => current.has(`${q}.${o}`),
    objectives: () => [],
    recheck: () => void (rechecks.n += 1),
  } as never);
  services.provide('dialogue' as never, { get active() { return busy.on; }, start: (id: string, npc: string) => { if (busy.on) return false; dialogues.push([id, npc]); return true; } } as never);
  // the mine installers (M18/M19/M20/D04) and the cast registration read these services; they are inert stubs here, the installers have their own tests
  services.provide('wyrms' as never, { tether: () => null, unchain: () => false, flyAway: () => false, playOrsk: () => null } as never);
  services.provide('puzzles' as never, { register: () => () => {}, pressure: () => null } as never);
  services.provide('interiors' as never, interiors as never);
  services.provide('waystones' as never, { hostileAggro: false } as never);
  if (opts.npcs !== false) {
    services.provide('npcs' as never, {
      register: (_specs: unknown, defs: Array<{ id: string }>) => { registeredNpcs.push(...defs.map((d) => d.id)); return () => {}; },
      setHidden: () => {}, place: () => true,
    } as never);
  }
  events.on('waystone.rekindled', (p) => void rekindled.push(p));
  let tick: { fixedUpdate(dt: number): void } | null = null;
  const ctx = {
    events, state, services,
    strings: { register: (_lang: string, t: Record<string, string>) => { registeredStrings.push(t); return () => {}; }, t: (k: string) => k },
    anchors: { find: (id: string) => (opts.anchors === false ? undefined : { position: { x: 1, y: 2, z: 3 }, id }) },
    triggers: { add: (t: { id: string }) => { triggers.push(t.id); return () => {}; }, isInside: (id: string, actor = 'player') => actor === 'player' && inside.has(id) },
    player: { feet: { x: 0, y: 0, z: 0 } },
    systems: { add: (s: { fixedUpdate(dt: number): void }) => { tick = s; return () => {}; } },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  plugin.setup(ctx);
  return {
    events, state, quest, current, busy, rechecks, interiors, inside, dialogues, triggers, rekindled, warn, registeredNpcs, registeredStrings,
    step: (n = 1) => { for (let i = 0; i < n; i++) tick!.fixedUpdate(1 / 60); },
    interact: (interactableId: string, action = 'interact') => events.emit('interact', { interactableId, kind: 'use', actorId: 'player', action } as never),
    dispose: () => plugin.dispose?.(),
  };
}

beforeEach(() => void vi.restoreAllMocks());

describe('oldsmoke director', () => {
  it('registers the quests\' triggers on their anchors, and warns once for an anchor that is missing', () => {
    const r = rig();
    expect(r.triggers.sort()).toEqual(OLDSMOKE_TRIGGERS.map((t) => t.id).sort());
    r.dispose();
    const r2 = rig({ anchors: false });
    expect(r2.triggers).toEqual([]);
    // one warning per trigger anchor, and nothing else: the NPC registration does not depend on anchors
    expect(r2.warn).toHaveBeenCalledTimes(OLDSMOKE_TRIGGERS.length);
    expect(r2.warn.mock.calls.every(([m]) => /trigger trg\./.test(String(m)))).toBe(true);
    r2.dispose();
  });

  it('registers the mine cast and its strings, and warns once (not counted with the triggers) when the npcs service is missing', () => {
    const r = rig();
    expect(r.warn).not.toHaveBeenCalled();
    expect(r.registeredNpcs.sort()).toEqual([...M17R08_NPC_DEFS, ...M18M19_NPC_DEFS, ...M20D04_NPC_DEFS].map((d) => d.id).sort());
    expect(r.registeredStrings.length).toBeGreaterThan(0);
    r.dispose();
    const r2 = rig({ npcs: false });
    expect(r2.registeredNpcs).toEqual([]);
    const notes = r2.warn.mock.calls.map(([m]) => String(m)).filter((m) => /mine cast/.test(m));
    expect(notes).toHaveLength(1);
    expect(r2.warn).toHaveBeenCalledTimes(1);
    expect(r2.triggers.sort()).toEqual(OLDSMOKE_TRIGGERS.map((t) => t.id).sort());
    r2.dispose();
  });

  it('writes story.<id>.complete for the five quests only, and re-derives it on a load', () => {
    const r = rig();
    for (const id of OLDSMOKE_QUEST_IDS) {
      expect(r.state.getBool(`story.${id}.complete`)).toBe(false);
      r.events.emit('quest.completed', { questId: id } as never);
      expect(r.state.getBool(`story.${id}.complete`), id).toBe(true);
    }
    r.events.emit('quest.completed', { questId: 'm11' } as never);
    expect(r.state.getFlag('story.m11.complete')).toBeUndefined();
    r.state.clearFlag('story.m21.complete');
    r.quest.set('m21', 'completed');
    r.events.emit('save.loaded', { slot: 'a' } as never);
    expect(r.state.getBool('story.m21.complete')).toBe(true);
    expect(r.state.getBool('story.r10.complete')).toBe(true);
    r.dispose();
  });

  it('never writes the Act 3 gate', () => {
    const r = rig();
    for (const id of OLDSMOKE_QUEST_IDS) r.events.emit('quest.completed', { questId: id } as never);
    expect(r.state.getFlag('story.gate.a3')).toBeUndefined();
    r.dispose();
  });
});

describe('oldsmoke director: M16 brazier', () => {
  it('lighting the brazier during M16 raises one player rekindle for the grisel brazier', () => {
    const r = rig();
    r.quest.set('m16', 'active');
    r.interact(M16_BRAZIER);
    expect(r.rekindled).toEqual([{ waystoneId: M16_BRAZIER_ID, cause: 'player' }]);
    r.dispose();
  });

  it('does nothing before M16, after it, for another prop, or for a mercy action', () => {
    const r = rig();
    r.interact(M16_BRAZIER);
    r.quest.set('m16', 'active');
    r.interact('use:m16-ledger');
    r.interact(M16_BRAZIER, 'mercy');
    r.quest.set('m16', 'completed');
    r.interact(M16_BRAZIER);
    expect(r.rekindled).toEqual([]);
    r.dispose();
  });
});

describe('oldsmoke director: M21 loyalists', () => {
  const credit = (r: ReturnType<typeof rig>, done = true, objectiveId = 'audience', questId = 'm21') =>
    r.events.emit('quest.objective', { questId, objectiveId, progress: 1, required: 1, done } as never);

  it('the fight is released when the audience talk is credited after a failed confront, not while the choice is made', () => {
    const r = rig();
    r.state.setFlag('story.m21.choice', 'confront'); // the press choice, mid-dialogue
    expect(r.state.getBool('story.m21.loyalistsOut')).toBe(false);
    credit(r, false);
    credit(r, true, 'evidence');
    credit(r, true, 'audience', 'm22');
    expect(r.state.getBool('story.m21.loyalistsOut')).toBe(false);
    credit(r);
    expect(r.state.getBool('story.m21.loyalistsOut')).toBe(true);
    r.dispose();
  });

  it('a persuaded Aldous or a spy never releases it', () => {
    const r = rig();
    r.state.setFlag('story.m21.choice', 'confront');
    r.state.setFlag('story.m21.persuaded', true);
    credit(r);
    expect(r.state.getBool('story.m21.loyalistsOut')).toBe(false);
    r.dispose();
    const r2 = rig();
    r2.state.setFlag('story.m21.choice', 'spy');
    credit(r2);
    expect(r2.state.getBool('story.m21.loyalistsOut')).toBe(false);
    r2.dispose();
  });
});

describe('oldsmoke director: M22 scenes', () => {
  type R = ReturnType<typeof rig>;
  const intoHall = (r: R) => void (r.interiors.current = 'keep-hall');

  it('being in the Keep hall with the council objective open starts the council scene with Wystan', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    r.current.add('m22.council');
    intoHall(r);
    r.step(30);
    expect(r.dialogues).toEqual([['scene-m22-council', 'wystan']]);
    r.dispose();
  });

  it('the hall is the interior, not the 3 m strip: arriving by a load or a teleport, with no trigger.enter, still counts', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    r.current.add('m22.council');
    r.inside.add('trg.harrowmark.keep-hall'); // standing in the strip alone (e.g. after a load) also counts
    r.step(30);
    expect(r.dialogues).toEqual([['scene-m22-council', 'wystan']]);
    r.dispose();
    const r2 = rig();
    r2.quest.set('m22', 'active');
    r2.current.add('m22.council');
    intoHall(r2);
    r2.events.emit('trigger.exit', { triggerId: 'trg.harrowmark.keep-hall', actorId: 'player' } as never); // walking past the strip's far side changes nothing
    r2.step(30);
    expect(r2.dialogues).toEqual([['scene-m22-council', 'wystan']]);
    r2.dispose();
  });

  it('starts it when the objective opens with Cael already in the hall, and retries while another dialogue holds the floor', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    intoHall(r);
    r.step(30); // the council objective is not open yet
    expect(r.dialogues).toEqual([]);
    r.current.add('m22.council');
    r.busy.on = true;
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.busy.on = false;
    r.step(30);
    expect(r.dialogues).toEqual([['scene-m22-council', 'wystan']]);
    r.dispose();
  });

  it('does not start it outside the hall', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    r.current.add('m22.council');
    r.step(30);
    expect(r.dialogues).toEqual([]);
    intoHall(r);
    r.interiors.current = null; // left again
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.dispose();
  });

  it('does not start it before M22, or when the council objective is not current', () => {
    const r = rig();
    intoHall(r);
    r.current.add('m22.council');
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.quest.set('m22', 'active');
    r.current.clear(); // M22 active but neither council nor raised is current
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.dispose();
  });

  it('the banner scene starts once the raised objective is current in the hall, and retries while a dialogue is open', () => {
    const r = rig();
    intoHall(r);
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.quest.set('m22', 'active');
    r.current.add('m22.raised');
    r.busy.on = true;
    r.step(30);
    expect(r.dialogues).toEqual([]); // held: it retries
    r.busy.on = false;
    r.step(30);
    expect(r.dialogues).toEqual([['scene-m22-banner', 'wystan']]);
    r.dispose();
  });

  it('a save and load between the banner interact and its scene loses nothing: a fresh director with the objective current plays the scene', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    r.current.add('m22.raised');
    r.interact(M22_BANNER);
    r.dispose(); // the in-memory side of the old design is gone with the session
    const r2 = rig();
    r2.quest.set('m22', 'active');
    r2.current.add('m22.raised'); // the loaded quest state: banner done, raised current
    intoHall(r2);
    r2.events.emit('save.loaded', { slot: 'a' } as never);
    r2.step(30);
    expect(r2.dialogues).toEqual([['scene-m22-banner', 'wystan']]);
    r2.dispose();
  });

  it('R10 choosing writes the choice flag: the director rechecks the quests at once (R09 clerk), and not for other flags', () => {
    const r = rig();
    r.state.setFlag('story.r10.branch', 'miners');
    expect(r.rechecks.n).toBe(0);
    r.state.setFlag('story.r10.choice', 'miners');
    expect(r.rechecks.n).toBe(1);
    r.dispose();
    r.state.setFlag('story.r10.choice', 'stewards');
    expect(r.rechecks.n).toBe(1); // disposed
  });

  it('dispose removes the listeners', () => {
    const r = rig();
    r.dispose();
    r.quest.set('m22', 'active');
    r.interiors.current = 'keep-hall';
    r.current.add('m22.council');
    r.step(30);
    r.interact(M22_BANNER);
    r.events.emit('quest.completed', { questId: 'm16' } as never);
    expect(r.dialogues).toEqual([]);
    expect(r.state.getBool('story.m16.complete')).toBe(false);
  });
});
