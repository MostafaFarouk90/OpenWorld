import type { DialogueDef } from '../quests/types';

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
    const choices = n.choices ?? [];
    if (choices.length > 4) errors.push(`${p} node "${n.id}": ${choices.length} choices (max 4)`);
    if (n.next != null) {
      if (!ids.has(n.next)) errors.push(`${p} node "${n.id}": unknown next "${n.next}"`);
      out.push(n.next);
    }
    for (const c of choices) {
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
