// K10: one shard-gem per boss, paid once (plans/act3-K10.md section 3). The live drop and the D01 to D04 retro-grant
// share `gear.shardgem.granted.<bossId>`, so a boss is never paid twice. Both wait until a class is chosen (the gem is
// that class's); a full stack leaves the flag unset so the next load or class choice retries.
import type { ClassId } from '../../actors/classes';
import { gemFor } from './table';
import { GEM_BOSSES, grantedFlag } from './tuning';

export interface GrantPorts {
  getFlag(key: string): unknown;
  setFlag(key: string, value: true): void;
  /** null until the player has chosen a class. */
  classId(): ClassId | null;
  add(itemId: string, n: number): number;
  /** Whether a quest is completed (absent: only the boss outcome flag counts). */
  questDone?(questId: string): boolean;
}

export type GrantOutcome = { bossId: string; gemId: string } | null;

/** Pays the boss's gem if it is a gem boss, a class is chosen, it was not paid, and there is room. */
export function grantBossGem(p: GrantPorts, bossId: string): GrantOutcome {
  const row = GEM_BOSSES.find((b) => b.bossId === bossId);
  const cls = p.classId();
  if (!row || !cls || p.getFlag(grantedFlag(bossId))) return null;
  const gem = gemFor(cls, row.variant);
  if (p.add(gem.id, 1) < 1) return null;
  p.setFlag(grantedFlag(bossId), true);
  return { bossId, gemId: gem.id };
}

/** Whether the boss is behind the player: its outcome flag, or its dungeon quest completed. */
export function bossBeaten(p: Pick<GrantPorts, 'getFlag' | 'questDone'>, bossId: string): boolean {
  const row = GEM_BOSSES.find((b) => b.bossId === bossId);
  if (!row) return false;
  const outcome = p.getFlag(`boss.${bossId}.outcome`);
  return (typeof outcome === 'string' && outcome !== '') || p.questDone?.(row.questId) === true;
}

/** The retro-grant (D01 to D04 for older saves) and the retry of any drop a full stack refused: every beaten, unpaid boss. */
export function retroGrant(p: GrantPorts): GrantOutcome[] {
  const out: GrantOutcome[] = [];
  for (const b of GEM_BOSSES) {
    if (!bossBeaten(p, b.bossId)) continue;
    const r = grantBossGem(p, b.bossId);
    if (r) out.push(r);
  }
  return out;
}
