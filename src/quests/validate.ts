import type { Condition, Effect, QuestDef } from './types';
import { EFFECT_EVENT_PATTERN } from './types';

const TYPES = ['goTo', 'interact', 'kill', 'collect', 'carry', 'talk'];
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

function condRefs(c: unknown, out: [string, string][]): void {
  if (!isObj(c)) return;
  if (Array.isArray(c.all)) c.all.forEach((s) => condRefs(s, out));
  if (Array.isArray(c.any)) c.any.forEach((s) => condRefs(s, out));
  if ('not' in c) condRefs(c.not, out);
  if (Array.isArray(c.objective) && c.objective.length === 2) out.push([String(c.objective[0]), String(c.objective[1])]);
}

function effectErrors(list: Effect[] | undefined, where: string, self: string, ids: Set<string>, errs: string[]): void {
  if (list === undefined) return;
  if (!Array.isArray(list)) { errs.push(`${where}: effects must be an array`); return; }
  list.forEach((e, i) => {
    const w = `${where}[${i}]`;
    const c = e as unknown as Record<string, any>;
    if (!isObj(c)) { errs.push(`${w}: effect is not an object`); return; }
    if ('setFlag' in c) {
      if (!isStr(c.setFlag)) errs.push(`${w}: setFlag key must be a non-empty string`);
      if (!(typeof c.value === 'boolean' || typeof c.value === 'string' || (typeof c.value === 'number' && Number.isFinite(c.value)))) {
        errs.push(`${w}: setFlag value must be boolean, string or finite number`);
      }
    } else if ('clearFlag' in c) {
      if (!isStr(c.clearFlag)) errs.push(`${w}: clearFlag key must be a non-empty string`);
    } else if ('favour' in c) {
      if (!['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'].includes(c.favour)) errs.push(`${w}: unknown favour track`);
      if (typeof c.delta !== 'number' || !Number.isFinite(c.delta)) errs.push(`${w}: favour delta must be finite`);
    } else if ('mercy' in c) {
      if (!isObj(c.mercy)) errs.push(`${w}: mercy data missing`);
    } else if ('startQuest' in c) {
      if (!isStr(c.startQuest)) errs.push(`${w}: startQuest needs an id`);
    } else if ('completeQuest' in c) {
      if (!isStr(c.completeQuest)) errs.push(`${w}: completeQuest needs an id`);
    } else if ('completeObjective' in c) {
      const o = c.completeObjective;
      if (!Array.isArray(o) || o.length !== 2 || !isStr(o[0]) || !isStr(o[1])) errs.push(`${w}: completeObjective needs [questId, objectiveId]`);
      else if (o[0] === self && !ids.has(o[1])) errs.push(`${w}: unknown objective ${o[1]} of quest ${self}`);
    } else if ('give' in c || 'take' in c) {
      const k = 'give' in c ? 'give' : 'take';
      const arr = c[k];
      if (!Array.isArray(arr) || arr.length === 0) errs.push(`${w}: ${k} needs a non-empty list`);
      else arr.forEach((s: any, j: number) => {
        if (!isObj(s) || !isStr(s.itemId)) errs.push(`${w}.${k}[${j}]: itemId must be a non-empty string`);
        else if (!Number.isInteger(s.count) || s.count <= 0) errs.push(`${w}.${k}[${j}]: count must be a positive integer`);
      });
    } else if ('xp' in c) {
      if (typeof c.xp !== 'number' || !Number.isFinite(c.xp) || c.xp <= 0) errs.push(`${w}: xp must be a positive number`);
    } else if ('skillPoints' in c) {
      if (typeof c.skillPoints !== 'number' || !Number.isFinite(c.skillPoints) || c.skillPoints <= 0) errs.push(`${w}: skillPoints must be a positive number`);
    } else if ('event' in c) {
      if (typeof c.event !== 'string' || !EFFECT_EVENT_PATTERN.test(c.event)) errs.push(`${w}: event name not allowed`);
    } else {
      errs.push(`${w}: unknown effect shape`);
    }
  });
}

/** Static checks of a quest definition. Returns error strings; empty means valid. */
export function validateQuest(def: QuestDef, hasKey: (k: string) => boolean): string[] {
  const errs: string[] = [];
  const q = isStr(def?.id) ? def.id : '';
  if (!q) errs.push('quest id is empty');
  const tag = `quest ${q || '(no id)'}`;
  for (const k of ['titleKey', 'summaryKey'] as const) {
    const v = def?.[k];
    if (!isStr(v)) errs.push(`${tag}: ${k} must be a non-empty string`);
    else if (!hasKey(v)) errs.push(`${tag}: ${k} "${v}" is not in the string table`);
  }
  const objs = Array.isArray(def?.objectives) ? def.objectives : [];
  if (objs.length === 0) errs.push(`${tag}: no objectives`);
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const o of objs) if (isStr(o?.id)) ids.add(o.id);
  objs.forEach((o, i) => {
    const w = `${tag} objective ${isStr(o?.id) ? o.id : `#${i}`}`;
    if (!isStr(o?.id)) errs.push(`${w}: id is empty`);
    else if (seen.has(o.id)) errs.push(`${w}: duplicate objective id`);
    else seen.add(o.id);
    if (!TYPES.includes(o?.type)) errs.push(`${w}: unknown type`);
    if (o?.required !== undefined && (!Number.isInteger(o.required) || o.required <= 0)) errs.push(`${w}: required must be a positive integer`);
    if (!isStr(o?.textKey)) errs.push(`${w}: textKey must be a non-empty string`);
    else if (!hasKey(o.textKey)) errs.push(`${w}: textKey "${o.textKey}" is not in the string table`);
    if (o?.type === 'kill' && !isStr(o.target)) errs.push(`${w}: kill objective needs a target`);
    else if (!isStr(o?.target)) errs.push(`${w}: target must be a non-empty string`);
    if (o?.when !== undefined) {
      const refs: [string, string][] = [];
      condRefs(o.when as Condition, refs);
      for (const [rq, ro] of refs) if (rq === q && !ids.has(ro)) errs.push(`${w}: when references unknown objective ${ro}`);
    }
  });
  effectErrors(def?.onStart, `${tag} onStart`, q, ids, errs);
  effectErrors(def?.onComplete, `${tag} onComplete`, q, ids, errs);
  effectErrors(def?.rewards, `${tag} rewards`, q, ids, errs);
  return errs;
}
