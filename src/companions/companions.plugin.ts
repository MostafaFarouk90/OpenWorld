import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { CompanionController, type SavedSpot } from './CompanionController';
import { COMPANION_STRINGS_EN } from './strings.en';
import { TOBB } from './tobb';
import type { AttackSpeedHook, CompanionDef, CompanionsService } from './types';

export const COMPANIONS_PERSIST_KEY = 'companions';
export const COMPANIONS_PERSIST_VERSION = 1;
/** Companion defs this slice; Hrolf (M13) and Aelfreda (M14) add theirs later. */
export const COMPANION_DEFS: readonly CompanionDef[] = [TOBB];

let controllers: CompanionController[] = [];

function readSpot(v: unknown): SavedSpot | null {
  const s = v as Partial<SavedSpot> | null;
  if (!s || typeof s !== 'object') return null;
  const { x, y, z, yaw } = s;
  return [x, y, z, yaw].every((n) => typeof n === 'number' && Number.isFinite(n))
    ? { x: x!, y: y!, z: z!, yaw: yaw! }
    : null;
}

export function createCompanionsService(ctx: GameContext, list: readonly CompanionController[]): CompanionsService {
  const byId = (id: string) => list.find((c) => c.def.id === id);
  return {
    join(id) {
      const c = byId(id);
      if (c && !ctx.state.getBool(c.def.joinFlag)) ctx.state.setFlag(c.def.joinFlag, true);
    },
    leave(id) {
      const c = byId(id);
      if (c && ctx.state.hasFlag(c.def.joinFlag)) ctx.state.clearFlag(c.def.joinFlag);
    },
    active: () => list.filter((c) => c.joined).map((c) => c.def.id),
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

function teardown(): void {
  const list = controllers;
  controllers = [];
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
      controllers = COMPANION_DEFS.map((def) => new CompanionController(ctx, def));
      const list = controllers;
      ctx.services.provide('companions', createCompanionsService(ctx, list));
      ctx.persist.register({
        key: COMPANIONS_PERSIST_KEY,
        version: COMPANIONS_PERSIST_VERSION,
        serialize: () => {
          const positions: Record<string, SavedSpot> = {};
          for (const c of list) {
            const s = c.serialize();
            if (s) positions[c.def.id] = s;
          }
          return { positions };
        },
        load: (data) => {
          const positions = (data as { positions?: unknown } | null)?.positions;
          const map = positions && typeof positions === 'object' ? (positions as Record<string, unknown>) : {};
          for (const c of list) c.stashSaved(readSpot(map[c.def.id]));
        },
      });
      // Band requested from core (v0.4.x): `animation` 200..249 companions; render `world` 0..99 (NPCs and companions).
      ctx.systems.add({
        id: 'companions.follow',
        fixedPhase: 'animation',
        order: 200,
        fixedUpdate: (dt) => {
          for (const c of list) c.fixedUpdate(dt);
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
