// Act 5 N9 (plans/act5-N9.md section 4, Q13): the Scar line and the Rite note before M56's choice. Pure.
import { REKINDLE_SCAR_LIMIT } from './ports';

export interface ScarPorts {
  flag(key: string): boolean;
  scars(): number | undefined;
  t(key: string, params?: Record<string, string | number>): string;
}

export const SCAR_NOTE_FROM_FLAG = 'story.m54.started';
export const M56_CHOICE_FLAG = 'story.m56.choice';
export const ACT5_RITE_USED_FLAG = 'aelfreda.rite.a5';

/** From M54 starting until the choice is made. null when hidden. */
export function scarNote(p: ScarPorts, limit = REKINDLE_SCAR_LIMIT): { id: string; title: string; lines: string[] } | null {
  if (!p.flag(SCAR_NOTE_FROM_FLAG) || p.flag(M56_CHOICE_FLAG)) return null;
  const n = p.scars();
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const scars = Math.max(0, Math.floor(n));
  const lines = [scars >= limit ? p.t('hud.journal.scars.dies', { n: scars, limit }) : p.t('hud.journal.scars.lives', { n: scars, limit })];
  if (!p.flag(ACT5_RITE_USED_FLAG)) lines.push(p.t('hud.journal.scars.rite'));
  return { id: 'scars.a5', title: p.t('hud.journal.scars.title'), lines };
}

export const LAST_CHANCE_QUESTS: readonly string[] = ['r28', 'r29', 'r30'];

export interface LastChancePorts {
  flag(key: string): boolean;
  questState(id: string): string;
  questDef(id: string): { titleKey: string } | undefined;
  t(key: string, params?: Record<string, string | number>): string;
}

/** Once D09 and R27 are done and M54 is not started (never after `story.m54.started`, so a load past it shows nothing). */
export function lastChanceNote(p: LastChancePorts): { id: string; title: string; lines: string[] } | null {
  if (p.flag(SCAR_NOTE_FROM_FLAG)) return null;
  if (p.questState('m54') !== 'inactive') return null;
  if (p.questState('d09') !== 'completed' || p.questState('r27') !== 'completed') return null;
  const open = LAST_CHANCE_QUESTS.filter((q) => {
    const s = p.questState(q);
    // QuestState has no 'offered': an unstarted side quest with a def counts as still open (D09 and R27 done means Phase J).
    return (s === 'active' || s === 'inactive') && !!p.questDef(q);
  });
  if (open.length === 0) return null;
  return {
    id: 'lastchance.m54',
    title: p.t('hud.journal.lastChance.title'),
    lines: [...open.map((q) => p.t(p.questDef(q)!.titleKey)), p.t('hud.journal.lastChance.optional')],
  };
}
