import type {
  Effect, ObjectiveDef, QuestDef, QuestRuntime, QuestState, QuestsSaveData,
} from './types';
import { QUESTS_SAVE_VERSION } from './types';
import type {
  ActorMetaPort, BusPort, ConditionEnv, EnemiesPort, InventoryPort, NpcPort, ProgressionPort, QuestActions, QuestReader,
  StatePort, TriggerPort, Unsubscribe,
} from './ports';
import { evalCondition } from './conditions';
import { createEffectRunner } from './effects';
import { creditFor, eventNames, OBJECTIVE_EVENTS } from './objectives';

export interface QuestManagerOpts {
  bus: BusPort;
  state: StatePort;
  playerId: () => string | undefined;
  actorMeta?: ActorMetaPort;
  triggers?: TriggerPort;
  progression?: () => ProgressionPort | undefined;
  inventory?: () => InventoryPort | undefined;
  npcs?: () => NpcPort | undefined;
  enemies?: () => EnemiesPort | undefined;
  warn?(m: string): void;
}

export interface ObjectiveView { def: ObjectiveDef; progress: number; done: boolean; current: boolean }

const STATES: readonly QuestState[] = ['inactive', 'active', 'completed', 'failed'];
const required = (o: ObjectiveDef): number => (o.required !== undefined && o.required > 0 ? o.required : 1);

export class QuestManager implements QuestReader, QuestActions {
  private readonly defs = new Map<string, QuestDef>();
  private readonly rt = new Map<string, QuestRuntime>();
  private readonly order: string[] = []; // active quests in start order
  private readonly unknown = new Map<string, QuestRuntime>(); // save entries of unregistered quests
  private readonly dedupe = new Map<string, Set<string>>();
  /** The version of the last loaded save, for entries applied when their quest registers late. */
  private loadedVersion = QUESTS_SAVE_VERSION;
  private readonly listeners = new Set<() => void>();
  private readonly unsubs: Unsubscribe[] = [];
  private readonly subscribed = new Set<string>();
  private readonly warned = new Set<string>();
  private disposed = false;

  constructor(private readonly opts: QuestManagerOpts) {
    for (const type of OBJECTIVE_EVENTS) this.subscribe(type);
  }

  /** One bus listener per event name, however many objectives want it. */
  private subscribe(type: string): void {
    if (this.subscribed.has(type)) return;
    this.subscribed.add(type);
    this.unsubs.push(this.opts.bus.on(type, (payload) => this.onEvent(type, payload)));
  }

  // ---- registry ----------------------------------------------------------------------------

  register(def: QuestDef): void {
    if (this.defs.has(def.id)) throw new Error(`quest "${def.id}" is already registered`);
    const seen = new Set<string>();
    for (const o of def.objectives) {
      if (seen.has(o.id)) throw new Error(`quest "${def.id}" has duplicate objective id "${o.id}"`);
      seen.add(o.id);
    }
    const copy = JSON.parse(JSON.stringify(def)) as QuestDef;
    for (const o of copy.objectives) for (const name of eventNames(o)) this.subscribe(name);
    this.defs.set(copy.id, copy);
    const rt: QuestRuntime = { state: 'inactive', objectives: {} };
    this.rt.set(copy.id, rt);
    const saved = this.unknown.get(copy.id);
    if (saved) {
      this.unknown.delete(copy.id);
      this.applyEntry(copy, rt, saved, this.loadedVersion);
      if (rt.state === 'active') this.order.push(copy.id);
      this.notify();
    }
  }

  get(id: string): QuestDef | undefined { return this.defs.get(id); }

  state(id: string): QuestState {
    const rt = this.rt.get(id);
    if (rt) return rt.state;
    this.warnOnce(`unknown-quest:${id}`, `quests: unknown quest "${id}" reads as inactive`);
    return 'inactive';
  }

  active(): string[] { return [...this.order]; }

  objectives(id: string): ObjectiveView[] {
    const def = this.defs.get(id);
    if (!def) return [];
    return def.objectives.map((o) => ({
      def: o,
      progress: this.progress(id, o),
      done: this.objectiveDone(id, o.id),
      current: this.isObjectiveCurrent(id, o.id),
    }));
  }

  objectiveDone(questId: string, objectiveId: string): boolean {
    const o = this.defs.get(questId)?.objectives.find((x) => x.id === objectiveId);
    return !!o && this.progress(questId, o) >= required(o);
  }

