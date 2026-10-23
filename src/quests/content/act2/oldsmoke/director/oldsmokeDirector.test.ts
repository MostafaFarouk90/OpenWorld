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
  const rekindled: unknown[] = [];
  const registeredNpcs: string[] = [];
  const registeredStrings: Array<Record<string, string>> = [];
  services.provide('quests' as never, {
    state: (id: string) => quest.get(id) ?? 'inactive',
    objectiveDone: () => false,
    isObjectiveCurrent: (q: string, o: string) => current.has(`${q}.${o}`),
    objectives: () => [],
  } as never);
  services.provide('dialogue' as never, { get active() { return busy.on; }, start: (id: string, npc: string) => { if (busy.on) return false; dialogues.push([id, npc]); return true; } } as never);
  // the mine installers (M18/M19/M20/D04) and the cast registration read these services; they are inert stubs here, the installers have their own tests
  services.provide('wyrms' as never, { tether: () => null, unchain: () => false, flyAway: () => false, playOrsk: () => null } as never);
  services.provide('puzzles' as never, { register: () => () => {}, pressure: () => null } as never);
  services.provide('interiors' as never, { current: null, setBlocker: () => true } as never);
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
    triggers: { add: (t: { id: string }) => { triggers.push(t.id); return () => {}; } },
    player: { feet: { x: 0, y: 0, z: 0 } },
    systems: { add: (s: { fixedUpdate(dt: number): void }) => { tick = s; return () => {}; } },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  plugin.setup(ctx);
  return {
    events, state, quest, current, busy, dialogues, triggers, rekindled, warn, registeredNpcs, registeredStrings,
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

describe('oldsmoke director: M22 scenes', () => {
  const enter = (r: ReturnType<typeof rig>, triggerId = 'trg.harrowmark.keep-hall', actorId = 'player') => r.events.emit('trigger.enter', { triggerId, actorId } as never);

  it('entering the Keep hall with the council objective open starts the council scene with Wystan, once per entry', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    r.current.add('m22.council');
    enter(r);
    r.step(30);
    expect(r.dialogues).toEqual([['scene-m22-council', 'wystan']]);
    r.dispose();
  });

  it('starts it when the objective opens with Cael already in the hall, and retries while another dialogue holds the floor', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    enter(r);
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

  it('does not start it after Cael has left the hall', () => {
    const r = rig();
    r.quest.set('m22', 'active');
    r.current.add('m22.council');
    enter(r);
    r.events.emit('trigger.exit', { triggerId: 'trg.harrowmark.keep-hall', actorId: 'player' } as never);
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.dispose();
  });

  it('does not start it for another actor or trigger, before M22, or once the council is done', () => {
    const r = rig();
    enter(r);
    r.quest.set('m22', 'active');
    enter(r, 'trg.harrowmark.keep-hall', 'wyrm');
    enter(r, 'trg.harrowmark.counting-house');
    r.step(30);
    expect(r.dialogues).toEqual([]);
    enter(r); // M22 active but the council objective is not current
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.dispose();
  });

  it('the banner starts its two-line scene, only during M22', () => {
    const r = rig();
    r.interact(M22_BANNER);
    r.step(30);
    expect(r.dialogues).toEqual([]);
    r.quest.set('m22', 'active');
    r.current.add('m22.raised');
    r.busy.on = true;
    r.interact(M22_BANNER);
    r.step(30);
    expect(r.dialogues).toEqual([]); // held: it retries
    r.busy.on = false;
    r.step(30);
    expect(r.dialogues).toEqual([['scene-m22-banner', 'wystan']]);
    r.step(60);
    expect(r.dialogues).toHaveLength(1);
    r.dispose();
  });

  it('dispose removes the listeners', () => {
    const r = rig();
    r.dispose();
    r.quest.set('m22', 'active');
    r.interact(M22_BANNER);
    r.events.emit('quest.completed', { questId: 'm16' } as never);
    expect(r.dialogues).toEqual([]);
    expect(r.state.getBool('story.m16.complete')).toBe(false);
  });
});
