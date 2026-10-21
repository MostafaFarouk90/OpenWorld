import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { CompanionController, type SavedSpot } from './CompanionController';
import { AELFREDA } from './aelfreda';
import { HROLF } from './hrolf';
import { PartyWindow, type PartyService } from './party';
import { COMPANION_STRINGS_EN } from './strings.en';
import { HROLF_STRINGS_EN } from './strings.hrolf.en';
import { AELFREDA_STRINGS_EN } from './strings.aelfreda.en';
import { TOBB } from './tobb';
import { BarkGate } from './barkGate';
import { Trials } from './trials';
import { Escort } from './escort/escort';
import { createExtras, type Extras } from './extras';
import type { HorseLoader } from './escort/escortHorse';
import type { NpcModelLoader } from '../npcs/types';
import { heightAt } from '../terrain/heightfield';
import type { AttackSpeedHook, CompanionDef, CompanionsService } from './types';
import './events';

export const COMPANIONS_PERSIST_KEY = 'companions';
export const COMPANIONS_PERSIST_VERSION = 2;
/** The flag that raises the party limit from one to two. */
export const PARTY_GATE_FLAG = 'story.gate.a3';
/** Companion defs; Aelfreda (M14) adds hers in A5's second PR. */
export const COMPANION_DEFS: readonly CompanionDef[] = [TOBB, HROLF, AELFREDA];
/** Holds any companion's hit at 1 HP: kills, XP and every mercy choice stay with Cael (plans/act2-A5.md section 8). */
export const ALLY_NO_KILL_ID = 'companions.ally-no-kill';
/** Stonehide's damage modifier: late in the buffs band, after A10's armour on Cael. */
export const STONEHIDE_ORDER = 90;
export const MAX_RANK = 5;

let controllers: CompanionController[] = [];
let partyOffs: (() => void)[] = [];
let trials: Trials | null = null;
let escort: Escort | null = null;
let extras: Extras | null = null;

function readSpot(v: unknown): SavedSpot | null {
  const s = v as Partial<SavedSpot> | null;
  if (!s || typeof s !== 'object') return null;
  const { x, y, z, yaw } = s;
  return [x, y, z, yaw].every((n) => typeof n === 'number' && Number.isFinite(n))
    ? { x: x!, y: y!, z: z!, yaw: yaw! }
    : null;
}

/** The stored party: null until set or loaded (every joined companion is then active, up to the limit). */
export interface PartyStore {
  raw: string[] | null;
}

function readActive(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
}

export function createCompanionsService(
  ctx: GameContext,
  list: readonly CompanionController[],
  party: PartyStore = { raw: null },
): CompanionsService {
  const byId = (id: string) => list.find((c) => c.def.id === id);
  const maxActive = () => (ctx.state.getBool(PARTY_GATE_FLAG) ? 2 : 1);
  const active = () => {
    const joined = list.filter((c) => c.joined).map((c) => c.def.id);
    const set = party.raw;
    return (set ? joined.filter((id) => set.includes(id)) : joined).slice(0, maxActive());
  };
  const announce = (before: string[]) => {
    const now = active();
    if (now.length !== before.length || now.some((id, i) => id !== before[i])) ctx.events.emit('party.changed', { active: now });
  };
  return {
    join(id) {
      const c = byId(id);
      if (c && !ctx.state.getBool(c.def.joinFlag)) ctx.state.setFlag(c.def.joinFlag, true);
    },
    leave(id) {
      const c = byId(id);
      if (c && ctx.state.hasFlag(c.def.joinFlag)) ctx.state.clearFlag(c.def.joinFlag);
    },
    active,
    maxActive,
    setActive(ids) {
      const ok =
        ids.length <= maxActive() &&
        new Set(ids).size === ids.length &&
        ids.every((id) => !!byId(id)?.joined);
      if (ok) {
        const before = active();
        party.raw = [...ids];
        announce(before);
      }
      return ok;
    },
    setRank(id, rank) {
      const c = byId(id);
      if (!c?.joined || !Number.isInteger(rank) || rank < 1 || rank > MAX_RANK) return false;
      if (rank <= c.rank()) return false;
      ctx.state.setFlag(c.def.rankFlag, rank);
      ctx.events.emit('companion.bond', { companionId: id, rank });
      return true;
    },
    isActive: (id) => active().includes(id),
    actorId: (id) => byId(id)?.actorId ?? null,
    rank: (id) => byId(id)?.rank() ?? 0,
    integration() {
      const verbs = ctx.services.get('combatVerbs') as unknown as Partial<AttackSpeedHook> | undefined;
      const any = ctx.services as unknown as { get(n: string): unknown };
      return {
        npcs: !!ctx.services.get('npcs'),
        attackSpeedHook: typeof verbs?.addAttackSpeedMultiplier === 'function',
        nav: !!any.get('nav'),
      };
    },
  };
}

