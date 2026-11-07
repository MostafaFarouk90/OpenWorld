// Act 5 region constants (contracts v0.9 items 1, 3, 10 and 16, plan embers-act-5.md Part 3): the Caldera's kill XP
// factor, the flags N0 names for the threads that write them, and the placeholder points the jump and the rules use until
// N1 places the real anchors. Engine metres throughout. Light on purpose (no imports beyond types): many modules read it.
import { ACT5_GATE_FLAG } from './regions';

export { ACT5_GATE_FLAG };

/**
 * The Caldera's kill XP factor (plan 7.2, the Waste's 2.4 raised for Act 5's longer fights). One constant: N5 may raise it
 * (up to 3.4) in this one line. Paid by every member of a `caldera-*` area wherever it stands (the rim stairs too, inside
 * the Waste's box: `AreaDef.killXpRegion`) and by anything killed inside the Caldera box once `story.gate.a5` is set.
 */
export const CALDERA_KILL_XP_FACTOR = 3.0;

/** M47's winch (N10 writes it): the Rim Gate's face opens on it, and N1's gate structure reads it on load. */
export const RIM_GATE_OPEN_FLAG = 'story.m47.rimGateOpen';
/** Phase I's hold on the bowl floor, retired by N12 PR 2 (PHASE_HOLDS.caldera is gone); kept so tests can show an old save carrying it loads cleanly. */
export const FOUNDRY_OPEN_FLAG = 'story.phase.foundryOpen';
/** M53 complete: the Inner Gate and the bowl floor open (with the hold retired). */
export const INNER_GATE_FLAG = 'story.m53.complete';
/** M52 (the siege) running and done: the keep-in is live between them. */
export const SIEGE_STARTED_FLAG = 'story.m52.started';
export const SIEGE_COMPLETE_FLAG = 'story.m52.complete';
/** The final ending (N12): set when the M56 choice has played out; the world after it reads this (Q1 (a), N13). */
export const AFTER_ENDING_FLAG = 'world.afterEnding';
/** The final ending's gate and choice flags (the act ending row, item 9). */
export const END_GATE_FLAG = 'story.gate.end';
export const M56_CHOICE_FLAG = 'story.m56.choice';
export type M56Choice = 'rekindle' | 'let-it-die';
export const M56_CHOICES: readonly M56Choice[] = ['rekindle', 'let-it-die'];

/** The Caldera box's centre, where the Anvil stands (the Anvil of Ages shrine, item 13; N1 may move it). */
export const CALDERA_CENTRE = { x: 11000, z: 8000 } as const;
/**
 * The bowl floor's radius (m) for `hole.caldera.floor`: N1's floor wall (`FLOOR_WALL_RADIUS` in
 * src/terrain/shape/caldera.ts; caldera.test.ts checks they agree). The Inner Gate's face stands on this circle.
 */
export const CALDERA_FLOOR_RADIUS = 520;
/** The Anvil's island and its lake (N1): held until D10 starts (or Ulthred's fight has an outcome). */
export const CALDERA_ANVIL_RADIUS = 260;
export const D10_STARTED_FLAG = 'story.d10.started';
export const ULTHRED_OUTCOME_FLAG = 'boss.ulthred.outcome';
/** Rimfoot, on the Waste side below the Rim Gate (M47's landing until its giver is placed). */
export const RIMFOOT_POINT = { x: 11000, z: 6200 } as const;
/** The Rim Camp placeholder, just inside the Rim Gate (every later Phase I and Phase J landing until givers are placed). */
export const RIM_CAMP_POINT = { x: 11000, z: 6750 } as const;
