// `?act<N>=<id>&new` (dev and smoke only): the per-act registry behind the quest jumps. Each act registers its
// prerequisite table (quest id -> quests completed first, in play order); the parser reads the URL and the runner looks the
// act up. Act 1 registers itself from act1Jump.ts. Act 2's table is filled by its own content lane.

export interface ActJumpDef {
  prereqs: Record<string, readonly string[]>;
}

export interface ActJumpRequest {
  act: number;
  id: string;
  /** True when the URL carries `&new` (a jump never runs over a real save without it). */
  fresh: boolean;
}

export type ActPoint = { x: number; y: number; z: number };

const registry = new Map<number, ActJumpDef>();

/** Registers an act's jump table; throws on a duplicate act. Returns the undo. */
export function registerActJump(act: number, def: ActJumpDef): () => void {
  if (!Number.isInteger(act) || act < 1) throw new Error(`act jump: invalid act ${act}`);
  if (registry.has(act)) throw new Error(`act jump: act ${act} is already registered`);
  registry.set(act, def);
  return () => {
    if (registry.get(act) === def) registry.delete(act);
  };
}

/** The registered jump definition of an act, if any. */
export function getActJump(act: number): ActJumpDef | undefined {
  return registry.get(act);
}

/** `?act<N>=<id>` (N a positive integer, id non-empty) or null. The first such parameter wins. */
export function parseActJump(search: string): ActJumpRequest | null {
  const params = new URLSearchParams(search);
  for (const [key, id] of params) {
    const m = /^act([1-9]\d*)$/.exec(key);
    if (!m || id === '') continue;
    return { act: Number(m[1]), id, fresh: params.has('new') };
  }
  return null;
}

/**
 * The runner's lookup: the parsed request with its prerequisites, or null. An act with no registration, or an id with no
 * entry in its table (Act 2 until its table is filled), is refused with one warning and nothing else happens.
 */
export function resolveActJump(
  search: string,
  warn: (msg: string) => void = (m) => console.warn(m),
): (ActJumpRequest & { prereqs: readonly string[] }) | null {
  const req = parseActJump(search);
  if (!req) return null;
  const def = registry.get(req.act);
  const prereqs = def && Object.prototype.hasOwnProperty.call(def.prereqs, req.id) ? def.prereqs[req.id] : undefined;
  if (!prereqs) {
    warn(`[act${req.act}] jump refused: no entry for "${req.id}"`);
    return null;
  }
  if (!req.fresh) {
    warn(`[act${req.act}] jump refused: needs &new so the jump never runs over a real save`);
    return null;
  }
  return { ...req, prereqs };
}

/** Passes a jump destination through the optional containment clamp (the lead wires it to the containment service). */
export function clampJumpDestination(ports: { clamp?(at: ActPoint): ActPoint }, at: ActPoint): ActPoint {
  return ports.clamp ? ports.clamp(at) : at;
}

/** Act 2 prerequisites: filled with m11..m22, d03, d04, r05..r11 by the Act 2 content lane. */
export const ACT2_PREREQS: Record<string, readonly string[]> = {};
registerActJump(2, { prereqs: ACT2_PREREQS });
