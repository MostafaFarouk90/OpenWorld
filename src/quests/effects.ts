import type { Effect, FavourTrack } from './types';
import { EFFECT_EVENT_PATTERN } from './types';
import type { EffectEnv, EffectResult } from './ports';

export interface EffectRunner { run(effects: Effect[] | undefined): EffectResult[] }

const TRACKS: readonly string[] = ['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

class Silent extends Error {}

export function createEffectRunner(env: EffectEnv): EffectRunner {
  const warned = new Set<string>();
  const warn = (msg: string): void => env.warn?.(msg);
  const warnOnce = (msg: string): void => { if (!warned.has(msg)) { warned.add(msg); warn(msg); } };

  const stack = (v: unknown): { itemId: string; count: number }[] =>
    typeof v === 'string' ? (v !== '' ? [{ itemId: v, count: 1 }] : [])
      : Array.isArray(v)
      ? v.filter((e): e is { itemId: string; count: number } =>
        isObj(e) && typeof e.itemId === 'string' && e.itemId !== '' && Number.isInteger(e.count) && (e.count as number) > 0)
      : [];

  function exec(e: Effect): void {
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
      p.grantXp(c.xp, env.sourceId);
    } else if ('skillPoints' in c) {
      if (typeof c.skillPoints !== 'number' || !Number.isFinite(c.skillPoints) || c.skillPoints <= 0) return;
      const p = env.progression?.();
      if (!p?.grantSkillPoint) { warnOnce('skillPoints: progression service absent'); throw new Silent('skill point service absent'); }
      p.grantSkillPoint(c.skillPoints, env.sourceId);
    } else if ('event' in c) {
      if (typeof c.event !== 'string' || !EFFECT_EVENT_PATTERN.test(c.event)) {
        throw new Error(`event name rejected: ${String(c.event)}`);
      }
      env.bus.emit(c.event, c.payload);
    } else {
      throw new Error('unknown effect shape');
    }
  }

  return {
    run(effects) {
      if (!effects) return [];
      return effects.map((effect): EffectResult => {
        try {
          exec(effect);
          return { effect, ok: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          if (!(err instanceof Silent)) warn(`effect failed: ${error}`);
          return { effect, ok: false, error };
        }
      });
    },
  };
}
