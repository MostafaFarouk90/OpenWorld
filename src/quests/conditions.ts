import type { Condition, FavourBand, FavourTrack, QuestState } from './types';
import type { ConditionEnv } from './ports';

const TRACKS: readonly string[] = ['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'];
const ERR = Symbol('condition-error');
type Result = boolean | typeof ERR;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function evalInner(c: unknown, env: ConditionEnv): Result {
  const fail = (msg: string): Result => { env.warn?.(`condition: ${msg}`); return ERR; };
  if (!isObj(c)) return fail('not an object');
  try {
    if ('all' in c) {
      if (!Array.isArray(c.all)) return fail('all is not an array');
      let err = false;
      for (const sub of c.all) {
        const r = evalInner(sub, env);
        if (r === false) return false;
        if (r === ERR) err = true;
      }
      return err ? ERR : true;
    }
    if ('any' in c) {
      if (!Array.isArray(c.any)) return fail('any is not an array');
      let err = false;
      for (const sub of c.any) {
        const r = evalInner(sub, env);
        if (r === true) return true;
        if (r === ERR) err = true;
      }
      return err ? ERR : false;
    }
    if ('not' in c) {
      const r = evalInner(c.not, env);
      return r === ERR ? ERR : !r;
    }
    if ('flag' in c) {
      if (typeof c.flag !== 'string') return fail('flag key is not a string');
      const v = env.state.getFlag(c.flag);
      return 'equals' in c && c.equals !== undefined ? v === c.equals : !!v;
    }
    if ('favour' in c) {
      if (typeof c.favour !== 'string' || !TRACKS.includes(c.favour)) return fail(`unknown favour track ${String(c.favour)}`);
      const track = c.favour as FavourTrack;
      let result = true;
      if (c.band !== undefined) {
        const bands = (Array.isArray(c.band) ? c.band : [c.band]) as FavourBand[];
        if (!bands.includes(env.state.favourBand(track))) result = false;
      }
      if (c.atLeast !== undefined && !(env.state.favour(track) >= (c.atLeast as number))) result = false;
      if (c.below !== undefined && !(env.state.favour(track) < (c.below as number))) result = false;
      return result;
    }
    if ('quest' in c) {
      if (typeof c.quest !== 'string') return fail('quest id is not a string');
      const states = (Array.isArray(c.state) ? c.state : [c.state]) as QuestState[];
      return states.includes(env.quests.state(c.quest));
    }
    if ('objective' in c) {
      const o = c.objective;
      if (!Array.isArray(o) || o.length !== 2 || typeof o[0] !== 'string' || typeof o[1] !== 'string') {
        return fail('objective must be [questId, objectiveId]');
      }
      return env.quests.objectiveDone(o[0], o[1]) === (c.done !== false);
    }
    return fail(`unknown condition shape ${JSON.stringify(c)}`);
  } catch (e) {
    return fail(`read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Pure condition evaluation. Undefined is true; unknown shapes and failing reads are false. */
export function evalCondition(c: Condition | undefined, env: ConditionEnv): boolean {
  if (c === undefined) return true;
  return evalInner(c, env) === true;
}
