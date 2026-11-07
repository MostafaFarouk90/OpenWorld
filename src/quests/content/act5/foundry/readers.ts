// Act 5 N11: the choice readers of the Foundry and Anvil quests (plan 2.5), pure over a flag reader so the dialogue, the
// director, N9's journal and N12's ending matrix read the same answer. A missing or unknown flag falls back to the reading
// the plan names (never a throw): an old save still resolves.
import { bandAt, type FavourBand } from '../../../../state/favour';
import { ROSTER_FLAGS, m52Roster, type DragonId } from '../../../../siege/roster';
import { D09_TURNED, R27_CHOICE, R28_PYRES, R30_VERSE, R30_VERSES, VEY_OUTCOME, type R27Choice, type R30Verse } from './flags';

export interface FlagReader { getFlag(key: string): unknown }

/** F1 (M21): Spy or Confront. An unset flag reads as Spy (the gentler branch: pickets only, Wenna turns the guards). */
export const f1 = (f: FlagReader): 'spy' | 'confront' => (f.getFlag('story.m21.choice') === 'confront' ? 'confront' : 'spy');
/** F5 (R10): who the tunnel's garrison is. */
export const f5 = (f: FlagReader): 'miners' | 'stewards' | 'compromise' | 'none' => {
  const v = f.getFlag(ROSTER_FLAGS.r10);
  return v === 'miners' || v === 'stewards' || v === 'compromise' ? v : 'none';
};
/** F6 (R21): `leaders` opens the tunnel's far end (one more wave). */
export const f6 = (f: FlagReader): 'all' | 'leaders' => (f.getFlag(ROSTER_FLAGS.r21) === 'leaders' ? 'leaders' : 'all');
/** F7 (R23): public or private. */
export const f7 = (f: FlagReader): 'public' | 'private' => (f.getFlag(ROSTER_FLAGS.r23) === 'public' ? 'public' : 'private');
/** F8 (R24): `all` (the Ashwalkers fought at the siege and light pyres beside Cael) or `half`. */
export const f8 = (f: FlagReader): 'all' | 'half' => (f.getFlag(ROSTER_FLAGS.r24) === 'all' ? 'all' : 'half');
/** F2 (M31): won or yielded. */
export const f2 = (f: FlagReader): 'won' | 'yielded' => (f.getFlag(ROSTER_FLAGS.m31) === 'yielded' ? 'yielded' : 'won');
/** F4 (R06): Cleanse (Maud cooks at the Rim Camp) or Seal. */
export const f4 = (f: FlagReader): 'cleanse' | 'seal' => (f.getFlag('story.r06.choice') === 'cleansed' ? 'cleanse' : 'seal');
/** R11: the hill wyrm spared. */
export const r11Spared = (f: FlagReader): boolean => f.getFlag(ROSTER_FLAGS.r11) === 'spared';
/** R16: Eadgyth's axe given to Ysmeryth. */
export const r16Given = (f: FlagReader): boolean => f.getFlag('story.r16.choice') === 'give';
/** D08: Eormen released (his crown is the one spirit-flame nobody else gives). */
export const eormenReleased = (f: FlagReader): boolean => f.getFlag('boss.eormen.outcome') === 'released';
/** D09: Vey spared for trial or struck down. Unset (an old save, never in play after D09) reads as spared. */
export const veyOutcome = (f: FlagReader): 'spared' | 'defeated' => (f.getFlag(VEY_OUTCOME) === 'defeated' ? 'defeated' : 'spared');
export const r27Choice = (f: FlagReader): R27Choice | undefined => {
  const v = f.getFlag(R27_CHOICE);
  return v === 'collapse' || v === 'keep' ? v : undefined;
};
/** R28: pyres lit, 0 to 4. */
export const pyresLit = (f: FlagReader): number => {
  const v = f.getFlag(R28_PYRES);
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(4, Math.floor(v))) : 0;
};
/** R30: the chosen verse, or undefined (R30 skipped: the credits play the fixed verses). */
export const r30Verse = (f: FlagReader): R30Verse | undefined => {
  const v = f.getFlag(R30_VERSE);
  return (R30_VERSES as readonly unknown[]).includes(v) ? (v as R30Verse) : undefined;
};

/** A track's band at a snapshot, read as Cold when the snapshot was never taken (an old save). */
export const bandOr = (f: FlagReader, snap: string, track: Parameters<typeof bandAt>[2]): FavourBand => bandAt(f, snap, track) ?? 'cold';

/**
 * D09 (plan 2.2): how many of the four Grisel guards Wenna turns. Confront: none. Spy: all four at Grisel 25 or more at the
 * D09 read, half otherwise.
 */
export function guardsTurned(f: FlagReader): 0 | 2 | 4 {
  if (f1(f) === 'confront') return 0;
  return bandOr(f, 'd09', 'grisel') === 'cold' ? 2 : 4;
}
/** The turned count as written at the vat gallery (falls back to the rule). */
export const turnedWritten = (f: FlagReader): number => {
  const v = f.getFlag(D09_TURNED);
  return typeof v === 'number' ? v : guardsTurned(f);
};

/** The Houses whose banner held at the Rim Gate (F3; N4's roster at the M52 snapshot). */
export const bannersHeld = (f: FlagReader): readonly ('halvard' | 'oswin' | 'grisel')[] => m52Roster(f).banners;
/** The dragons who came to the siege (N4's roster: every rostered dragon arrived once M52 completed). */
export const dragonsAtSiege = (f: FlagReader): readonly DragonId[] => m52Roster(f).dragons.map((d) => d.id);

// ---- the "last chance on the rim" list (Q12) --------------------------------------------------------------------------------

/** The optional rim quests the descent leaves behind (Q12). */
export const RIM_OPTIONAL = ['r28', 'r29', 'r30'] as const;
export type RimOptional = (typeof RIM_OPTIONAL)[number];

export interface QuestStateReader {
  state(id: string): 'inactive' | 'active' | 'completed' | 'failed' | undefined;
  /** True when the quest could start now (its startWhen holds); absent readers count an inactive quest as not offered. */
  canStart?(id: string): boolean;
}

/**
 * The rim quests still open before M54 (N9's journal note and Alric's warning both read this): each of R28, R29, R30 that
 * is active, or inactive and offered now. A quest with no def, completed, failed or not offered is left out.
 */
export function openRimQuests(q: QuestStateReader): RimOptional[] {
  return RIM_OPTIONAL.filter((id) => {
    const s = q.state(id);
    if (s === 'active') return true;
    if (s === 'inactive') return q.canStart?.(id) === true;
    return false;
  });
}
