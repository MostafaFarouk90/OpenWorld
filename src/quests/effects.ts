import type { Effect, FavourTrack } from './types';
import { EFFECT_EVENT_PATTERN, MAX_IF_DEPTH } from './types';
import { evalCondition } from './conditions';
import type { EffectEnv, EffectResult } from './ports';
import { grantMasterBook } from '../progression/masterBooks';

export interface EffectRunner { run(effects: Effect[] | undefined): EffectResult[] }

const TRACKS: readonly string[] = ['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

class Silent extends Error {}
/** A failed spendGold: stops the whole run, including the lists around a nested `if`. */
class Halt extends Error {}

/** v0.7 item 9: an env that may carry a multiplier for the XP and gold effects (the quest rewards path only). */
export interface ScaledEffectEnv extends EffectEnv {
  /** Read at each xp / giveGold effect; absent, or exactly 1, leaves amounts alone. A non-finite or negative value reads as 1. */
  rewardScale?: () => number;
}

export function createEffectRunner(env: ScaledEffectEnv): EffectRunner {
  /** The amount times the reward scale, rounded once, never below 0. */
  const scaled = (amount: number): number => {
    const k = env.rewardScale?.() ?? 1;
    if (k === 1) return amount;
    const s = typeof k === 'number' && Number.isFinite(k) && k >= 0 ? k : 1;
    return Math.max(0, Math.round(amount * s));
  };
  const warned = new Set<string>();
  const warn = (msg: string): void => env.warn?.(msg);
  const warnOnce = (msg: string): void => { if (!warned.has(msg)) { warned.add(msg); warn(msg); } };

  const stack = (v: unknown): { itemId: string; count: number }[] =>
    typeof v === 'string' ? (v !== '' ? [{ itemId: v, count: 1 }] : [])
      : Array.isArray(v)
      ? v.filter((e): e is { itemId: string; count: number } =>
        isObj(e) && typeof e.itemId === 'string' && e.itemId !== '' && Number.isInteger(e.count) && (e.count as number) > 0)
      : [];

  function exec(e: Effect, depth: number): void {
    const c = e as any;
    if (!isObj(e)) throw new Error('effect is not an object');
    if ('setFlag' in c) {
      if (typeof c.value === 'number' && !Number.isFinite(c.value)) throw new Error(`setFlag ${c.setFlag}: non-finite value`);
      env.state.setFlag(c.setFlag, c.value);
    } else if ('clearFlag' in c) {
      if (env.state.getFlag(c.clearFlag) !== undefined) env.state.clearFlag(c.clearFlag);
    } else if ('favour' in c) {
      if (!TRACKS.includes(c.favour)) throw new Error(`unknown favour track ${String(c.favour)}`);
      if (typeof c.delta !== 'number' || !Number.isFinite(c.delta)) throw new Error('favour delta is not finite');
      env.state.addFavour(c.favour as FavourTrack, c.delta, 'quest');
    } else if ('mercy' in c) {
      env.bus.emit('mercy', c.mercy);
    } else if ('startQuest' in c) {
      if (!env.quests.start(c.startQuest)) warn(`startQuest ${c.startQuest} refused`);
    } else if ('completeQuest' in c) {
      if (!env.quests.complete(c.completeQuest)) warn(`completeQuest ${c.completeQuest} refused`);
    } else if ('completeObjective' in c) {
      const [q, o] = c.completeObjective as [string, string];
      if (!env.quests.completeObjective(q, o)) warn(`completeObjective ${q}/${o} refused`);
    } else if ('give' in c) {
      const items = stack(c.give);
      const dropped = (Array.isArray(c.give) ? c.give.length : 0) - items.length;
      if (dropped > 0) warn(`give: dropped ${dropped} invalid entr${dropped === 1 ? 'y' : 'ies'}`);
      if (items.length) env.bus.emit('loot.granted', { sourceId: env.sourceId, items });
    } else if ('take' in c) {
      const inv = env.inventory?.();
      if (!inv) { warnOnce('take: inventory service absent'); throw new Silent('inventory service absent'); }
      const takes = stack(c.take);
      const total = Array.isArray(c.take) ? c.take.length : 1;
      if (total - takes.length > 0) warn(`take: dropped ${total - takes.length} invalid entr${total - takes.length === 1 ? 'y' : 'ies'}`);
      for (const it of takes) {
        if (!inv.remove(it.itemId, it.count)) warn(`take: could not remove ${it.count} x ${it.itemId}`);
      }
    } else if ('xp' in c) {
      if (typeof c.xp !== 'number' || !Number.isFinite(c.xp) || c.xp <= 0) return;
      const p = env.progression?.();
      if (!p) { warnOnce('xp: progression service absent'); throw new Silent('progression service absent'); }
      const xp = scaled(c.xp);
      if (xp > 0) p.grantXp(xp, env.sourceId);
    } else if ('skillPoints' in c) {
      if (typeof c.skillPoints !== 'number' || !Number.isFinite(c.skillPoints) || c.skillPoints <= 0) return;
      const p = env.progression?.();
      if (!p?.grantSkillPoint) { warnOnce('skillPoints: progression service absent'); throw new Silent('skill point service absent'); }
      p.grantSkillPoint(c.skillPoints, env.sourceId);
    } else if ('giveGold' in c) {
      if (typeof c.giveGold !== 'number' || !Number.isFinite(c.giveGold) || c.giveGold <= 0) throw new Error('giveGold must be a positive number');
      const inv = env.inventory?.();
      if (!inv?.addGold) { warnOnce('giveGold: inventory service absent'); throw new Silent('inventory service absent'); }
      const gold = scaled(c.giveGold);
      if (gold > 0) inv.addGold(gold);
    } else if ('if' in c) {
      if (depth >= MAX_IF_DEPTH) throw new Error(`if effects nest at most ${MAX_IF_DEPTH} deep`);
      const holds = evalCondition(c.if, { state: env.state, quests: env.quests, gold: () => env.inventory?.()?.gold, warn: env.warn });
      const branch = (holds ? c.then : c.else) as Effect[] | undefined;
      if (branch !== undefined && !Array.isArray(branch)) throw new Error('if branch is not an array');
      runList(branch, depth + 1);
    } else if ('spendGold' in c) {
      const { amount, reason } = (c.spendGold ?? {}) as { amount?: unknown; reason?: unknown };
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) throw new Halt('spendGold amount must be a positive integer');
      if (typeof reason !== 'string' || !reason) throw new Halt('spendGold needs a reason');
      const inv = env.inventory?.();
      if (!inv?.takeGold || typeof inv.gold !== 'number') { warnOnce('spendGold: inventory service absent'); throw new Halt('inventory service absent'); }
      if (inv.gold < amount) throw new Halt(`spendGold: need ${amount} gold, have ${inv.gold}`);
      if (inv.takeGold(amount, reason) !== amount) throw new Halt('spendGold: take was short');
    } else if ('placeNpc' in c) {
      const { npcId, anchorId } = (c.placeNpc ?? {}) as { npcId?: unknown; anchorId?: unknown };
      if (typeof npcId !== 'string' || typeof anchorId !== 'string' || !npcId || !anchorId) throw new Error('placeNpc needs npcId and anchorId');
      const npcs = env.npcs?.();
      if (!npcs) { warnOnce('placeNpc: npcs service absent'); throw new Silent('npcs service absent'); }
      if (!npcs.place(npcId, anchorId)) warn(`placeNpc: could not place ${npcId} at ${anchorId}`);
    } else if ('unlockMercy' in c) {
      if (c.unlockMercy !== 'release' && c.unlockMercy !== 'spare' && c.unlockMercy !== 'calm') throw new Error(`unknown mercy verb ${String(c.unlockMercy)}`);
      const enemies = env.enemies?.();
      if (!enemies) { warnOnce('unlockMercy: enemies service absent'); throw new Silent('enemies service absent'); }
      enemies.setMercyUnlocked(c.unlockMercy, true);
    } else if ('grantAbility' in c) {
      if (typeof c.grantAbility !== 'string' || !c.grantAbility) throw new Error('grantAbility needs an ability id');
      const p = env.progression?.();
      if (!p?.grantAbility) { warnOnce('grantAbility: progression service absent'); throw new Silent('grantAbility service absent'); }
      p.grantAbility(c.grantAbility, env.sourceId);
    } else if ('grantMasterBook' in c) {
      const r = grantMasterBook(env.state as never, c.grantMasterBook, env.bus);
      if (!r.ok) throw new Error(`grantMasterBook ${String(c.grantMasterBook)}: ${r.reason}`);
    } else if ('event' in c) {
      if (typeof c.event !== 'string' || !EFFECT_EVENT_PATTERN.test(c.event)) {
        throw new Error(`event name rejected: ${String(c.event)}`);
      }
      env.bus.emit(c.event, c.payload);
    } else {
      throw new Error('unknown effect shape');
    }
  }

  function runList(effects: Effect[] | undefined, depth: number): EffectResult[] {
    if (!effects) return [];
    const out: EffectResult[] = [];
    for (const effect of effects) {
      try {
        exec(effect, depth);
        out.push({ effect, ok: true });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        if (err instanceof Halt) {
          if (depth > 0) throw err; // the outermost list records it and stops
          warn(`effect halted: ${error}`);
          out.push({ effect, ok: false, error, halted: true });
          return out;
        }
        if (!(err instanceof Silent)) warn(`effect failed: ${error}`);
        out.push({ effect, ok: false, error });
      }
    }
    return out;
  }

  return { run: (effects) => runList(effects, 0) };
}
