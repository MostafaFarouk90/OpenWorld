// The "Act 2 continues" card (A16, Phase C only): shown once when D03 is completed while `PHASE_HOLDS` still holds Oldsmoke
// shut, so a player who has finished everything Phase C built is told the road ends here for now rather than left to
// wander into the fog. Everything it needs lives in this module and the one block in hud.plugin.ts; the Phase D PR deletes
// both (and empties `PHASE_HOLDS`, which turns the card off by itself).
import { PHASE_HOLDS } from '../region/regions';

export const ACT2_CONTINUES = {
  act: 2,
  endingId: 'act2-continues',
  titleKey: 'hud.ending.a2c.title',
  quest: 'd03',
  widgetId: 'act-ending-card-a2c',
  seenFlag: 'codex.actEnding.a2c.seen',
  lines: [1, 2, 3, 4].map((n) => `hud.ending.a2c.line.${n}`),
} as const;

/** True while the Phase C hold stands: the card is a Phase C thing and retires with the hold. */
export const act2ContinuesLive = (): boolean => PHASE_HOLDS.length > 0;

export const ACT2_CONTINUES_STRINGS_EN: Record<string, string> = {
  'hud.ending.a2c.title': 'Scorchhold Falls',
  'hud.ending.a2c.line.1': 'Scorchhold is taken, and the hunters\' pens stand open.',
  'hud.ending.a2c.line.2': 'The Cinder Road runs clear from the River Gate to the keep.',
  'hud.ending.a2c.line.3': 'The way into Oldsmoke is still shut. The Council has not yet decided how to open it.',
  'hud.ending.a2c.line.4': 'The story goes on in a later update. Your save is safe, and Cinderreach is yours to walk.',
};
