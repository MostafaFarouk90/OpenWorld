// Scale audit for the environment pass: target sizes for every environment object and a pure check of a measured
// bounding box against them. Targets come from src/env/targets.json (the same file tools/env-pass/check-glb.mjs reads).
import targets from './targets.json';

export interface Size {
  /** Width along x, metres. */
  w: number;
  /** Depth along z. */
  d: number;
  /** Height along y. */
  h: number;
}

export const KNIGHT_HEIGHT: number = targets.knightHeight;
/** Largest allowed relative deviation of any axis from its target (0.15 = +-15%). */
export const SCALE_TOLERANCE: number = targets.tolerance;

export const TARGETS: Readonly<Record<string, Size>> = targets.objects;

/** Fixed world sizes every sheet is judged against (metres). Door size is decided in G0a with the coordinator; see the plan. */
export const WORLD_SIZES = {
  knight: KNIGHT_HEIGHT,
  fence: 1.6,
  gate: 5,
  hurdle: 0.6,
  tree: { min: 8, max: 12 },
} as const;

export interface AuditResult {
  ok: boolean;
  /** One line per axis that is out of tolerance, e.g. "h 5.1 m, want 13 m (-61%)". */
  problems: string[];
}

/** Compare a measured world-space size with the target for `id`. Unknown ids fail rather than pass silently. */
export function auditSize(id: string, measured: Size, tolerance = SCALE_TOLERANCE): AuditResult {
  const want = TARGETS[id];
  if (!want) return { ok: false, problems: [`no target for "${id}"`] };
  const problems: string[] = [];
  for (const axis of ['w', 'd', 'h'] as const) {
    const m = measured[axis];
    const t = want[axis];
    if (!Number.isFinite(m) || m <= 0) {
      problems.push(`${axis} is ${m}`);
      continue;
    }
    const dev = (m - t) / t;
    if (Math.abs(dev) > tolerance) {
      problems.push(`${axis} ${m.toFixed(2)} m, want ${t} m (${dev >= 0 ? '+' : ''}${Math.round(dev * 100)}%)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Tree height in the allowed band for hero trees (design sheets: 8 to 12 m). */
export function treeHeightOk(h: number): boolean {
  return h >= WORLD_SIZES.tree.min && h <= WORLD_SIZES.tree.max;
}
