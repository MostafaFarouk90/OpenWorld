// Act 5 N9 (plans/act5-N9.md section 4, Q13): the Scar line and the Rite note before M56's choice. Pure.
import { REKINDLE_SCAR_LIMIT } from './ports';
import { openRimQuests, RIM_OPTIONAL } from '../../quests/content/act5/foundry/readers';

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

export const LAST_CHANCE_QUESTS: readonly string[] = RIM_OPTIONAL;

export interface LastChancePorts {
  flag(key: string): boolean;
  questState(id: string): string;
  questDef(id: string): { titleKey: string } | undefined;
  /** The quests this quest's `startWhen` needs completed (L9's `requiredQuests`); none when omitted. */
  needs?(id: string): readonly string[];
  t(key: string, params?: Record<string, string | number>): string;
}

/** Once D09 and R27 are done and M54 is not started (never after `story.m54.started`, so a load past it shows nothing). */
export function lastChanceNote(p: LastChancePorts): { id: string; title: string; lines: string[] } | null {
  if (p.flag(SCAR_NOTE_FROM_FLAG)) return null;
  if (p.questState('m54') !== 'inactive') return null;
  if (p.questState('d09') !== 'completed' || p.questState('r27') !== 'completed') return null;
  // N11's openRimQuests decides what is still open (an unstarted quest counts only when every quest its `startWhen` needs is done).
  const open = openRimQuests({
    state: (q) => p.questState(q) as 'inactive' | 'active' | 'completed' | 'failed',
    canStart: (q) => (p.needs?.(q) ?? []).every((n) => p.questState(n) === 'completed'),
  }).filter((q) => p.questDef(q) !== undefined);
  if (open.length === 0) return null;
  return {
    id: 'lastchance.m54',
    title: p.t('hud.journal.lastChance.title'),
    lines: [...open.map((q) => p.t(p.questDef(q)!.titleKey)), p.t('hud.journal.lastChance.optional')],
  };
}
