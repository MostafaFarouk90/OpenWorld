// Act 5 N11: every flag this block writes, in one place (plans/act5-N11.md). N11 is the only writer of `story.<id>.*` for
// r27, r28, r30, m53, d09, m54, m55, d10, m56, and of `shrine.anvil-of-ages.lit` (ACT5_FLAG_OWNERS).
import { M56_CHOICE_FLAG as N0_M56_CHOICE_FLAG } from '../../../../region/act5Regions';

// ---- R27 -------------------------------------------------------------------------------------------------------------------
/** `collapse` or `keep` (plan 2.2). */
export const R27_CHOICE = 'story.r27.choice';
export type R27Choice = 'collapse' | 'keep';
/** The tunnel's far seal is open (N2's seal reads it): from R27's start with F6 Leaders, after `keep`; false after `collapse`. */
export const R27_FAR_OPEN = 'story.r27.farOpen';
export const R27_PROP = (n: number): string => `story.r27.prop${n}`;
export const R27_LAMP = (n: number): string => `story.r27.lamp${n}`;
export const R27_CHARGE = (n: number): string => `story.r27.charge${n}`;
/** The line is set (every prop, lamp and charge): the hold trigger may start the siege. */
export const R27_LINE_READY = 'story.r27.lineReady';
/** Set when the siege completes (`siege.completed` for r27). */
export const R27_HELD = 'story.r27.held';

// ---- R28 -------------------------------------------------------------------------------------------------------------------
/** 0 to 4 pyres lit with Heartshard fire (plan 2.2). */
export const R28_PYRES = 'story.r28.pyres';
export const R28_NAME = (n: number): string => `story.r28.name${n}`;
export const R28_TOKEN = (n: number): string => `story.r28.token${n}`;
export const R28_LAID = (n: number): string => `story.r28.laid${n}`;
export const R28_LIT = (n: number): string => `story.r28.lit${n}`;
export const R28_RISEN_ARM = (n: number): string => `story.r28.risen${n}Armed`;
export const R28_RISEN_DOWN = (n: number): string => `story.r28.risen${n}Down`;

// ---- R30 -------------------------------------------------------------------------------------------------------------------
/** `gaut`, `keepers`, `houses` or `walkers` (plan 2.2, Q6): the credits song's chosen verse. */
export const R30_VERSE = 'story.r30.verse';
export const R30_VERSES = ['gaut', 'keepers', 'houses', 'walkers'] as const;
export type R30Verse = (typeof R30_VERSES)[number];
export const R30_LINE = (npc: string): string => `story.r30.line.${npc}`;
/** The tune drummed on the camp anvil (the rhythm run passed). */
export const R30_TUNE = 'story.r30.tune';
export const R30_TUNE_FAILS = 'story.r30.tuneFails';

// ---- M53 -------------------------------------------------------------------------------------------------------------------
export const M53_TRUCE_SEEN = 'story.m53.truce';
export const M53_BROKEN_ARM = 'story.m53.brokenArmed';
export const M53_BROKEN_DOWN = 'story.m53.brokenDown';

// ---- D09 -------------------------------------------------------------------------------------------------------------------
/** The slag is routed and the lift gate opens (N2's `foundry.lift.gate` reads it). */
export const D09_SLAG = 'story.d09.slag';
export const D09_SLUICE = (n: number): string => `story.d09.sluice${n}`;
export const D09_SLAG_FAILS = 'story.d09.slagFails';
/** How many of the four Grisel guards Wenna turned (F1 Spy: 4 at Grisel 25 or more at the D09 read, 2 below; Confront: 0). */
export const D09_TURNED = 'story.d09.turned';
export const D09_PATROL_ARM = 'story.d09.patrolArmed';
export const D09_PATROL_DOWN = 'story.d09.patrolDown';
export const D09_GUARDS_ARM = 'story.d09.guardsArmed';
export const D09_GUARDS_DOWN = 'story.d09.guardsDown';
export const VEY_OUTCOME = 'boss.vey.outcome';

// ---- M54 -------------------------------------------------------------------------------------------------------------------
/** All four murals read (N9's codex entry "the first king and the keepers" unlocks on it). */
export const M54_MURALS_FLAG = 'story.m54.murals';
export const M54_THRALLS_ARM = 'story.m54.thrallsArmed';
export const M54_THRALLS_DOWN = 'story.m54.thrallsDown';
/** A rim quest withdrawn when M54 started (`story.<id>.leftOnRim`, plan 2.3). */
export const LEFT_ON_RIM = (id: string): string => `story.${id}.leftOnRim`;

// ---- D10 and M56 -------------------------------------------------------------------------------------------------------------
export const D10_ADDS_ARM = 'story.d10.addsArmed';
export const D10_ADDS_DOWN = 'story.d10.addsDown';
export const ULTHRED_OUTCOME = 'boss.ulthred.outcome';
/** `rekindle` or `let-it-die` (N0's `M56_CHOICES`). */
export const M56_CHOICE_FLAG = N0_M56_CHOICE_FLAG;
/** Always written with the choice, true or false (N13 reads `=== false` as Cael died). */
export const M56_CAEL_LIVES_FLAG = 'story.m56.caelLives';
/** The Scar count read at the moment of the choice (the epilogue and N12's matrix read it). */
export const M56_SCARS_FLAG = 'story.m56.scars';
export const ANVIL_LIT_FLAG = 'shrine.anvil-of-ages.lit';
/** The shipped mirror of the Scar count (spells.plugin writes it). */
export const SCARS_MIRROR_FLAG = 'story.f10.scars';
