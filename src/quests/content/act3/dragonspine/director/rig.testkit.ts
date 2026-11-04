// A rig for the lower Dragonspine installers: the real event bus, flag store and quest manager (all seven quests registered), K7's
// real CarryResets and Sleds behind a `carry` service, K9's real WaysideShrines, and stubs for what a headless boot lacks
// (dialogue, the inventory, the enemies service). `Play` (autoplay.testkit.ts) drives each quest the way the game does.
import { vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { dragonspineBuild } from '../../../../../dragonspine/layout';
import { heightAt } from '../../../../../terrain/heightfield';
import { WorldState } from '../../../../../state/WorldState';
import { FlagGates } from '../../../../../state/FlagGates';
import { WaysideShrines } from '../../../../../shrine/act3/wayside';
import { CarryResets, type CarryResetPorts } from '../../../../../traversal/carry/CarryResets';
import { Sleds } from '../../../../../traversal/carry/Sleds';
import { QuestManager } from '../../../../QuestManager';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { evalCondition } from '../../../../conditions';
import { makeKit, type Off } from '../../../act2/director/kit';
import { DRAGONSPINE_QUEST_DEFS } from '../dragonspine.content';
import { DRAGONSPINE_OBJECTIVE_FLAGS } from '../objectiveFlags';
import { DRAGONSPINE_PROPS } from '../props';
import { DRAGONSPINE_NOTE_LIST } from '../notes';
import { installArms, installComplete, installGroupObjectives } from './generic';
import { installM28, installM29, installM30, installR15, installR16 } from './climb';
import { installR17 } from './candles';
import { installR18 } from './eggs';
import { M28_OPEN_FLAG } from '../m28.quest';

const ANCHORS = new Map(dragonspineBuild().layout.anchors.map((a) => [a.id, a]));
export const anchorPos = (id: string): { x: number; y: number; z: number } => {
  const a = ANCHORS.get(id);
  if (!a) throw new Error(`no anchor ${id}`);
  return { x: a.x, y: heightAt(a.x, a.z) + (a.dy ?? 0), z: a.z };
};

export interface RigOpts {
  /** `story.phase.dragonspineOpen` (M28 waits for it as well as the Act 3 gate): default true. */
  dragonspineOpen?: boolean;
  /** Flags set before anything runs (a loaded world). */
  flags?: Record<string, boolean | number | string>;
  /** Leave the carry service out. */
  noCarry?: boolean;
}

export function makeRig(opts: RigOpts = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  for (const q of DRAGONSPINE_QUEST_DEFS) manager.register(q);
  const flagsOff = installObjectiveFlags(DRAGONSPINE_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const [k, v] of Object.entries(opts.flags ?? {})) state.setFlag(k, v);
  if (opts.dragonspineOpen !== false) state.setFlag(M28_OPEN_FLAG, true);

  const dialogue = { active: false, started: [] as Array<[string, string]>, start(id: string, npc: string) { this.started.push([id, npc]); return true; } };
  services.provide('dialogue' as never, dialogue as never);

  const inv = new Map<string, number>();
  const inventory = {
    has: (id: string) => (inv.get(id) ?? 0) > 0, count: (id: string) => inv.get(id) ?? 0,
    add: (id: string, n: number) => { inv.set(id, (inv.get(id) ?? 0) + n); return n; },
    remove: (id: string, n: number) => { inv.set(id, Math.max(0, (inv.get(id) ?? 0) - n)); return true; },
  };
  services.provide('inventory' as never, inventory as never);

  const standing = new Map<string, string[]>();
  services.provide('groupStanding' as never, { standing: (id: string) => standing.get(id) ?? [], onMemberLeft: () => () => {} } as never);
  const enemyCalls: string[] = [];
  services.provide('enemies' as never, {
    alive: (id: string) => standing.get(id) ?? [],
    spawnGroup: (id: string) => { enemyCalls.push(`spawn ${id}`); return []; },
    despawnGroup: (id: string) => void enemyCalls.push(`despawn ${id}`),
    reset: (id: string) => void enemyCalls.push(`reset ${id}`),
  } as never);

  const player = { feet: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const faded: number[] = [];
  const modes = { mode: 'walk' as 'walk' | 'haul' };
  const shown = new Map<string, { x: number; y: number; z: number }>();
  /** What the carry reset reads: deep water, the closed area, and how far below the ground the carried thing sits. */
  const carryEnv = { deep: false, open: true, drop: 0 };
  const resetPorts: CarryResetPorts = {
    deepAt: () => carryEnv.deep,
    isOpen: () => carryEnv.open,
    playerFeet: () => player.feet,
    fade: (o) => void faded.push(o),
    emit: (type, p) => void events.emit(type as never, p as never),
    movementMode: () => modes.mode,
    setMovementMode: (m) => void (modes.mode = m as never),
    warn: () => {},
  };
  const resets = new CarryResets(resetPorts);
  const sleds = new Sleds({
    feet: () => player.feet, yaw: () => player.yaw, groundAt: (x, z) => heightAt(x, z) - carryEnv.drop, addModifier: () => () => {},
    show: (id, p) => void shown.set(id, { ...p }), hide: (id) => void shown.delete(id),
    emit: (type, p) => void events.emit(type as never, p as never),
  }, resets);
  const carry = {
    addSled: (d: Parameters<Sleds['add']>[0]) => sleds.add(d),
    track: (t: Parameters<CarryResets['track']>[0]) => resets.track(t),
    reset: (id: string) => resets.reset(id, 'asked'),
    checkpoint: (id: string) => resets.checkpoint(id),
    get heldSled() { return sleds.held; },
  };
  // Thorgar's "reset haul" (a dialogue event effect): K7 resets the named carry
  events.on('npc.carry.resetHaul' as never, ((e: { id: string }) => void carry.reset(e.id)) as never);
  const gates = new FlagGates(state, events as never, () => {});
  if (!opts.noCarry) services.provide('carry' as never, carry as never);

  const wayside = new WaysideShrines({
    getBool: (k) => state.getBool(k), setFlag: (k, v) => void state.setFlag(k, v), questState: (id) => manager.state(id),
    emitLit: (index) => void events.emit('wayside.lit' as never, { index } as never), warn: () => {},
  });
  services.provide('waysideShrines' as never, wayside as never);

  const toasts: string[] = [];
  events.on('hud.toast' as never, ((e: { textKey: string }) => void toasts.push(e.textKey)) as never);

  const inside = new Set<string>();
  const registered = new Map<string, { enabled(): boolean; onInteract(): void; position(out: { x: number; y: number; z: number }): unknown }>();
  const camera = { shots: [] as unknown[], released: 0 };
  const ctx = {
    events, state, services,
    anchors: {
      find: (id: string) => { const a = ANCHORS.get(id); return a && { id, position: anchorPos(id), yaw: (a.yawDeg * Math.PI) / 180 }; },
      define: () => () => {},
    },
    triggers: { add: () => () => {}, isInside: (id: string) => inside.has(id) },
    player,
    interaction: { register: (i: { id: string }) => { registered.set(i.id, i as never); return () => void registered.delete(i.id); } },
    cameraRig: { override: (s: unknown) => { camera.shots.push(s); return { active: true, release: () => void camera.released++ }; } },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);

  installArms(kit);
  installComplete(kit);
  installGroupObjectives(kit);
  installM28(kit);
  installR15(kit);
  installM29(kit);
  installR16(kit);
  installM30(kit);
  offs.push(installR17(kit));
  offs.push(installR18(kit));

  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  const step = (n = 1): void => { for (let i = 0; i < n; i++) tick(); };
  /** Seconds of K7's fixed update (the carry reset checks every half second). */
  const carrySeconds = (s: number): void => { for (let i = 0; i < Math.round(s * 60); i++) { sleds.fixedUpdate(); resets.fixedUpdate(1 / 60); } };
  const propById = new Map(DRAGONSPINE_PROPS.map((p) => [p.interactableId, p]));
  const env = () => ({ state: { getFlag: (k: string) => state.getFlag(k) }, quests: { state: (q: string) => manager.state(q), objectiveDone: (q: string, o: string) => manager.objectiveDone(q, o) } }) as never;

  const r = {
    events, state, manager, kit, tick, step, emit, dialogue, inv, inventory, standing, enemyCalls, player, warn, toasts, inside, registered, camera,
    carry, resets, sleds, wayside, shown, faded, carrySeconds, ctx, env: carryEnv, gates,
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); },
    at: (anchorId: string) => { const p = anchorPos(anchorId); player.feet = { ...p }; return p; },
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
      if (p.usedFlag && state.getFlag(p.usedFlag) === true) return false;
      if (p.usedFlag) state.setFlag(p.usedFlag, true);
      if (p.give) { inventory.add(p.give.itemId, p.give.count); emit('loot.granted', { sourceId: id, items: [{ itemId: p.give.itemId, count: p.give.count }] }); }
      emit('interact', { interactableId: id, kind: 'prop', actorId: 'player', action: 'interact' });
      return true;
    },
    propFor: (q: string, o: string): string | undefined => DRAGONSPINE_PROPS.find((p) => p.objective?.[0] === q && p.objective?.[1] === o)?.interactableId,
    current: (q: string, o: string) => manager.isObjectiveCurrent(q, o),
    done: (q: string, o: string) => manager.objectiveDone(q, o),
    qs: (q: string) => manager.state(q),
    flag: (k: string) => state.getBool(k),
    str: (k: string) => state.getString(k),
    num: (k: string) => state.getNumber(k),
    started: (id: string) => dialogue.started.some(([d]) => d === id),
    /** What a save writes (as JSON text): the quests, the flags, the carry progress, the sleds and the inventory. */
    snapshot: (): string => JSON.stringify({ q: manager.serialize(), s: state.serialize(), c: resets.serialize(), sl: sleds.serialize(), inv: [...inv] }),
    /** A load of `snap` (the state replaces this rig's, listeners hear `save.loaded`). */
    restore: (snap: string) => {
      const d = JSON.parse(snap) as { q: unknown; s: unknown; c: unknown; sl: unknown; inv: [string, number][] };
      manager.load(d.q); state.load(d.s); resets.load(d.c); sleds.load(d.sl);
      inv.clear(); for (const [k, v] of d.inv) inv.set(k, v);
      standing.clear();
      emit('save.loaded', {});
      r.step(2);
    },
    /** Save and load in place. */
    saveLoad: () => r.restore(r.snapshot()),
    /** Start the quest as its giver's last line does, then credit the brief. */
    begin: (q: string, giver: string) => { if (!manager.start(q)) throw new Error(`cannot start ${q} (${manager.state(q)})`); r.talk(giver); },
  };
  return r;
}
export type Rig = ReturnType<typeof makeRig>;

export const NOTES = (prefix: string): string[] => DRAGONSPINE_NOTE_LIST.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
