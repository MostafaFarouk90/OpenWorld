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

/** All of Act 1, in play order (Act 2 opens on its end: `story.gate.a2`). */
const THROUGH_ACT1 = ['m01', 'm02', 'm03', 'm04', 'm05', 'r01', 'r02', 'm06', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04', 'd02'] as const;

/** The quests on the way to D03 (what Phase D opens on); the side quests R05 to R07 and R11 are optional until M22. */
const THROUGH_D03 = [...THROUGH_ACT1, 'm11', 'm12', 'm13', 'm14', 'm15', 'd03'] as const;
/** All of Phase C, in play order: M22 and the ending wait on the side quests too. */
const PHASE_C_ALL = [...THROUGH_ACT1, 'm11', 'm12', 'm13', 'r05', 'r06', 'r07', 'r11', 'm14', 'm15', 'd03'] as const;
/** Every Phase D quest M22 waits on (its own `startWhen`), in play order. */
const PHASE_D_BEFORE_M22 = ['m16', 'm17', 'r08', 'r09', 'r10', 'm18', 'm19', 'm20', 'm21', 'd04'] as const;

/**
 * Act 2 prerequisites, transitive and in play order. Phase C (A12): M11 to M15, R05 to R07, R11 and D03. Phase D (A13): M16 to
 * M22, R08 to R10 and D04, plus `ending` (everything but M22). Read by `?act2=` (act2Jump.ts) and the chain tests.
 */
export const ACT2_PREREQS: Record<string, readonly string[]> = {
  m11: [...THROUGH_ACT1],
  m12: [...THROUGH_ACT1, 'm11'],
  r06: [...THROUGH_ACT1, 'm11', 'm12'],
  r05: [...THROUGH_ACT1, 'm11', 'm12'],
  m13: [...THROUGH_ACT1, 'm11', 'm12'],
  // Ketta offers R05 first (her dialogue order) and only stands at Stonefold once R05 is done: R07 needs R05 played.
  r07: [...THROUGH_ACT1, 'm11', 'm12', 'm13', 'r05'],
  r11: [...THROUGH_ACT1, 'm11', 'm12', 'm13'],
  m14: [...THROUGH_ACT1, 'm11', 'm12', 'm13'],
  m15: [...THROUGH_ACT1, 'm11', 'm12', 'm13', 'm14'],
  d03: [...THROUGH_ACT1, 'm11', 'm12', 'm13', 'm14', 'm15'],
  // Phase D (A13's Oldsmoke quests). The Phase C side quests are optional until M22, so only M22 and the ending list them.
  m16: [...THROUGH_D03],
  m17: [...THROUGH_D03, 'm16'],
  r08: [...THROUGH_D03, 'm16', 'm17'],
  r09: [...THROUGH_D03, 'm16'],
  r10: [...THROUGH_D03, 'm16', 'm17'],
  m18: [...THROUGH_D03, 'm16', 'm17'],
  m19: [...THROUGH_D03, 'm16', 'm17', 'm18'],
  m20: [...THROUGH_D03, 'm16', 'm17', 'm18', 'm19'],
  m21: [...THROUGH_D03, 'm16', 'm17', 'm18', 'm19', 'm20'],
  d04: [...THROUGH_D03, 'm16', 'm17', 'm18', 'm19', 'm20'],
  m22: [...PHASE_C_ALL, ...PHASE_D_BEFORE_M22],
  // The ending: everything but M22 done, then the jump completes M22 so the act's ending plays over the player.
  ending: [...PHASE_C_ALL, ...PHASE_D_BEFORE_M22],
};
registerActJump(2, { prereqs: ACT2_PREREQS });
