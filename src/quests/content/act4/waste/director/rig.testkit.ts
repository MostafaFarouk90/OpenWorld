// A rig for the Waste installers (the shape of L10's): the real event bus, flag store and quest manager (every Act 4 quest
// registered), and stubs for what a headless boot lacks: dialogue, the npcs, the inventory, the enemies and group-standing
// services, trials, L4's escorts, L0's scenes, the wave director and L3's weather.
import { vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { WorldState } from '../../../../../state/WorldState';
import { QuestManager } from '../../../../QuestManager';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { evalCondition } from '../../../../conditions';
import { makeKit, type Off } from '../../../act2/director/kit';
import type { Act4EscortDef, EscortState } from '../../../../../escort/EscortEngine';
import type { SceneDef } from '../../../../../scenes/types';
import { WASTE_LAYOUT } from '../../../../../waste/waste.layout';
import { ACT4_WORLD_LAYOUT } from '../../../../../region/act4/act4World.layout';
import { WASTE_INTERIORS } from '../../../../../waste/interiors';
import { SHELTER_SPOTS } from '../../../../../region/act4/ropeLines';
import { ACT4_QUEST_DEFS, ACT4_OBJECTIVE_FLAGS } from '../..';
import { WASTE_A4_PROPS } from '../props';
import { WASTE_A4_NOTE_LIST } from '../notes';
import { WASTE_A4_SCENES } from '../scenes';
import { wasteA4InteriorExtras, wasteA4QuestLayout } from '../layout';
import { installArms, installGroupObjectives } from '../../harrowmark/director/generic';
import { installComplete, installDoneWhenRecheck } from './generic';
import { WASTE_A4_ARMS, WASTE_A4_GROUPS } from './tables';
import { installWeather } from './storms';
import { installM42, installStormWalk } from './crossing';
import { installDance, installM44, installPyres, installR25 } from './camp';
import { installR24 } from './cart';
import { installD08, installM45, installM46, m46Clears } from './road';

const WORLD = [...WASTE_LAYOUT.anchors, ...ACT4_WORLD_LAYOUT.anchors];
const ANCHORS = new Map<string, { x: number; z: number }>([
  ...WORLD.map((a) => [a.id, { x: a.x, z: a.z }] as const),
  ...SHELTER_SPOTS.map((s) => [`shelter-spot:${s.id}`, { x: s.at.x, z: s.at.z }] as const),
  ...wasteA4QuestLayout(WORLD).anchors.map((a) => [a.id, { x: a.x, z: a.z }] as const),
  // the interiors in their own frame
  ...WASTE_INTERIORS.flatMap((d) => d.anchors.map((a) => [a.id, { x: a.x, z: a.z }] as const)),
  ...wasteA4InteriorExtras().flatMap((d) => d.anchors.map((a) => [a.id, { x: a.x, z: a.z }] as const)),
]);
export const anchorPos = (id: string): { x: number; y: number; z: number } => {
  const a = ANCHORS.get(id);
  if (!a) throw new Error(`no anchor ${id}`);
  return { x: a.x, y: 0, z: a.z };
};

export function makeRig(opts: { flags?: Record<string, boolean | number | string> } = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  for (const q of ACT4_QUEST_DEFS) manager.register(q);
  const flagsOff = installObjectiveFlags(ACT4_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const [k, v] of Object.entries({ 'story.gate.a4': true, ...opts.flags })) state.setFlag(k, v);

  const dialogue = { active: false };
  services.provide('dialogue' as never, dialogue as never);
  const npcPos = new Map<string, { x: number; y: number; z: number }>();
  services.provide('npcs' as never, { position: (id: string) => npcPos.get(id) } as never);

  const standing = new Map<string, string[]>();
  services.provide('groupStanding' as never, { standing: (id: string) => standing.get(id) ?? [], onMemberLeft: () => () => {} } as never);
  const enemyCalls: string[] = [];
  services.provide('enemies' as never, {
    alive: (id: string) => standing.get(id) ?? [],
    spawnGroup: (id: string) => { enemyCalls.push(`spawn ${id}`); standing.set(id, [`${id}-1`]); return [`${id}-1`]; },
    despawnGroup: (id: string) => { enemyCalls.push(`despawn ${id}`); standing.set(id, []); },
    reset: (id: string) => void enemyCalls.push(`reset ${id}`),
  } as never);

  const trials = {
    running: null as null | { id: string; opponentId: string; standInNpcId?: string },
    start(o: { id: string; opponentId: string; standInNpcId?: string }) { this.running = { ...o }; return true; },
    stop(id: string) { if (this.running?.id === id) this.running = null; return true; },
    state() { return this.running; },
  };
  services.provide('trials' as never, trials as never);

  /** L4's escorts, as far as the director uses them; the test sends the junction and arrival events. */
  const escorts = {
    cur: null as string | null,
    starts: [] as Act4EscortDef[],
    stops: [] as string[],
    goes: 0,
    st: null as EscortState | null,
    active() { return this.cur; },
    start(def: Act4EscortDef) { if (this.cur) return false; this.starts.push(def); this.cur = def.id; return true; },
    stop(id: string) { if (this.cur === id) { this.cur = null; this.stops.push(id); } },
    go() { this.goes++; if (this.st) this.st = { ...this.st, reason: null }; return true; },
    state() { return this.st; },
    lastJunction: () => null, view: () => null,
  };
  services.provide('escortsAct4' as never, escorts as never);

  const sceneDefs = new Map<string, SceneDef>();
  const scenes = {
    active: null as string | null,
    played: [] as string[],
    register(d: SceneDef) { sceneDefs.set(d.id, d); return () => void sceneDefs.delete(d.id); },
    play(id: string) {
      this.played.push(id);
      events.emit('scene.started' as never, { id } as never);
      for (const st of sceneDefs.get(id)?.steps ?? []) if ('flag' in st) state.setFlag(st.flag.key, st.flag.value ?? true);
      events.emit('scene.ended' as never, { id, reason: 'finished' } as never);
      return Promise.resolve('finished' as const);
    },
  };
  for (const d of WASTE_A4_SCENES) scenes.register(d);
  services.provide('scenes' as never, scenes as never);
  const waves = {
    current: null as null | { defId: string; index: number },
    starts: [] as string[],
    done: new Set<string>(),
    start(id: string) { if (this.current || this.done.has(id)) return false; this.current = { defId: id, index: 0 }; this.starts.push(id); return true; },
    stop() { this.current = null; },
  };
  services.provide('waves' as never, waves as never);
  /** L3's weather: the holds standing now, by reason. */
  const weather = {
    storms: new Set<string>(),
    clears: new Set<string>(),
    shelter: null as string | null,
    forceStorm(r: string) { this.storms.add(r); return () => void this.storms.delete(r); },
    holdClear(r: string) { this.clears.add(r); return () => void this.clears.delete(r); },
    onShelter(id: string) { return this.shelter === id; },
  };
  services.provide('weather' as never, weather as never);
  const bag = new Map<string, number>();
  services.provide('inventory' as never, {
    count: (id: string) => bag.get(id) ?? 0,
    has: (id: string) => (bag.get(id) ?? 0) > 0,
    add: (id: string, n: number) => { bag.set(id, (bag.get(id) ?? 0) + n); return n; },
    remove: (id: string, n: number) => { const c = bag.get(id) ?? 0; if (c < n) return false; bag.set(id, c - n); return true; },
  } as never);
  const sounds: string[] = [];
  services.provide('audio' as never, { play: (k: string) => { sounds.push(k); return 1; } } as never);

  const toasts: string[] = [];
  events.on('hud.toast' as never, ((e: { textKey: string }) => void toasts.push(e.textKey)) as never);

  const teleports: Array<{ x: number; z: number }> = [];
  const player = {
    feet: { x: 0, y: 0, z: 0 }, facingYaw: 0, actor: { id: 'player' },
    teleport(p: { x: number; y: number; z: number }) { teleports.push({ x: p.x, z: p.z }); this.feet = { ...p }; return { ready: () => true }; },
  };
  const actorAt = new Map<string, { x: number; z: number }>();
  const ctx = {
    events, state, services,
    anchors: { find: (id: string) => (ANCHORS.has(id) ? { id, position: anchorPos(id), yaw: 0 } : undefined), define: () => () => {} },
    triggers: { add: () => () => {} },
    strings: { t: (k: string) => k, register: () => () => {} },
    player,
    actors: {
      get: (id: string) => (actorAt.has(id) ? { id, worldPosition: (o: { x: number; y: number; z: number }) => Object.assign(o, { x: actorAt.get(id)!.x, y: 0, z: actorAt.get(id)!.z }) } : undefined),
      all: () => [],
    },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);
  let clock = 0;

  installArms(kit, WASTE_A4_ARMS);
  installComplete(kit);
  installGroupObjectives(kit, WASTE_A4_GROUPS);
  installDoneWhenRecheck(kit);
  offs.push(installWeather(kit, () => m46Clears(kit)));
  installM42(kit);
  offs.push(installStormWalk(kit, () => clock));
  installPyres(kit);
  installDance(kit, offs);
  offs.push(installM44(kit));
  installR25(kit, offs);
  installR24(kit);
  installM45(kit);
  installD08(kit);
  installM46(kit);

  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  const propById = new Map(WASTE_A4_PROPS.map((p) => [p.interactableId, p]));
  const env = () => ({ state: { getFlag: (k: string) => state.getFlag(k) }, quests: { state: (q: string) => manager.state(q), objectiveDone: (q: string, o: string) => manager.objectiveDone(q, o) } }) as never;

  const r = {
    events, state, manager, kit, tick, emit, dialogue, standing, enemyCalls, player, warn, toasts, trials, escorts, ctx, scenes, waves,
    weather, bag, sounds, teleports, npcPos, actorAt,
    step: (n = 1): void => { for (let i = 0; i < n; i++) tick(); },
    /** `s` seconds of fixed ticks. */
    secs: (s: number): void => r.step(Math.round(s * 60)),
    advance: (ms: number) => { clock += ms; },
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); warn.mockRestore(); },
    at: (anchorId: string, dx = 0, dz = 0) => { const p = anchorPos(anchorId); player.feet = { x: p.x + dx, y: 0, z: p.z + dz }; return p; },
    enter: (triggerId: string) => emit('trigger.enter', { triggerId, actorId: 'player' }),
    talk: (npcId: string, dialogueId = `npc-${npcId}`) => emit('dialogue.ended', { dialogueId, npcId, reason: 'completed' }),
    read: (noteId: string) => emit('dialogue.ended', { dialogueId: noteId, npcId: noteId, reason: 'completed' }),
    reads: (ids: readonly string[]) => ids.forEach((id) => r.read(id)),
    fight: (groups: readonly string[]) => {
      for (const g of groups) standing.set(g, [`${g}-a`, `${g}-b`]);
      r.step(31);
      for (const g of groups) standing.set(g, []);
      r.step(31);
    },
    use: (id: string): boolean => {
      const p = propById.get(id);
      if (!p) throw new Error(`no prop ${id}`);
      if (p.objective && !(manager.state(p.objective[0]) === 'active' && manager.isObjectiveCurrent(p.objective[0], p.objective[1]))) return false;
      if (p.when && !evalCondition(p.when, env())) return false;
      if (p.usedFlag && state.getFlag(p.usedFlag) === true) return false;
      if (p.usedFlag) state.setFlag(p.usedFlag, true);
      emit('interact', { interactableId: id, kind: 'prop', actorId: 'player', action: 'interact' });
      return true;
    },
    current: (q: string, o: string) => manager.isObjectiveCurrent(q, o),
    done: (q: string, o: string) => manager.objectiveDone(q, o),
    qs: (q: string) => manager.state(q),
    flag: (k: string) => state.getBool(k),
    str: (k: string) => state.getString(k),
    num: (k: string) => state.getNumber(k),
    set: (k: string, v: boolean | number | string = true) => state.setFlag(k, v),
    snapshot: (): string => JSON.stringify({ q: manager.serialize(), s: state.serialize() }),
    restore: (snap: string) => {
      const d = JSON.parse(snap) as { q: unknown; s: unknown };
      manager.load(d.q); state.load(d.s);
      standing.clear();
      emit('save.loaded', {});
      r.step(2);
    },
    saveLoad: () => r.restore(r.snapshot()),
    begin: (q: string, giver: string) => { if (!manager.start(q)) throw new Error(`cannot start ${q} (${manager.state(q)})`); r.talk(giver); },
    complete: (...ids: string[]) => { for (const id of ids) { manager.start(id); manager.complete(id); } },
  };
  return r;
}
export type Rig = ReturnType<typeof makeRig>;

export const NOTES = (prefix: string): string[] => WASTE_A4_NOTE_LIST.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