  isObjectiveCurrent(questId: string, objectiveId: string): boolean {
    const def = this.defs.get(questId);
    const rt = this.rt.get(questId);
    if (!def || !rt || rt.state !== 'active') return false;
    const o = def.objectives.find((x) => x.id === objectiveId);
    if (!o || this.objectiveDone(questId, objectiveId)) return false;
    if (def.sequential) {
      const first = def.objectives.find((x) => !x.optional && !this.objectiveDone(questId, x.id));
      if (first?.id !== o.id) return false;
    }
    return this.whenHolds(o);
  }

  onChange(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ---- transitions -------------------------------------------------------------------------

  start(id: string): boolean {
    const def = this.defs.get(id);
    const rt = this.rt.get(id);
    if (!def || !rt) {
      this.warnOnce(`start-unknown:${id}`, `quests: cannot start unknown quest "${id}"`);
      return false;
    }
    if (rt.state !== 'inactive') return false;
    if (!this.startAllowed(def)) { this.warnOnce(`start-gated:${id}`, `quests: start of "${id}" refused by its startWhen`); return false; }
    rt.state = 'active';
    rt.objectives = {};
    for (const o of def.objectives) this.dedupe.delete(this.dkey(id, o.id));
    this.order.push(id);
    this.emit('quest.started', { questId: id });
    this.notify();
    this.runEffects(def.onStart, id);
    this.creditInside(id);
    return true;
  }

  complete(id: string): boolean {
    const def = this.defs.get(id);
    const rt = this.rt.get(id);
    // active -> completed, or inactive -> completed (a skipped beat); completed/failed are no-ops
    if (!def || !rt || (rt.state !== 'active' && rt.state !== 'inactive')) return false;
    if (rt.state === 'inactive' && !this.startAllowed(def)) return false;
    rt.state = 'completed'; // before effects: a re-entrant complete is a no-op
    this.removeActive(id);
    this.runEffects(def.onComplete, id);
    this.runEffects(def.rewards, id);
    this.emit('quest.completed', { questId: id });
    this.notify();
    return true;
  }

  fail(id: string): boolean {
    const rt = this.rt.get(id);
    if (!rt || rt.state !== 'active') return false;
    rt.state = 'failed';
    this.removeActive(id);
    this.emit('quest.failed', { questId: id });
    this.notify();
    return true;
  }

  completeObjective(questId: string, objectiveId: string): boolean {
    const def = this.defs.get(questId);
    const rt = this.rt.get(questId);
    if (!def || !rt || rt.state !== 'active') return false;
    const o = def.objectives.find((x) => x.id === objectiveId);
    if (!o) return false;
    return this.setProgress(questId, o, required(o));
  }

  // ---- persistence -------------------------------------------------------------------------

  serialize(): QuestsSaveData {
    const quests: Record<string, QuestRuntime> = {};
    const put = (id: string, rt: QuestRuntime) => {
      quests[id] = { state: rt.state, objectives: { ...rt.objectives } };
    };
    for (const id of this.order) put(id, this.rt.get(id)!);
    for (const [id, rt] of this.rt) if (rt.state !== 'inactive' && !(id in quests)) put(id, rt);
    for (const [id, rt] of this.unknown) put(id, rt);
    const dedupe: Record<string, Record<string, string[]>> = {};
    for (const id of this.order) {
      for (const o of this.defs.get(id)?.objectives ?? []) {
        const keys = this.dedupe.get(this.dkey(id, o.id));
        if (keys && keys.size > 0) (dedupe[id] ??= {})[o.id] = [...keys];
      }
    }
    return Object.keys(dedupe).length > 0 ? { quests, dedupe } : { quests };
  }

  /** `version` is the Persistable's (default: current); below 2, `legacyRequired` counts are honoured. */
  load(data: unknown, version: number = QUESTS_SAVE_VERSION): void {
    this.loadedVersion = version;
    this.order.length = 0;
    this.unknown.clear();
    this.dedupe.clear();
    for (const rt of this.rt.values()) { rt.state = 'inactive'; rt.objectives = {}; }
    const quests = (data as { quests?: unknown } | null | undefined)?.quests;
    if (typeof quests !== 'object' || quests === null || Array.isArray(quests)) {
      if (data !== null && data !== undefined) this.warn('quests: save data has no usable "quests" map; starting empty');
      this.notify();
      return;
    }
    for (const [id, raw] of Object.entries(quests as Record<string, unknown>)) {
      const r = raw as { state?: unknown; objectives?: unknown } | null;
      if (typeof r !== 'object' || r === null || !STATES.includes(r.state as QuestState)) {
        this.warn(`quests: dropped save entry "${id}" with a bad state`);
        continue;
      }
      const entry: QuestRuntime = { state: r.state as QuestState, objectives: {} };
      const objs = r.objectives;
      if (typeof objs === 'object' && objs !== null && !Array.isArray(objs)) {
        for (const [oid, v] of Object.entries(objs as Record<string, unknown>)) {
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            this.warn(`quests: dropped non-finite progress for "${id}.${oid}"`);
            continue;
          }
          entry.objectives[oid] = Math.max(0, v);
        }
      }
      const def = this.defs.get(id);
      const rt = this.rt.get(id);
      if (def && rt) {
        this.applyEntry(def, rt, entry, version);
        if (rt.state === 'active') this.order.push(id);
      } else {
        this.unknown.set(id, entry);
      }
    }
    this.loadDedupe((data as { dedupe?: unknown }).dedupe);
    this.notify();
    for (const id of [...this.order]) {
      // doneWhen reads flags, which may not have loaded yet: `recheck()` on save.loaded credits those
      if (this.rt.get(id)?.state === 'active') this.creditInside(id, false);
    }
  }

