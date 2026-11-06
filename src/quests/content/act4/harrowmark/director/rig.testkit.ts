// A rig for the Harrowmark installers: the real event bus, flag store and quest manager (the nine quests registered), and stubs
// for what a headless boot lacks: dialogue, the inventory, the enemies and group-standing services, trials and L4's escorts.
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
import type { Act4EscortDef } from '../../../../../escort/EscortEngine';
import { HARROWMARK_LAYOUT } from '../../../../../harrowmark/harrowmark.layout';
import { ACT4_LAYOUT_HM } from '../../../../../harrowmark/act4/act4.layout';
import { HARROWMARK_A4_QUEST_DEFS } from '../harrowmark.content';
import { HARROWMARK_A4_OBJECTIVE_FLAGS } from '../objectiveFlags';
import { HARROWMARK_A4_PROPS } from '../props';
import { HARROWMARK_A4_NOTE_LIST } from '../notes';
import { harrowmarkA4InteriorExtras, harrowmarkA4QuestLayout } from '../layout';
import { installArms, installComplete, installGroupObjectives, installDoneWhenRecheck } from './generic';
import { installEscorts } from './escorts';
import { installCrossings, installD07, installM35, installM36, installM37, installR19, installR20, installR22 } from './quests';

const ALL = [...HARROWMARK_LAYOUT.anchors, ...ACT4_LAYOUT_HM.anchors];
const ANCHORS = new Map<string, { x: number; z: number }>([
  ...ALL.map((a) => [a.id, { x: a.x, z: a.z }] as const),
  ...harrowmarkA4QuestLayout(ALL).anchors.map((a) => [a.id, { x: a.x, z: a.z }] as const),
  ...harrowmarkA4InteriorExtras().flatMap((d) => d.anchors.map((a) => [a.id, { x: a.x, z: a.z }] as const)),
]);
export const anchorPos = (id: string): { x: number; y: number; z: number } => {
  const a = ANCHORS.get(id);
  if (!a) throw new Error(`no anchor ${id}`);
  return { x: a.x, y: 0, z: a.z };
};

export interface RigOpts { flags?: Record<string, boolean | number | string>; gold?: number }

