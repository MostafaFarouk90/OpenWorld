import { getItem } from '../inventory/items';
import type { BeatClock } from '../shrine/beat';
import { pickAffix } from './affixes';
import { FORGE_RECIPES, forgeCost, forgeItem, type ForgeRefusal } from './forge';
import { type Judgement, RhythmRun } from './rhythm';
import { checkTemper, firstTemperOfTier, type GearInventory, isTemperable, MATERIALS, temperCost, temperItem, tierOf, type MaterialCost, type TemperRefusal } from './tempering';
import { GEAR_TUNING } from './tuning';

export type SessionState = 'idle' | 'picking' | 'rhythm' | 'result' | 'affix-reveal';
export type SessionMode = 'anvil' | 'smith';

/** The persisted part (`gear` v1). */
export interface GearState {
  anvilTiers: number[];
  lessonRuns: number;
}

export type SessionRefusal = TemperRefusal | ForgeRefusal;

export interface ItemRow {
  id: string;
  tier: number;
  temper: number;
  affix?: string;
  equipped: boolean;
  nextCost: { gold: number; materials: MaterialCost[] } | null;
  canAfford: boolean;
  /** Why start() would be refused now, or null. */
  blockedBy: TemperRefusal | null;
  /** Anvil only: the tier 3 piece and its cost when a recipe exists. */
  forge: { to: string; gold: number; ingots: number; canAfford: boolean } | null;
}

export interface SessionResult {
  ok: boolean;
  /** A perfect Anvil run (misses never fail the temper; they only forfeit the affix). */
  perfect: boolean;
  reason?: SessionRefusal;
  level?: number;
  affix?: string;
  forged?: string;
}

export interface SessionView {
  state: SessionState;
  mode: SessionMode | null;
  items: ItemRow[];
  selected: string | null;
  gold: number;
  materials: { ore: number; coal: number; ingot: number };
  run: { steps: readonly number[]; judged: (Judgement | null)[]; strays: number; position: number } | null;
  /** The affix waiting on keep or replace, or the one just revealed. */
  affix: { affix: string; existing?: string; choice: boolean } | null;
  lastResult: SessionResult | null;
  /** The next anvil temper is a lesson run and costs nothing. */
  free: boolean;
}

export interface SessionPorts {
  inventory: GearInventory;
  state: GearState;
  now(): number;
  makeClock(): BeatClock;
  anvilUsable(): boolean;
  smithUsable(): boolean;
  /** M14 is active. */
  lessonActive(): boolean;
  emitTempered(p: { itemId: string; level: number; affix?: string }): void;
}

/** What A15 draws and drives (R5). `setScreen` in the plugin swaps the drawing, never this. */
export interface TemperingSession {
  readonly state: SessionState;
  open(mode: SessionMode): boolean;
  view(): SessionView;
  select(id: string): void;
  start(): void;
  strike(tMs?: number): void;
  /** Advances the run clock; the plugin calls it every tick. */
  update(tMs?: number): void;
  confirm(): void;
  keepAffix(): void;
  replaceAffix(): void;
  forge(id: string): void;
  close(): void;
  subscribe(fn: () => void): () => void;
}

