import type { ActorId, MercyEventLike } from './ports';

/** Per-creature counts the codex displays (thread 8 reads `enemies.mercyTally()`). */
export interface TallyRow {
  release: number;
  spare: number;
  calm: number;
  killed: number;
}
export type TallyVerb = 'release' | 'spare' | 'calm';

export interface TallySaved {
  rows: Record<string, TallyRow>;
}

const emptyRow = (): TallyRow => ({ release: 0, spare: 0, calm: 0, killed: 0 });

function verbOf(v: MercyEventLike['verb']): TallyVerb {
  // The Warm Hand is a Calm (design section 3); Release and Spare count as themselves.
  return v === 'warmHand' ? 'calm' : v;
}

/**
 * Mercies and kills per creature kind. A revoked mercy is subtracted, which needs the creature, so
 * the live actor to row map is kept for the session (WorldState credits do not outlive it either).
 */
export class MercyTally {
  readonly key = 'enemies.mercy.tally';
  readonly version = 1;
  private rows = new Map<string, TallyRow>();
  private live = new Map<ActorId, { creature: string; verb: TallyVerb }>();

  private row(creature: string): TallyRow {
    let r = this.rows.get(creature);
    if (!r) this.rows.set(creature, (r = emptyRow()));
    return r;
  }

  mercy(e: MercyEventLike): void {
    const verb = verbOf(e.verb);
    if (e.actorId) {
      // One creature earns one credit: a duplicate emit adds nothing.
      if (this.live.has(e.actorId)) return;
      this.live.set(e.actorId, { creature: e.creature, verb });
    }
    this.row(e.creature)[verb]++;
  }

  revoked(actorId: ActorId): void {
    const hit = this.live.get(actorId);
    if (!hit) return;
    this.live.delete(actorId);
    const r = this.row(hit.creature);
    r[hit.verb] = Math.max(0, r[hit.verb] - 1);
  }

  killed(creature: string): void {
    this.row(creature).killed++;
  }

  snapshot(): Record<string, TallyRow> {
    return Object.fromEntries([...this.rows].map(([k, v]) => [k, { ...v }]));
  }

  serialize(): TallySaved {
    return { rows: this.snapshot() };
  }

  load(data: unknown): void {
    this.rows = new Map();
    this.live = new Map();
    const rows = (data as TallySaved | null)?.rows;
    if (!rows || typeof rows !== 'object') return;
    for (const [k, v] of Object.entries(rows)) {
      if (!v || typeof v !== 'object') continue;
      const r = emptyRow();
      for (const f of ['release', 'spare', 'calm', 'killed'] as const) {
        const n = (v as unknown as Record<string, unknown>)[f];
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) r[f] = Math.floor(n);
      }
      this.rows.set(k, r);
    }
  }
}
