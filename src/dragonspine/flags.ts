// The flags the Dragonspine places read (none written here). Quest threads write them: K13 owns `story.r16.*` and the summit's
// `story.m3x.*` and `story.d06.*`; K8 writes Skarl's outcome.
/** Written by K13 when R16 is accepted; the collapsed cave's door opens on it. */
export const R16_STARTED_FLAG = 'story.r16.started';
/** Written by K13 when the rockfall in the cave passage is cleared; the blocker opens on it (and closes again on a load without it). */
export const R16_ROCKFALL_CLEARED_FLAG = 'story.r16.rockfallCleared';
/** The region is held until Phase F; tests (and the jump) set it. Defined by the jump (K0). */
export { DRAGONSPINE_OPEN_FLAG } from '../quests/act3Jump';

// ---- the summit (PR 2): all written by K13 (quests) or K8 (Skarl's outcome); the names are agreed in K13's brief notes.
/** Set when each of Skyhold's six net anchors is cut (n = 1..6); the net drops that section, and is gone when all six are set. */
export const m33AnchorFlag = (n: number): string => `story.m33.anchor${n}`;
/** The aerie gate's winch has been turned: the gate blocker opens. */
export const D06_GATE_OPEN_FLAG = 'story.d06.gateOpen';
/** D06 is accepted: the keep's door opens. */
export const D06_STARTED_FLAG = 'story.d06.started';
/** D06 is done: the freed drake roosts on the Aerie's north-east tower. */
export const D06_COMPLETE_FLAG = 'story.d06.complete';
/** M32 is done: with `give`, the axe lies on the hoard. */
export const M32_COMPLETE_FLAG = 'story.m32.complete';
/** M34 is done (the midpoint): the lodge's fire pit is lit and the hunters' posts face out. */
export const M34_COMPLETE_FLAG = 'story.m34.complete';
/** R16's choice (`give` or `keep`): the axe lies on the hoard only for `give`. */
export const R16_CHOICE_FLAG = 'story.r16.choice';
export const R16_GIVE = 'give';
/** D06's boss outcome (`spared` or `defeated`): Skarl's banner burns in the lodge yard only for `defeated`. */
export const SKARL_OUTCOME_FLAG = 'boss.corvin-skarl.outcome';
export const SKARL_DEFEATED = 'defeated';
