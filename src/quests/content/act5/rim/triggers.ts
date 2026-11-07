import type { Q13Trigger } from '../../act2/oldsmoke/triggers';
import { M47_HAIRPIN_TRIGGER } from './m47.quest';
import { M48_CHANNELS, M48_CHAN_ANCHOR, M48_CHAN_TRIGGER } from './m48.quest';
import { R29_GONG_TRIGGER } from './r29.quest';
import { Q } from './ids';

/** Trigger volumes of the Rim quests (the director adds them once their anchors exist). N2's Cooling Hall chambers and N1's
 * own triggers are read, never added here. A channel's far lip is a small sphere (a crust walk or a Leap both land in it). */
export const RIM_A5_TRIGGERS: Q13Trigger[] = [
  { id: M47_HAIRPIN_TRIGGER, anchorId: `${Q}.m47.hairpin`, radius: 14 },
  ...M48_CHANNELS.map((n) => ({ id: M48_CHAN_TRIGGER(n), anchorId: `${M48_CHAN_ANCHOR(n)}.landed`, radius: 1.8 })),
  { id: R29_GONG_TRIGGER, anchorId: 'caldera.stokers.gong', radius: 5 },
];
