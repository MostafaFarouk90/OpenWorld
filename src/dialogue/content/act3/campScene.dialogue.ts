// "scene-act3-camp" (K16 PR 2, plan Q8): the camp scene after "The Coal-Mother's Oath" card, at the Wyrmwatch Lodge
// hearth (the ending director fades and moves the party there first). The companions, Thorgar and Hathren's voice from
// the fen. No choices; written to fit every branch (M31 won or yielded, Skarl spared or beaten). Taste call, logged in
// design/changes-applied.md. "The story continues" is the card's last line (K15), not the scene's.
// Plays once: the last line sets `story.a3.campSeen`, the director's record that it ran to its end.
import { buildTree, type Line } from '../act2/build';
import { all } from '../act2/cond';

export const ACT3_CAMP_DIALOGUE = 'scene-act3-camp';
export const ACT3_CAMP_SEEN_FLAG = 'story.a3.campSeen';

const line = (s: string, t: string): Line => ({ s, t });

export const ACT3_CAMP_LINES: readonly Line[] = [
  line('thorgar', 'Twenty winters this hearth stood cold. My father lit it for the hunt. I never thought to see it lit for anything else.'),
  line('hrolf', 'Your hunters stood watch beside the wyrms tonight, and nobody reached for a spear. That is a stranger sight than any dragon.'),
  line('aelfreda', 'The Aerie\'s banners are ash, and the drake sleeps on its own roost. Skarl\'s hunt is broken, and no one had to burn the mountain to do it.'),
  line('cael', 'Ysmeryth kept her word. The Coal-Mother\'s oath holds, as long as we keep ours.'),
  line('hathren', 'Small knight. The fen is quiet, and my brood sleep in clean water. I hear the mountain breathing with you. It is a good sound.'),
  line('hrolf', 'Even the dragon in the bog says thank you. I will never get used to this road.'),
  line('thorgar', 'Sleep here as long as you like. The lodge owes you a bed, and the mountain owes you more than I can pay.'),
  line('aelfreda', 'Rest, then. The heart of this land still burns somewhere deeper than these peaks, and it will not wait for us forever.'),
  { s: 'cael', t: 'Then we rest tonight. Tomorrow, the road goes on.', fx: [{ setFlag: ACT3_CAMP_SEEN_FLAG, value: true }] },
];

export const SCENE_ACT3_CAMP = buildTree({
  id: ACT3_CAMP_DIALOGUE,
  start: [{ when: all(), seg: 'scene' }],
  segments: { scene: { lines: [...ACT3_CAMP_LINES] } },
});