  /** Credits objectives the world already satisfies (goTo inside a trigger, doneWhen); call after a save loaded. */
  recheck(): void {
    for (const id of [...this.order]) if (this.rt.get(id)?.state === 'active') this.creditInside(id);
  }

  dispose(): void {
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) { try { u(); } catch { /* ignore */ } }
    this.listeners.clear();
  }

  // ---- internals ---------------------------------------------------------------------------

  private applyEntry(def: QuestDef, rt: QuestRuntime, entry: QuestRuntime, version: number): void {
    rt.state = entry.state;
    rt.objectives = {};
    for (const o of def.objectives) {
      const v = entry.objectives[o.id];
      if (v === undefined) continue;
      if (v > required(o)) this.warn(`quests: clamped progress of "${def.id}.${o.id}" to ${required(o)}`);
      const legacyDone = version < 2 && o.legacyRequired !== undefined && v >= o.legacyRequired;
      rt.objectives[o.id] = legacyDone ? required(o) : Math.min(v, required(o));
    }
    if (rt.state === 'active') this.migrateEntry(def, rt, entry);
  }

  /** Restores saved dedupe keys for active quests' registered objectives; anything malformed is dropped. */
  private loadDedupe(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
    for (const [qid, perObj] of Object.entries(raw as Record<string, unknown>)) {
      if (this.rt.get(qid)?.state !== 'active' || typeof perObj !== 'object' || perObj === null) continue;
      for (const [oid, keys] of Object.entries(perObj as Record<string, unknown>)) {
        if (!this.defs.get(qid)?.objectives.some((o) => o.id === oid) || !Array.isArray(keys)) continue;
        const set = new Set(keys.filter((k): k is string => typeof k === 'string'));
        if (set.size > 0) this.dedupe.set(this.dkey(qid, oid), set);
      }
    }
  }

  /**
   * A save made before objectives were added or a `required` grew (the Act 1 density pass): in a sequential quest a
   * later objective (array order) with progress means the player is past every earlier one, so each earlier objective
   * short of its count is credited in full and nobody is sent back. Unordered quests are left as saved.
   */
  private migrateEntry(def: QuestDef, rt: QuestRuntime, entry: QuestRuntime): void {
    if (!def.sequential) return;
    const objs = def.objectives;
    const laterStarted = (i: number): boolean => objs.slice(i + 1).some((x) => (entry.objectives[x.id] ?? 0) > 0);
    objs.forEach((o, i) => {
      if ((entry.objectives[o.id] ?? 0) < required(o) && laterStarted(i)) rt.objectives[o.id] = required(o);
    });
  }

  private progress(questId: string, o: ObjectiveDef): number {
    return this.rt.get(questId)?.objectives[o.id] ?? 0;
  }

  private dkey(q: string, o: string): string { return `${q}\u0000${o}`; }

  private removeActive(id: string): void {
    const i = this.order.indexOf(id);
    if (i >= 0) this.order.splice(i, 1);
  }

  private startAllowed(def: QuestDef): boolean {
    if (!def.startWhen) return true;
    return evalCondition(def.startWhen, this.condEnv());
  }

  private condEnv(): ConditionEnv {
    return { state: this.opts.state, quests: this, gold: () => this.opts.inventory?.()?.gold, warn: this.opts.warn };
  }

  private whenHolds(o: ObjectiveDef): boolean {
    if (!o.when && !o.startWhen) return true;
    const env = this.condEnv();
    try { return evalCondition(o.when, env) && evalCondition(o.startWhen, env); } catch (e) {
      this.warn(`quests: objective condition threw: ${String(e)}`);
      return false;
    }
  }

  private onEvent(type: string, payload: unknown): void {
    if (this.disposed) return;
    const ctx = { playerId: this.opts.playerId(), actorMeta: this.opts.actorMeta };
    for (const qid of [...this.order]) {
      try {
        const def = this.defs.get(qid);
        if (!def) continue;
        for (const o of def.objectives) {
          if (!this.isObjectiveCurrent(qid, o.id)) continue;
          const credit = creditFor(o, type, payload, ctx);
          if (!credit) continue;
          if (credit.dedupeKey !== undefined) {
            const set = this.dedupe.get(this.dkey(qid, o.id)) ?? new Set<string>();
            if (set.has(credit.dedupeKey)) continue;
            set.add(credit.dedupeKey);
            this.dedupe.set(this.dkey(qid, o.id), set);
          }
          this.setProgress(qid, o, this.progress(qid, o) + credit.amount);
          if (def.sequential) break; // the next objective's turn starts after this event
        }
      } catch (e) {
        this.warn(`quests: error crediting "${qid}" on ${type}: ${String(e)}`);
      }
    }
  }

  /** Set progress (clamped); emits, may complete the quest, then credits goTo objectives already satisfied. */
  private setProgress(questId: string, o: ObjectiveDef, value: number): boolean {
    const rt = this.rt.get(questId)!;
    const req = required(o);
    const next = Math.min(req, Math.max(0, value));
    const prev = rt.objectives[o.id] ?? 0;
    if (next === prev) return false;
    rt.objectives[o.id] = next;
    this.emit('quest.objective', {
      questId, objectiveId: o.id, progress: next, required: req, done: next >= req,
    });
    this.notify();
    const def = this.defs.get(questId)!;
    if (def.objectives.every((x) => x.optional || this.objectiveDone(questId, x.id))) {
      this.complete(questId);
    } else {
      this.creditInside(questId);
    }
    return true;
  }

  /**
   * Objectives that just became current are credited when the world already satisfies them: goTo while the
   * player stands in the trigger, event objectives whose `doneWhen` holds (the event may have fired earlier).
   */
  private creditInside(questId: string, doneWhen = true): void {
    const triggers = this.opts.triggers;
    const player = this.opts.playerId();
    const def = this.defs.get(questId);
    if (!def) return;
    for (const o of def.objectives) {
      if (!this.isObjectiveCurrent(questId, o.id)) continue;
      if (o.type === 'event' && o.doneWhen) {
        if (!doneWhen) continue;
        const env = this.condEnv();
        let done = false;
        try { done = evalCondition(o.doneWhen, env); } catch (e) { this.warn(`quests: doneWhen threw: ${String(e)}`); }
        if (done) {
          this.setProgress(questId, o, required(o));
          return; // setProgress re-enters creditInside for whatever became current
        }
        continue;
      }
      if (o.type !== 'goTo') continue;
      if (!triggers) {
        this.warnOnce('no-trigger-port', 'quests: no TriggerPort; goTo objectives cannot detect an already-inside player');
        continue;
      }
      if (player === undefined) continue;
      let inside = false;
      try { inside = triggers.isInside(o.target as string, player); } catch (e) { this.warn(`quests: isInside threw: ${String(e)}`); }
      if (inside) {
        this.setProgress(questId, o, this.progress(questId, o) + 1);
        return;
      }
    }
  }

  private runEffects(effects: Effect[] | undefined, questId: string): void {
    if (!effects || effects.length === 0) return;
    try {
      const runner = createEffectRunner({
        state: this.opts.state,
        quests: this,
        bus: this.opts.bus,
        progression: this.opts.progression,
        inventory: this.opts.inventory,
        npcs: this.opts.npcs,
        enemies: this.opts.enemies,
        sourceId: `quest:${questId}`,
        warn: this.opts.warn,
      });
      runner.run(effects);
    } catch (e) {
      this.warn(`quests: effects threw: ${String(e)}`);
    }
  }

  private emit(type: string, payload: unknown): void {
    try { this.opts.bus.emit(type, payload); } catch (e) { this.warn(`quests: listener for ${type} threw: ${String(e)}`); }
  }

  private notify(): void {
    for (const l of [...this.listeners]) {
      try { l(); } catch (e) { this.warn(`quests: onChange listener threw: ${String(e)}`); }
    }
  }

  private warn(m: string): void { this.opts.warn?.(m); }
  private warnOnce(key: string, m: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(m);
  }
}
