// A rig for the Greyfen installers: the real event bus, flag store and quest manager (all nine quests registered), with stub
// services for what a headless boot lacks (dialogue, Hathren, the deserter, the inventory). `Play` drives each quest the way
// the game does: talks and notes end dialogues, props set their used flag and give their item, spawner kills die with a tag.
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
import { GREYFEN_QUEST_LAYOUT } from '../extraAnchors';
import { GREYFEN_QUEST_DEFS } from '../greyfen.content';
import { GREYFEN_OBJECTIVE_FLAGS } from '../objectiveFlags';
import { GREYFEN_PROPS } from '../props';
import { GREYFEN_NOTE_LIST } from '../notes';
import { installArms, installGroupObjectives, installComplete } from './generic';
import { installM23, installM24, installM25, installR12 } from './early';
import { installD05, installM26, installM27, installR13, installR14 } from './late';

export type Quests = 'all' | string[];
const ANCHOR = new Map(GREYFEN_QUEST_LAYOUT.anchors.map((a) => [a.id, a]));

export interface RigOpts {
  /** Flags set before anything runs (a loaded world). */
  flags?: Record<string, boolean | number | string>;
  /** Hathren present (default) or absent. */
  hathren?: boolean;
  /** The deserter service present (default). */
  allies?: boolean;
}

