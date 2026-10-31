// A rig for the summit installers: the real event bus, flag store and quest manager (the five summit quests plus stubs for the quests they wait on),
// and stubs for what a headless boot lacks (dialogue, inventory, the enemies and groupStanding services, Ysmeryth, the trials, the spells and the
// movement services). `autoplay.testkit.ts` drives each quest the way the game does.
import * as THREE from 'three';
import { vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { dragonspineBuild } from '../../../../../dragonspine/layout';
import { heightAt } from '../../../../../terrain/heightfield';
import { WorldState } from '../../../../../state/WorldState';
import { QuestManager } from '../../../../QuestManager';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { evalCondition } from '../../../../conditions';
import { makeKit, type Off } from '../../../act2/director/kit';
import type { QuestDef } from '../../../../types';
import { SUMMIT_QUEST_DEFS } from '../summit.content';
import { SUMMIT_OBJECTIVE_FLAGS } from '../objectiveFlags';
import { SUMMIT_PROPS } from '../props';
import { SUMMIT_NOTE_LIST } from '../notes';
import { SUMMIT_ARMS } from '../arms';
import { SUMMIT_GROUP_OBJECTIVES } from '../groups';
import { installArms, installGroupObjectives } from '../../dragonspine/director/generic';
import { installSummitComplete } from './complete';
import { installM31 } from './trial';
import { installM32 } from './reveal';
import { installM33 } from './net';
import { installM34 } from './oath';
import { installD06 } from './aerie';

/** The quests the summit waits on (the lower block, Greyfen and the side quests): stubs that are completed in a real game by their own owners. */
export const PREREQS = ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'm28', 'm29', 'm30', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18'] as const;
const stub = (id: string): QuestDef => ({ id, titleKey: `stub.${id}`, summaryKey: `stub.${id}`, objectives: [{ id: 'x', type: 'talk', target: 'stub', textKey: 'stub' }] });

const ANCHORS = new Map(dragonspineBuild().layout.anchors.map((a) => [a.id, a]));
export const anchorPos = (id: string): { x: number; y: number; z: number } => {
  const a = ANCHORS.get(id);
  if (!a) throw new Error(`no anchor ${id}`);
  return { x: a.x, y: heightAt(a.x, a.z) + (a.dy ?? 0), z: a.z };
};

export interface RigOpts {
  /** Flags set before anything runs (a loaded world). */
  flags?: Record<string, boolean | number | string>;
  /** Which of the prerequisite stubs are completed (default: all of them). */
  prereqs?: readonly string[];
  /** Leave Ysmeryth, the trials or the spells service out. */
  noYsmeryth?: boolean;
  noSpells?: boolean;
  /** Use no cameraRig / no interaction registry. */
  noCamera?: boolean;
  /** No scene (the flight is only a camera hold). */
  noScene?: boolean;
}

export function makeRig(opts: RigOpts = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  for (const id of PREREQS) manager.register(stub(id));
  for (const q of SUMMIT_QUEST_DEFS) manager.register(q);
  const flagsOff = installObjectiveFlags(SUMMIT_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const [k, v] of Object.entries(opts.flags ?? {})) state.setFlag(k, v);
  for (const id of opts.prereqs ?? PREREQS) manager.complete(id);

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
  services.provide('enemies' as never, { alive: (id: string) => standing.get(id) ?? [], spawnGroup: () => [], despawnGroup: () => {}, reset: () => {} } as never);

  // Ysmeryth (K6a) and the trials (K0): the trial is "running" between a begin and an end the test (or the real Trials) causes.
  const ys = {
    begins: 0, ends: 0, falseStarts: 0, poses: [] as string[], running: false, actorId: null as string | null, airborne: false, scenePose: null as string | null,
    beginTrial(): boolean {
      if (this.falseStarts > 0) { this.falseStarts--; return false; }
      this.begins++;
      this.running = true;
      return true;
    },
    endTrial(): void { this.ends++; this.running = false; },
    pose(p: string): boolean { this.poses.push(p); this.scenePose = p; return true; },
    hide(): void { this.scenePose = null; },
  };
  const trials = { state: () => (ys.running ? { id: 'ysmeryth-trial', player: 0, opponent: 0, breaksToWin: 3 } : null) };
  if (!opts.noYsmeryth) { services.provide('ysmeryth' as never, ys as never); services.provide('trials' as never, trials as never); }
  const spellCalls = { surge: [] as Array<[number, string]>, decay: null as (() => number) | null };
  const spells = {
    addSurgeCharges: (n: number, source: string) => { spellCalls.surge.push([n, source]); return n; },
    setBurnDecayScale: (fn: () => number) => { spellCalls.decay = fn; return () => { if (spellCalls.decay === fn) spellCalls.decay = null; }; },
  };
  if (!opts.noSpells) services.provide('spells' as never, spells as never);
  const movement = { current: 'walk' as 'walk' | 'glide' | 'ferry' | 'dive' | 'haul' };
  services.provide('movementMode' as never, movement as never);
  const mount = { on: false, mounted: () => mount.on };
  services.provide('mount' as never, mount as never);

  const player = { feet: { x: 0, y: 0, z: 0 }, yaw: 0, moving: false };
  const toasts: string[] = [];
  events.on('hud.toast' as never, ((e: { textKey: string }) => void toasts.push(e.textKey)) as never);
  const inside = new Set<string>();
  const registered = new Map<string, { enabled(): boolean; onInteract(): void; position(out: { x: number; y: number; z: number }): unknown }>();
  const camera = { shots: [] as unknown[], released: 0 };
  const scene = new THREE.Scene();
  const defined = new Map<string, { id: string; position: { x: number; y: number; z: number }; yaw: number }>();
  const ctx = {
    events, state, services,
    scene: opts.noScene ? undefined : scene,
    anchors: {
      find: (id: string) => { const d = defined.get(id); if (d) return d; const a = ANCHORS.get(id); return a && { id, position: anchorPos(id), yaw: (a.yawDeg * Math.PI) / 180 }; },
      define: (a: { id: string; position: { x: number; y: number; z: number }; yaw: number }) => { defined.set(a.id, a); return () => void defined.delete(a.id); },
    },
    triggers: { add: () => () => {}, isInside: (id: string) => inside.has(id) },
    player,
    interaction: { register: (i: { id: string }) => { registered.set(i.id, i as never); return () => void registered.delete(i.id); } },
    cameraRig: opts.noCamera ? null : { override: (s: unknown) => { camera.shots.push(s); return { active: true, release: () => void camera.released++ }; } },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);

  installArms(kit, SUMMIT_ARMS);
  installGroupObjectives(kit, SUMMIT_GROUP_OBJECTIVES);
  installSummitComplete(kit);
  installM31(kit);
  offs.push(installM32(kit));
  offs.push(installM33(kit));
  installM34(kit);
  offs.push(installD06(kit));

  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  const step = (n = 1): void => { for (let i = 0; i < n; i++) tick(); };
  const propById = new Map(SUMMIT_PROPS.map((p) => [p.interactableId, p]));
  const env = () => ({ state: { getFlag: (k: string) => state.getFlag(k) }, quests: { state: (q: string) => manager.state(q), objectiveDone: (q: string, o: string) => manager.objectiveDone(q, o) } }) as never;

  const r = {
    events, state, manager, kit, tick, step, emit, dialogue, inv, inventory, standing, player, warn, toasts, inside, registered, camera, ctx, world: scene, ys, trials, spells, spellCalls, movement, mount, defined,
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); },
    at: (anchorId: string) => { const p = anchorPos(anchorId); player.feet = { ...p }; return p; },
    // ---- driving the quests -------------------------------------------------------------------------------------
    talk: (npcId: string, dialogueId = `npc-${npcId}`) => emit('dialogue.ended', { dialogueId, npcId, reason: 'completed' }),
    scene: (dialogueId: string, npcId: string) => emit('dialogue.ended', { dialogueId, npcId, reason: 'completed' }),
    read: (noteId: string) => emit('dialogue.ended', { dialogueId: noteId, npcId: noteId, reason: 'completed' }),
    reads: (ids: readonly string[]) => ids.forEach((id) => r.read(id)),
    /** The prop as the game does it: live only while its objective is current and its `when` holds; sets the used flag, raises `interact`. */
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
    started: (id: string) => dialogue.started.some(([d]) => d === id),
    /** What a save writes (as JSON text): the quests, the flags and the inventory. */
    snapshot: (): string => JSON.stringify({ q: manager.serialize(), s: state.serialize(), inv: [...inv] }),
    /** A load of `snap` (the state replaces this rig's, listeners hear `save.loaded`). */
    restore: (snap: string) => {
      const d = JSON.parse(snap) as { q: unknown; s: unknown; inv: [string, number][] };
      manager.load(d.q); state.load(d.s);
      inv.clear(); for (const [k, v] of d.inv) inv.set(k, v);
      standing.clear();
      ys.running = false;
      dialogue.active = false;
      emit('save.loaded', {});
      r.step(2);
    },
    saveLoad: () => r.restore(r.snapshot()),
    /** Start the quest as its giver's last line does, then credit the brief. */
    begin: (q: string, giver: string) => { if (!manager.start(q)) throw new Error(`cannot start ${q} (${manager.state(q)})`); r.talk(giver); },
  };
  return r;
}
export type Rig = ReturnType<typeof makeRig>;
export const NOTES = (prefix: string): string[] => SUMMIT_NOTE_LIST.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
