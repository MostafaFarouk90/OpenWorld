import type { DialogueDef, Effect } from '../quests/types';
import { validateEffects } from '../quests/validate';
import { EFFECT_EVENT_PATTERN } from '../quests/types';

const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v !== '';
const stacksOk = (v: unknown, w: string, errs: string[]): void => {
  if (!Array.isArray(v) || v.length === 0) { errs.push(`${w}: needs a non-empty list`); return; }
  v.forEach((s: any, j: number) => {
    if (!s || typeof s !== 'object' || !nonEmpty(s.itemId)) errs.push(`${w}[${j}]: itemId must be a non-empty string`);
    else if (!Number.isInteger(s.count) || s.count <= 0) errs.push(`${w}[${j}]: count must be a positive integer`);
  });
};

/** Local structural check of dialogue effects (bad event names, flag keys, counts). */
export function validateDialogueEffects(effects: Effect[] | undefined, where: string): string[] {
  const errs: string[] = [];
  if (effects === undefined) return errs;
  if (!Array.isArray(effects)) return [`${where}: effects must be an array`];
  effects.forEach((e: any, i) => {
    const w = `${where} effect[${i}]`;
    if (!e || typeof e !== 'object') { errs.push(`${w}: not an object`); return; }
    if ('setFlag' in e) {
      if (!nonEmpty(e.setFlag)) errs.push(`${w}: setFlag key must be a non-empty string`);
      if (!(typeof e.value === 'boolean' || typeof e.value === 'string' || (typeof e.value === 'number' && Number.isFinite(e.value)))) errs.push(`${w}: setFlag value must be boolean, string or finite number`);
    } else if ('clearFlag' in e) {
      if (!nonEmpty(e.clearFlag)) errs.push(`${w}: clearFlag key must be a non-empty string`);
    } else if ('favour' in e) {
      if (typeof e.delta !== 'number' || !Number.isFinite(e.delta)) errs.push(`${w}: favour delta must be finite`);
    } else if ('startQuest' in e) {
      if (!nonEmpty(e.startQuest)) errs.push(`${w}: startQuest needs an id`);
    } else if ('completeQuest' in e) {
      if (!nonEmpty(e.completeQuest)) errs.push(`${w}: completeQuest needs an id`);
    } else if ('completeObjective' in e) {
      const o = e.completeObjective;
      if (!Array.isArray(o) || o.length !== 2 || !nonEmpty(o[0]) || !nonEmpty(o[1])) errs.push(`${w}: completeObjective needs [questId, objectiveId]`);
    } else if ('give' in e) stacksOk(e.give, `${w} give`, errs);
    else if ('take' in e) {
      if (typeof e.take === 'string') { if (e.take === '') errs.push(`${w}: take item id is empty`); }
      else stacksOk(e.take, `${w} take`, errs);
    } else if ('xp' in e) {
      if (typeof e.xp !== 'number' || !Number.isFinite(e.xp) || e.xp <= 0) errs.push(`${w}: xp must be a positive number`);
    } else if ('skillPoints' in e) {
      if (typeof e.skillPoints !== 'number' || !Number.isFinite(e.skillPoints) || e.skillPoints <= 0) errs.push(`${w}: skillPoints must be a positive number`);
    } else if ('event' in e) {
      if (typeof e.event !== 'string' || !EFFECT_EVENT_PATTERN.test(e.event)) errs.push(`${w}: event name not allowed`);
    } else if ('unlockMercy' in e) {
      if (e.unlockMercy !== 'release' && e.unlockMercy !== 'spare' && e.unlockMercy !== 'calm') errs.push(`${w}: unlockMercy verb must be release, spare or calm`);
    } else if ('grantAbility' in e) {
      if (!nonEmpty(e.grantAbility)) errs.push(`${w}: grantAbility needs an ability id`);
    } else if ('giveGold' in e || 'spendGold' in e || 'if' in e || 'placeNpc' in e || 'grantMasterBook' in e) {
      errs.push(...validateEffects([e as any], w));
    } else if (!('mercy' in e)) errs.push(`${w}: unknown effect shape`);
  });
  return errs;
}

export function validateDialogue(def: DialogueDef, hasKey: (key: string) => boolean): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const p = `dialogue "${def.id}"`;
  const ids = new Set<string>();
  for (const n of def.nodes) {
    if (ids.has(n.id)) errors.push(`${p}: duplicate node id "${n.id}"`);
    ids.add(n.id);
  }
  const starts: string[] = [];
  if (typeof def.start === 'string') {
    if (def.start === '') errors.push(`${p}: empty start node`);
    else starts.push(def.start);
  } else if (!Array.isArray(def.start) || def.start.length === 0) errors.push(`${p}: empty start array`);
  else for (const e of def.start) starts.push(e.node);
  for (const s of starts) if (s !== '' && !ids.has(s)) errors.push(`${p}: unknown start node "${s}"`);

  const edges = new Map<string, string[]>();
  for (const n of def.nodes) {
    const out: string[] = [];
    if (!n.textKey) errors.push(`${p} node "${n.id}": missing textKey`);
    else if (!hasKey(n.textKey)) errors.push(`${p} node "${n.id}": missing string "${n.textKey}"`);
    errors.push(...validateDialogueEffects(n.effects, `${p} node "${n.id}"`));
    const choices = n.choices ?? [];
    if (choices.length > 4) errors.push(`${p} node "${n.id}": ${choices.length} choices (max 4)`);
    if (n.next != null) {
      if (!ids.has(n.next)) errors.push(`${p} node "${n.id}": unknown next "${n.next}"`);
      out.push(n.next);
    }
    for (const c of choices) {
      errors.push(...validateDialogueEffects(c.effects, `${p} node "${n.id}" choice "${c.id}"`));
      if (!c.textKey) errors.push(`${p} node "${n.id}" choice "${c.id}": missing textKey`);
      else if (!hasKey(c.textKey)) errors.push(`${p} node "${n.id}" choice "${c.id}": missing string "${c.textKey}"`);
      if (c.next != null) {
        if (!ids.has(c.next)) errors.push(`${p} node "${n.id}" choice "${c.id}": unknown next "${c.next}"`);
        out.push(c.next);
      }
    }
    edges.set(n.id, out);
  }

  // choice-less cycles: follow only `next` from nodes without choices
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const color = new Map<string, 1 | 2>();
  const reported = new Set<string>();
  const visit = (id: string, stack: string[]): void => {
    const n = byId.get(id);
    if (!n || (n.choices && n.choices.length > 0)) return;
    if (color.get(id) === 2) return;
    if (color.get(id) === 1) {
      const cyc = stack.slice(stack.indexOf(id));
      const key = [...cyc].sort().join('|');
      if (!reported.has(key)) { reported.add(key); errors.push(`${p}: choice-less cycle ${cyc.join(' -> ')} -> ${id}`); }
      return;
    }
    color.set(id, 1);
    if (n.next != null && ids.has(n.next)) visit(n.next, [...stack, id]);
    color.set(id, 2);
  };
  for (const n of def.nodes) visit(n.id, []);

  // reachability
  const reach = new Set<string>();
  const queue = starts.filter((s) => ids.has(s));
  while (queue.length) {
    const id = queue.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    for (const t of edges.get(id) ?? []) if (!reach.has(t)) queue.push(t);
  }
  for (const n of def.nodes) if (!reach.has(n.id)) warnings.push(`${p}: node "${n.id}" is unreachable`);
  return { errors, warnings };
}