export function createTemperingSession(ports: SessionPorts): TemperingSession {
  const inv = ports.inventory;
  let state: SessionState = 'idle';
  let mode: SessionMode | null = null;
  let selected: string | null = null;
  let run: RhythmRun | null = null;
  let pending: { affix: string; existing?: string; choice: boolean } | null = null;
  let perfect = false;
  let lastResult: SessionResult | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((f) => f());
  const go = (s: SessionState): void => {
    state = s;
    notify();
  };

  const free = (): boolean => mode === 'anvil' && ports.lessonActive() && ports.state.lessonRuns < GEAR_TUNING.lessonRuns;
  const blocked = (id: string): TemperRefusal | null => {
    if (mode === 'anvil' ? !ports.anvilUsable() : !ports.smithUsable()) return 'locked';
    if (mode === 'smith' && firstTemperOfTier(ports.state.anvilTiers, tierOf(getItem(id)))) return 'anvil-first';
    return checkTemper(inv, id, { free: free() });
  };

  /** Pays, tempers, emits, and records the Anvil's own state. */
  const apply = (id: string, affix: string | undefined): void => {
    const wasFree = free();
    const r = temperItem(inv, id, { free: wasFree, affix });
    if (!r.ok) {
      lastResult = { ok: false, perfect, reason: r.reason };
      return go('result');
    }
    if (mode === 'anvil') {
      const tier = tierOf(getItem(id));
      if (!ports.state.anvilTiers.includes(tier)) ports.state.anvilTiers.push(tier);
      if (wasFree) ports.state.lessonRuns++;
    }
    ports.emitTempered(r.affix ? { itemId: id, level: r.level, affix: r.affix } : { itemId: id, level: r.level });
    lastResult = { ok: true, perfect, level: r.level, ...(r.affix ? { affix: r.affix } : {}) };
    if (r.affix) {
      pending = { affix: r.affix, choice: false };
      return go('affix-reveal');
    }
    go('result');
  };

  const finishRun = (tMs: number): void => {
    if (!run || !selected) return;
    const res = run.result(tMs);
    perfect = res.perfect;
    run = null;
    // Only a perfect run earns an affix, and only at the Anvil.
    const affix = res.perfect ? pickAffix(selected, inv.gear(selected).temper + 1) : undefined;
    const existing = inv.gear(selected).affix;
    if (affix && existing && existing !== affix) {
      pending = { affix, existing, choice: true };
      return go('affix-reveal');
    }
    apply(selected, affix);
  };

  const self: TemperingSession = {
    get state() {
      return state;
    },
    open(m) {
      if (state !== 'idle') return false;
      if (m === 'anvil' ? !ports.anvilUsable() : !ports.smithUsable()) return false;
      mode = m;
      selected = null;
      lastResult = null;
      go('picking');
      return true;
    },
    view() {
      const t = ports.now();
      const rows: ItemRow[] = [];
      if (state !== 'idle') {
        for (const { id } of inv.items()) {
          const def = getItem(id);
          if (!isTemperable(def)) continue;
          const g = inv.gear(id);
          const cost = temperCost(tierOf(def), g.temper + 1);
          const fc = mode === 'anvil' ? forgeCost(id) : null;
          const why = blocked(id);
          rows.push({
            id,
            tier: tierOf(def),
            temper: g.temper,
            ...(g.affix ? { affix: g.affix } : {}),
            equipped: inv.equipped(def.slot!) === id,
            nextCost: cost,
            canAfford: why !== 'no-gold' && why !== 'no-materials',
            blockedBy: why,
            forge: fc ? { to: FORGE_RECIPES[id], gold: fc.gold, ingots: fc.ingots, canAfford: inv.gold >= fc.gold && inv.count(MATERIALS.ingot) >= fc.ingots } : null,
          });
        }
      }
      return {
        state,
        mode,
        items: rows,
        selected,
        gold: inv.gold,
        materials: { ore: inv.count(MATERIALS.ore), coal: inv.count(MATERIALS.coal), ingot: inv.count(MATERIALS.ingot) },
        run: run ? { steps: run.steps, judged: run.judged(t), strays: run.strays, position: run.position(t) } : null,
        affix: pending,
        lastResult,
        free: state !== 'idle' && free(),
      };
    },
    select(id) {
      if (state !== 'picking') return;
      if (isTemperable(getItem(id)) && inv.has(id)) selected = id;
      notify();
    },
    start() {
      if (state !== 'picking' || !selected) return;
      const why = blocked(selected);
      if (why) {
        lastResult = { ok: false, perfect: false, reason: why };
        return notify();
      }
      lastResult = null;
      perfect = false;
      if (mode === 'smith') return apply(selected, undefined);
      run = new RhythmRun(ports.makeClock(), tierOf(getItem(selected)), ports.now());
      go('rhythm');
    },
    strike(tMs) {
      if (state !== 'rhythm' || !run) return;
      const t = tMs ?? ports.now();
      if (run.finished(t)) return finishRun(t);
      run.strike(t);
      notify();
    },
    update(tMs) {
      if (state !== 'rhythm' || !run) return;
      const t = tMs ?? ports.now();
      if (run.finished(t)) finishRun(t);
      else notify();
    },
    confirm() {
      if (state === 'affix-reveal' && pending && !pending.choice) {
        pending = null;
        go('result');
      } else if (state === 'result') {
        selected = null;
        go('picking');
      }
    },
    keepAffix() {
      if (state !== 'affix-reveal' || !pending?.choice || !selected) return;
      pending = null;
      apply(selected, undefined);
    },
    replaceAffix() {
      if (state !== 'affix-reveal' || !pending?.choice || !selected) return;
      const a = pending.affix;
      pending = null;
      apply(selected, a);
    },
    forge(id) {
      if (mode !== 'anvil' || (state !== 'picking' && state !== 'result')) return;
      const r = ports.anvilUsable() ? forgeItem(inv, id) : ({ ok: false, reason: 'locked' } as const);
      lastResult = r.ok ? { ok: true, perfect: false, forged: r.to } : { ok: false, perfect: false, reason: r.reason };
      selected = null;
      go('picking');
    },
    close() {
      if (state === 'idle') return;
      run = null;
      pending = null;
      selected = null;
      mode = null;
      go('idle');
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return self;
}

/** What the plugin hands a screen: the session, a way to show a modal, strings, and where key presses arrive. */
export interface ScreenHost {
  session: TemperingSession;
  doc: import('../hud/dom').DocumentLike;
  /** Shows the element as a modal; null when another modal is open. */
  openModal(widget: { id: string; element: import('../hud/dom').ElementLike; dispose?(): void }): (() => void) | null;
  t(key: string, params?: Record<string, string | number>): string;
  /** `window` in the browser, null headless. */
  keys: { addEventListener(type: 'keydown', fn: (e: { key?: string; code?: string; repeat?: boolean }) => void): void; removeEventListener(type: 'keydown', fn: (e: { key?: string; code?: string; repeat?: boolean }) => void): void } | null;
}
export interface TemperingScreen {
  /** Called every tick while open. */
  update?(): void;
  dispose(): void;
}
export type TemperingScreenFactory = (host: ScreenHost) => TemperingScreen | null;
