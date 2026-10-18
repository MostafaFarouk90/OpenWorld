import type { GameContext } from '../core/Game';

/** What the recap needs to know about the save. Every lookup is total: a missing thing is `false` or `undefined`. */
export interface RecapRead {
  /** True only when the quest exists and is completed. */
  questDone(id: string): boolean;
  flag(key: string): string | number | boolean | undefined;
}

export interface RecapLine {
  id: string;
  textKey: string;
  when(read: RecapRead): boolean;
}

export interface RecapEntry {
  id: string;
  textKey: string;
}

const K = (id: string): string => `hud.journal.recap.${id}`;

/** A completion beat: shown when the quest is done. */
const done = (quest: string): RecapLine => ({ id: quest, textKey: K(quest), when: (r) => r.questDone(quest) });

/** An outcome line: shown when the flag holds this exact value. */
const flagIs = (id: string, key: string, value: string | boolean): RecapLine => ({
  id, textKey: K(id), when: (r) => r.flag(key) === value,
});

/**
 * A beat with outcome variants: one line per known value, plus the plain completion text when the quest is done
 * and the flag is missing or holds a value we do not know.
 */
function beat(quest: string, flagKey: string, variants: readonly string[]): RecapLine[] {
  const known = (r: RecapRead): boolean => variants.includes(r.flag(flagKey) as string);
  return [
    { id: quest, textKey: K(quest), when: (r) => r.questDone(quest) && !known(r) },
    ...variants.map((v) => flagIs(`${quest}.${v}`, flagKey, v)),
  ];
}

/** A flag only line (no quest): one per known value. */
const outcomes = (idPrefix: string, flagKey: string, map: Readonly<Record<string, string>>): RecapLine[] =>
  Object.entries(map).map(([value, id]) => flagIs(`${idPrefix}.${id}`, flagKey, value));

/** Act 1 in story order. Appending a line here is the only change a new beat needs. */
export const RECAP_LINES: readonly RecapLine[] = [
  done('m01'),
  done('m02'),
  ...outcomes('barley', 'world.brightwater.barley', { scorched: 'scorched', saved: 'saved' }),
  done('m03'),
  done('m04'),
  done('m05'),
  flagIs('tobb.joined', 'story.m05.tobbJoined', true),
  ...beat('m06', 'story.m06.route', ['stealth', 'bribe', 'persuasion']),
  done('m07'),
  ...beat('m08', 'story.m08.stance', ['warm', 'wary']),
  done('m09'),
  ...outcomes('inn', 'world.harrowmark.inn.price', { forgiven: 'forgiven', collected: 'collected' }),
  done('m10'),
  ...beat('d01', 'boss.ashen-prior.outcome', ['defeated', 'released']),
  ...beat('d02', 'boss.gaffer-grimtooth.outcome', ['defeated', 'released']),
  done('r01'),
  done('r02'),
  done('r03'),
  ...beat('r04', 'story.r04.choice', ['expose', 'shield']),
];

/** Pure: which beats have happened, in story order. A throwing `when` or `read` drops that line only. */
export function buildRecap(read: RecapRead, lines: readonly RecapLine[] = RECAP_LINES): RecapEntry[] {
  const out: RecapEntry[] = [];
  for (const line of lines) {
    let on = false;
    try { on = line.when(read); } catch { on = false; }
    if (on) out.push({ id: line.id, textKey: line.textKey });
  }
  return out;
}

interface QuestsLike { get(id: string): unknown; state(id: string): string }

/** Reads the live game: quests through the soft `quests` service, flags through world state. */
export function readFromContext(ctx: GameContext): RecapRead {
  return {
    questDone(id) {
      const quests = (ctx.services as unknown as { get(n: string): unknown }).get('quests') as QuestsLike | undefined;
      if (!quests) return false;
      // get() first so an unknown id never reaches state(), which warns.
      if (!quests.get(id)) return false;
      return quests.state(id) === 'completed';
    },
    flag(key) { return ctx.state.getFlag(key) as string | number | boolean | undefined; },
  };
}

/** Recap as display strings, for the Story tab and the ending card. */
export function recapLines(ctx: GameContext, t: (key: string) => string): string[] {
  return buildRecap(readFromContext(ctx)).map((e) => t(e.textKey));
}