export function makeRig(opts: RigOpts = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  for (const q of HARROWMARK_A4_QUEST_DEFS) manager.register(q);
  const flagsOff = installObjectiveFlags(HARROWMARK_A4_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const [k, v] of Object.entries({ 'story.gate.a4': true, ...opts.flags })) state.setFlag(k, v);

  const dialogue = { active: false, started: [] as Array<[string, string]>, start(id: string, npc: string) { this.started.push([id, npc]); return true; } };
  services.provide('dialogue' as never, dialogue as never);

  const standing = new Map<string, string[]>();
  services.provide('groupStanding' as never, { standing: (id: string) => standing.get(id) ?? [], onMemberLeft: () => () => {} } as never);
  const enemyCalls: string[] = [];
  services.provide('enemies' as never, {
    alive: (id: string) => standing.get(id) ?? [],
    spawnGroup: (id: string) => { enemyCalls.push(`spawn ${id}`); return [`${id}-1`]; },
    despawnGroup: (id: string) => void enemyCalls.push(`despawn ${id}`),
  } as never);

  const trials = {
    running: null as null | { id: string; opponentId: string },
    start(o: { id: string; opponentId: string }) { this.running = { id: o.id, opponentId: o.opponentId }; return true; },
    stop(id: string) { if (this.running?.id === id) this.running = null; return true; },
    state() { return this.running; },
  };
  services.provide('trials' as never, trials as never);

  /** L4's escorts, as far as the director uses them: one at a time; the test sends `escort.arrived`. */
  const escorts = {
    cur: null as string | null,
    starts: [] as Act4EscortDef[],
    stops: [] as string[],
    active() { return this.cur; },
    start(def: Act4EscortDef) { if (this.cur && this.cur !== def.id) return false; if (this.cur !== def.id) this.starts.push(def); this.cur = def.id; return true; },
    stop(id: string) { if (this.cur === id) { this.cur = null; this.stops.push(id); } },
    lastJunction: () => null, go: () => true, state: () => null, view: () => null,
  };
  services.provide('escortsAct4' as never, escorts as never);

  const toasts: string[] = [];
  events.on('hud.toast' as never, ((e: { textKey: string }) => void toasts.push(e.textKey)) as never);

  const player = { feet: { x: 0, y: 0, z: 0 } };
  const ctx = {
    events, state, services,
    anchors: { find: (id: string) => (ANCHORS.has(id) ? { id, position: anchorPos(id), yaw: 0 } : undefined), define: () => () => {} },
    triggers: { add: () => () => {} },
    strings: { t: (k: string) => k, register: () => () => {} },
    player,
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);
  let clock = 0;
  const now = (): number => clock;

  installArms(kit);
  installComplete(kit);
  installGroupObjectives(kit);
  installDoneWhenRecheck(kit);
  installEscorts(kit);
  installCrossings(kit);
  installM35(kit);
  installM36(kit);
  installR19(kit, offs);
  installR20(kit);
  offs.push(installR22(kit, now));
  installD07(kit);
  offs.push(installM37(kit, now));

  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  const step = (n = 1): void => { for (let i = 0; i < n; i++) tick(); };
  const propById = new Map(HARROWMARK_A4_PROPS.map((p) => [p.interactableId, p]));
  const env = () => ({ state: { getFlag: (k: string) => state.getFlag(k) }, quests: { state: (q: string) => manager.state(q), objectiveDone: (q: string, o: string) => manager.objectiveDone(q, o) } }) as never;

  const r = {
    events, state, manager, kit, tick, step, emit, dialogue, standing, enemyCalls, player, warn, toasts, trials, escorts, ctx,
    advance: (ms: number) => { clock += ms; },
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); warn.mockRestore(); },
    at: (anchorId: string) => { const p = anchorPos(anchorId); player.feet = { ...p }; return p; },
    talk: (npcId: string, dialogueId = `npc-${npcId}`) => emit('dialogue.ended', { dialogueId, npcId, reason: 'completed' }),
    read: (noteId: string) => emit('dialogue.ended', { dialogueId: noteId, npcId: noteId, reason: 'completed' }),
    reads: (ids: readonly string[]) => ids.forEach((id) => r.read(id)),
    /** A group appears (`n` standing), a few polls pass, then it is cut down. */
    fight: (groups: readonly string[]) => {
      for (const g of groups) standing.set(g, [`${g}-a`, `${g}-b`]);
      r.step(31);
      for (const g of groups) standing.set(g, []);
      r.step(31);
    },
    /** The prop as the game does it: live only while its objective is current and its `when` holds. */
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
    started: (id: string) => dialogue.started.some(([d]) => d === id),
    recheck: () => (manager as unknown as { recheck(): void }).recheck(),
    snapshot: (): string => JSON.stringify({ q: manager.serialize(), s: state.serialize() }),
    restore: (snap: string) => {
      const d = JSON.parse(snap) as { q: unknown; s: unknown };
      manager.load(d.q); state.load(d.s);
      standing.clear();
      emit('save.loaded', {});
      r.step(2);
    },
    saveLoad: () => r.restore(r.snapshot()),
    /** Start the quest as its giver's last line does, then credit the brief. */
    begin: (q: string, giver: string) => { if (!manager.start(q)) throw new Error(`cannot start ${q} (${manager.state(q)})`); r.talk(giver); },
    /** Every quest of `ids` completed (as a save that has them done). */
    complete: (...ids: string[]) => { for (const id of ids) { manager.start(id); manager.complete(id); } },
  };
  return r;
}
export type Rig = ReturnType<typeof makeRig>;

export const NOTES = (prefix: string): string[] => HARROWMARK_A4_NOTE_LIST.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