/** The live controllers (tests and debug tools). */
export function companionControllers(): readonly CompanionController[] {
  return controllers;
}

function teardown(): void {
  const list = controllers;
  controllers = [];
  trials?.dispose();
  trials = null;
  escort?.dispose();
  escort = null;
  extras?.dispose();
  extras = null;
  for (const off of partyOffs.splice(0)) off();
  for (const c of list) {
    try {
      c.dispose();
    } catch (err) {
      console.warn('companions: dispose failed', err);
    }
  }
}

/** Slice 2 thread 4b: Tobb, the lite companion (contracts/companions.md, plans/slice-2-tobb.md). */
export default {
  id: 'companions',
  dependsOn: ['core'],
  setup(ctx) {
    try {
      ctx.strings.register('en', COMPANION_STRINGS_EN);
      ctx.strings.register('en', HROLF_STRINGS_EN);
      ctx.strings.register('en', AELFREDA_STRINGS_EN);
      const party: PartyStore = { raw: null };
      // Late-bound: the controllers ask for their seat, the service is built from the controllers.
      let service: CompanionsService | null = null;
      const npcs = () => ctx.services.get('npcs') as unknown as { setHidden?(id: string, hidden: boolean): boolean } | undefined;
      trials = new Trials({
        events: ctx.events,
        actors: ctx.actors,
        addLethalHandler: (id, fn, order) => ctx.damage.addLethalHandler(id, fn, order),
        heal: (id, n) => ctx.damage.heal(id, n),
        playerFeet: () => ctx.player.feet,
        setNpcHidden: (id, h) => void npcs()?.setHidden?.(id, h),
      });
      const tr = trials;
      ctx.services.provide('trials', tr);
      const loader = () => {
        const a = ctx.assets as unknown as Partial<NpcModelLoader & HorseLoader> | null;
        return a && typeof a.load === 'function' && typeof a.instantiate === 'function' && typeof a.animations === 'function'
          ? (a as unknown as NpcModelLoader & HorseLoader)
          : null;
      };
      const groundAt = (x: number, z: number, yHint: number): number | null => {
        const hit = ctx.physics.raycast({ x, y: yHint + 4, z }, { x: 0, y: -1, z: 0 }, 40, ctx.world.player.controller.collider);
        if (hit) return hit.point.y;
        const h = heightAt(x, z);
        return Number.isFinite(h) ? h : null;
      };
      escort = new Escort({
        events: ctx.events,
        scene: ctx.scene,
        playerFeet: () => ctx.player.feet,
        groundAt,
        setNpcHidden: (id, h) => void npcs()?.setHidden?.(id, h),
        horses: loader,
        npcs: loader,
      });
      const esc = escort;
      ctx.services.provide('escort', esc);
      const barks = new BarkGate();
      controllers = COMPANION_DEFS.map(
        (def) =>
          new CompanionController(ctx, def, {
            isActive: () => service?.isActive(def.id) ?? true,
            trialRunning: () => tr.state() !== null,
            claimBark: (id) => barks.claim(id),
          }),
      );
      const list = controllers;
      service = createCompanionsService(ctx, list, party);
      const svc = service;
      ctx.services.provide('companions', svc);
      const window = new PartyWindow();
      const partyService: PartyService = {
        canChange: () => window.isOpen,
        options: () =>
          list
            .filter((c) => c.joined)
            .map((c) => ({ id: c.def.id, nameKey: c.def.nameKey, role: c.def.role, rank: c.rank(), active: svc.isActive(c.def.id) })),
        change: (ids) => window.isOpen && svc.setActive(ids),
      };
      ctx.services.provide('party', partyService);
      const isCompanion = (id: string | null) => !!id && list.some((c) => c.actorId === id);
      ctx.damage.addLethalHandler(
        ALLY_NO_KILL_ID,
        (target, r) => {
          if (!isCompanion(r.attackerId)) return false;
          target.health = Math.min(1, target.maxHealth);
          return true;
        },
        // Right after the core's ally floor, before anything that would spend a resource (Second Wind is Cael's).
        Number.MIN_SAFE_INTEGER + 1,
      );
      ctx.damage.addModifier(
        'companions.stonehide',
        (req, target, attacker) => {
          if (req.outcome !== 'hit' || target.id !== ctx.player.actor.id || attacker?.team !== 'hostile') return;
          if (req.kind !== 'melee' && req.kind !== 'spell') return;
          const feet = ctx.player.feet;
          for (const c of list) {
            if (!c.def.stonehide || !svc.isActive(c.def.id)) continue;
            req.amount = c.shareHit(req.amount, { x: feet.x, y: feet.y, z: feet.z });
          }
        },
        STONEHIDE_ORDER,
      );
      partyOffs.push(
        // The joiner takes the first seat; the others wait at the Tilted Anvil (A5; A0 only filled a free seat).
        ctx.events.on('companion.joined', ({ companionId }) => {
          const before = svc.active();
          party.raw = [companionId, ...before.filter((id) => id !== companionId)].slice(0, svc.maxActive());
          const now = svc.active();
          if (now.join() !== before.join()) ctx.events.emit('party.changed', { active: now });
        }),
        ctx.events.on('companion.left', ({ companionId }) => {
          if (!party.raw?.includes(companionId)) return;
          const before = svc.active();
          party.raw = party.raw.filter((id) => id !== companionId);
          const now = svc.active();
          if (now.join() !== before.join()) ctx.events.emit('party.changed', { active: now });
        }),
        ctx.events.on('rest', ({ waystoneId }) => {
          if (!waystoneId) return;
          if (list.filter((c) => c.joined).length < 2) return;
          window.open(ctx.player.feet);
          ctx.events.emit('party.offered', { waystoneId });
        }),
        // Dialogue `event` effect (the accepted `story.*` names): a quest raises a rank.
        ctx.events.on('story.companion.rank', (p) => {
          const ok = !!p && typeof p.companionId === 'string' && typeof p.rank === 'number' && svc.setRank(p.companionId, p.rank);
          if (!ok) console.warn(`companions: story.companion.rank refused: ${JSON.stringify(p)}`);
        }),
        // The raw list is only stored on load; the flags may load after this entry, so it is checked here.
        ctx.events.on('save.loaded', () => {
          window.close();
          if (!party.raw) return;
          const ids = new Set(list.filter((c) => c.joined).map((c) => c.def.id));
          party.raw = [...new Set(party.raw)].filter((id) => ids.has(id)).slice(0, service.maxActive());
        }),
      );
      ctx.persist.register({
        key: COMPANIONS_PERSIST_KEY,
        version: COMPANIONS_PERSIST_VERSION,
        serialize: () => {
          const positions: Record<string, SavedSpot> = {};
          for (const c of list) {
            const s = c.serialize();
            if (s) positions[c.def.id] = s;
          }
          return { positions, active: party.raw ? [...party.raw] : null };
        },
        load: (data) => {
          // Before save.loaded: the old escort and trial end here, so a quest gate that restarts one on the load
          // (gates run first on save.loaded) is not stopped by their own load listener afterwards.
          tr.beginLoad();
          esc.beginLoad();
          const positions = (data as { positions?: unknown } | null)?.positions;
          const map = positions && typeof positions === 'object' ? (positions as Record<string, unknown>) : {};
          for (const c of list) c.stashSaved(readSpot(map[c.def.id]));
          // v1 has no `active`: null, so the joined companions are active up to the limit.
          party.raw = readActive((data as { active?: unknown } | null)?.active);
        },
      });
      extras = createExtras(ctx, { aelfredaJoined: () => list.some((c) => c.def.id === AELFREDA.id && c.joined), groundAt });
      const ex = extras;
      // Band requested from core (v0.4.x): `animation` 200..249 companions; render `world` 0..99 (NPCs and companions).
      ctx.systems.add({
        id: 'companions.follow',
        fixedPhase: 'animation',
        order: 200,
        fixedUpdate: (dt) => {
          window.tick(dt, ctx.player.feet);
          barks.tick(dt);
          tr.fixedUpdate(dt);
          esc.fixedUpdate(dt);
          for (const c of list) c.fixedUpdate(dt);
          ex.fixedUpdate(dt);
        },
      });
      ctx.systems.add({
        id: 'companions.interpolate',
        renderPhase: 'world',
        order: 60,
        render: (alpha) => {
          for (const c of list) c.render(alpha);
        },
      });
    } catch (err) {
      teardown();
      throw err;
    }
  },
  dispose: teardown,
} satisfies GamePlugin;