export function makeRig(opts: RigOpts = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  for (const q of GREYFEN_QUEST_DEFS) manager.register(q);
  const flagsOff = installObjectiveFlags(GREYFEN_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const [k, v] of Object.entries(opts.flags ?? {})) state.setFlag(k, v);

  const dialogue = { active: false, started: [] as Array<[string, string]>, start(id: string, npc: string) { this.started.push([id, npc]); return true; } };
  services.provide('dialogue' as never, dialogue as never);

  const inv = new Map<string, number>();
  const inventory = { has: (id: string) => (inv.get(id) ?? 0) > 0, count: (id: string) => inv.get(id) ?? 0, add: (id: string, n: number) => { inv.set(id, (inv.get(id) ?? 0) + n); return n; }, remove: (id: string, n: number) => { inv.set(id, Math.max(0, (inv.get(id) ?? 0) - n)); return true; } };
  services.provide('inventory' as never, inventory as never);
  const burn: Array<[number, string]> = [];
  services.provide('spells' as never, { addBurn: (n: number, s: string) => void burn.push([n, s]) } as never);

  const hathrenCalls: string[] = [];
  if (opts.hathren !== false) services.provide('hathren' as never, { state: 'nets', netCut: (n: number) => { hathrenCalls.push(`net${n}`); return true; }, calm: () => { hathrenCalls.push('calm'); return null; }, dismiss: () => hathrenCalls.push('dismiss') } as never);
  const allies = { at: null as string | null, calls: [] as string[] };
  if (opts.allies !== false) {
    services.provide('act3Allies' as never, {
      spawnDeserter: (a: string) => { allies.calls.push(`spawn ${a}`); allies.at = a; return true; },
      despawnDeserter: () => { allies.calls.push('despawn'); allies.at = null; },
      deserter: () => (allies.at ? { actorId: 'dz', anchorId: allies.at, state: 'post' } : null),
    } as never);
  }
  const standing = new Map<string, string[]>();
  services.provide('groupStanding' as never, { standing: (id: string) => standing.get(id) ?? [], onMemberLeft: () => () => {} } as never);
  services.provide('enemies' as never, { alive: (id: string) => standing.get(id) ?? [] } as never);
  const interiors = { current: null as string | null };
  services.provide('interiors' as never, interiors as never);

  const inside = new Set<string>();
  const player = { feet: { x: 0, y: 0, z: 0 } };
  const defined: string[] = [];
  const ctx = {
    events, state, services,
    anchors: {
      find: (id: string) => { const a = ANCHOR.get(id); return a && { id, position: { x: a.x, y: 0, z: a.z }, yaw: (a.yawDeg * Math.PI) / 180 }; },
      define: (a: { id: string }) => { defined.push(a.id); return () => {}; },
    },
    triggers: { add: () => () => {}, isInside: (id: string) => inside.has(id) },
    player,
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);

  let clock = 1000;
  installArms(kit);
  installComplete(kit);
  installGroupObjectives(kit);
  installM23(kit);
  installM24(kit);
  installR12(kit);
  installM25(kit);
  installR14(kit);
  installR13(kit, () => clock);
  installM26(kit);
  installM27(kit);
  installD05(kit);

  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  const step = (n = 1): void => { for (let i = 0; i < n; i++) tick(); };
  const propById = new Map(GREYFEN_PROPS.map((p) => [p.interactableId, p]));
  const env = () => ({ state: { getFlag: (k: string) => state.getFlag(k) }, quests: { state: (q: string) => manager.state(q), objectiveDone: (q: string, o: string) => manager.objectiveDone(q, o) } }) as never;

  const r = {
    events, state, manager, kit, tick, step, emit, dialogue, inv, inventory, burn, hathrenCalls, allies, standing, interiors, inside, player, warn, defined,
    get clock() { return clock; },
    advance: (ms: number) => void (clock += ms),
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); },
    // ---- driving the quests -------------------------------------------------------------------------------------
    talk: (npcId: string, dialogueId = `npc-${npcId}`) => emit('dialogue.ended', { dialogueId, npcId, reason: 'completed' }),
    scene: (dialogueId: string, npcId: string) => emit('dialogue.ended', { dialogueId, npcId, reason: 'completed' }),
    read: (noteId: string) => emit('dialogue.ended', { dialogueId: noteId, npcId: noteId, reason: 'completed' }),
    reads: (ids: readonly string[]) => ids.forEach((id) => r.read(id)),
    kill: (kind: string, tag: string, n = 1) => { for (let i = 0; i < n; i++) emit('actor.died', { actorId: `${tag}-${kind}-${Math.random()}`, killerId: 'player', kind, team: 'hostile', level: 1, spawnTag: tag }); },
    /** The prop as the game does it: live only while its objective is current and its `when` holds; sets the used flag, gives the item, raises `interact`. */
    use: (id: string): boolean => {
      const p = propById.get(id);
      if (!p) throw new Error(`no prop ${id}`);
      if (p.objective && !(manager.state(p.objective[0]) === 'active' && manager.isObjectiveCurrent(p.objective[0], p.objective[1]))) return false;
      if (p.when && !evalCondition(p.when, env())) return false;
      if (p.usedFlag) state.setFlag(p.usedFlag, true);
      if (p.give) { inventory.add(p.give.itemId, p.give.count); emit('loot.granted', { sourceId: id, items: [{ itemId: p.give.itemId, count: p.give.count }] }); }
      emit('interact', { interactableId: id, kind: 'prop', actorId: 'player', action: 'interact' });
      return true;
    },
    propFor: (q: string, o: string): string | undefined => GREYFEN_PROPS.find((p) => p.objective?.[0] === q && p.objective?.[1] === o)?.interactableId,
    current: (q: string, o: string) => manager.isObjectiveCurrent(q, o),
    done: (q: string, o: string) => manager.objectiveDone(q, o),
    qs: (q: string) => manager.state(q),
    flag: (k: string) => state.getBool(k),
    str: (k: string) => state.getString(k),
    started: (id: string) => dialogue.started.some(([d]) => d === id),
    /** Start the quest as its giver's last line does, then credit the brief. */
    begin: (q: string, giver: string) => { if (!manager.start(q)) throw new Error(`cannot start ${q} (${manager.state(q)})`); r.talk(giver); },
  };
  return r;
}
export type Rig = ReturnType<typeof makeRig>;

export const NOTES = (prefix: string): string[] => GREYFEN_NOTE_LIST.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
