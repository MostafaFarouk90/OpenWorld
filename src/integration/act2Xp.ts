import type { ChapterHarness } from './chapterHarness';
import type { PhaseCOptions } from './phaseC';
import { KILL_XP_BASE } from '../progression/tuning';

/** One quest's pay: what kills paid (by enemy kind), what everything else paid, and the level it started and ended at. */
export interface XpRow {
  quest: string;
  kills: Record<string, { n: number; xp: number }>;
  killXp: number;
  otherXp: number;
  levelStart: number;
  levelEnd: number;
  /** the player's maximum health when the quest started (Burn from rekindles included) */
  maxHealth: number;
}

/**
 * The Phase C kill-XP census (plan section 6): hooks for `playPhaseC` that bucket every `xp.gained` by the quest being played
 * and the enemy kind that paid it. REPORT ONLY: the provisional A6b rows (`KILL_XP_BASE`) are not retuned from here; the
 * figures go to the PR and the Act 2 owner decides.
 */
export function startCensus(h: ChapterHarness): { hooks: NonNullable<PhaseCOptions['hooks']>; rows(): XpRow[]; markdown(): string } {
  const rows: XpRow[] = [];
  let cur: XpRow | null = null;
  h.ctx.events.on('xp.gained', (e) => {
    if (!cur) return;
    const m = /^kill\.(.+)$/.exec(e.source);
    if (m) {
      const k = (cur.kills[m[1]] ??= { n: 0, xp: 0 });
      k.n++;
      k.xp += e.amount;
      cur.killXp += e.amount;
    } else cur.otherXp += e.amount;
  });
  const level = () => h.ctx.services.require('progression').level;
  const hooks: NonNullable<PhaseCOptions['hooks']> = {
    before: async (q) => {
      cur = { quest: q, kills: {}, killXp: 0, otherXp: 0, levelStart: level(), levelEnd: level(), maxHealth: h.ctx.player.actor.maxHealth };
      rows.push(cur);
    },
    after: async () => {
      if (cur) cur.levelEnd = level();
      cur = null;
    },
  };
  return {
    hooks,
    rows: () => rows,
    markdown: () => {
      const lines = ['| quest | level | max health | kill XP | other XP | kills (kind x n = xp) |', '|---|---|---|---|---|---|'];
      let k = 0;
      let o = 0;
      for (const r of rows) {
        const kills = Object.entries(r.kills).map(([kind, v]) => `${kind} x${v.n} = ${v.xp} (base ${KILL_XP_BASE[kind] ?? 0})`).join(', ') || '-';
        lines.push(`| ${r.quest} | ${r.levelStart} to ${r.levelEnd} | ${r.maxHealth} | ${r.killXp} | ${r.otherXp} | ${kills} |`);
        k += r.killXp;
        o += r.otherXp;
      }
      lines.push(`| total | | | ${k} | ${o} | |`);
      return lines.join('\n');
    },
  };
}
