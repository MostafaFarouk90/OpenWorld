/**
 * What an enemy reads from `actor.data['status']` (actors-and-damage.md section 10: "Stun on enemies is an entry on
 * `actor.data['status']`; enemies read slow and stun from it"). The shape is thread 2's and not pinned in the
 * contract, so the reader accepts the likely forms and ignores anything else:
 *  - an array of entries `{ kind, remaining?, slow? }`;
 *  - an object keyed by kind: `{ stun: 0.8 }`, `{ stun: { remaining: 0.8 } }`, `{ slow: { slow: 0.4, remaining: 2 } }`.
 * Expired (remaining <= 0) and non-finite entries are skipped; the strongest of each kind wins.
 */
export interface StatusRead {
  /** Seconds of stun left (0 when not stunned). */
  stunSeconds: number;
  /** Multiplier on move speed: 1 - the largest slow fraction, in [0.1, 1]. */
  speedScale: number;
}

/**
 * LOCAL PORT of thread 2's `ActorStatusView` (`src/status/view.ts`, PR #45, not on this branch yet). Same shape: the
 * object under `actor.data[STATUS_DATA_KEY]`. When that file lands, replace this port with an import of its type and key.
 * Read it every tick and never keep a reference; `undefined` means no status.
 */
export interface ActorStatusView {
  stunned: boolean;
  /** Seconds of stun left. */
  stunRemaining: number;
  /** Fraction of move speed removed, 0..1 (speed scales by `1 - slow`). */
  slow: number;
}
export const STATUS_DATA_KEY = 'status';

const NONE: StatusRead = { stunSeconds: 0, speedScale: 1 };

export function readStatusData(raw: unknown): StatusRead {
  if (!raw || typeof raw !== 'object') return NONE;
  if (!Array.isArray(raw) && ('stunned' in raw || 'stunRemaining' in raw || typeof (raw as { slow?: unknown }).slow === 'number')) {
    const v = raw as Partial<ActorStatusView>;
    const stun = v.stunned === true ? Math.max(num(v.stunRemaining, 0), 0.05) : 0;
    const slow = clamp01(num(v.slow, 0));
    return stun === 0 && slow === 0 ? NONE : { stunSeconds: stun, speedScale: Math.max(0.1, 1 - slow) };
  }
  let stun = 0;
  let slow = 0;
  const take = (kind: unknown, value: unknown): void => {
    if (kind !== 'stun' && kind !== 'slow') return;
    const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    const remaining = num(v ? (v['remaining'] ?? v['seconds']) : value, kind === 'slow' ? 1 : 0);
    if (!(remaining > 0)) return;
    if (kind === 'stun') stun = Math.max(stun, remaining);
    else slow = Math.max(slow, clamp01(num(v ? (v['slow'] ?? v['amount']) : undefined, 0.5)));
  };
  if (Array.isArray(raw)) {
    for (const e of raw) if (e && typeof e === 'object') take((e as Record<string, unknown>)['kind'], e);
  } else {
    for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) take(kind, value);
  }
  return stun === 0 && slow === 0 ? NONE : { stunSeconds: stun, speedScale: Math.max(0.1, 1 - slow) };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp01(v: number): number {
  return Math.min(0.9, Math.max(0, v));
}
