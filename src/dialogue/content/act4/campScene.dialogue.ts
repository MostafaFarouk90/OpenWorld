// "scene-act4-camp" (L13 PR 2, plan Q8, v0.8 item 14): the camp scene after "The Road to the Rim" card, at the Rimfoot fire
// under the Caldera's wall (the ending director fades and moves the party there first). Wulfhild, Ebba, the companions and
// Cael. No choices; written to fit every branch (Eormen released or defeated, R24's water shared or kept, any M36 delegate
// won or lost, Halvard's favour high or low). Taste call, logged in design/changes-applied.md ("Act 4 L13"). "The story
// continues" is the card's last line, not the scene's. Plays once: the last line sets `story.a4.campSeen`.
import { buildTree, type Line } from '../act2/build';
import { all } from '../act2/cond';
import { EBBA } from '../../../quests/content/act4/waste/m44.quest';

export const ACT4_CAMP_DIALOGUE = 'scene-act4-camp';
export const ACT4_CAMP_SEEN_FLAG = 'story.a4.campSeen';

const line = (s: string, t: string): Line => ({ s, t });

export const ACT4_CAMP_LINES: readonly Line[] = [
  line('wulfhild', 'Every walker who reached this fire left a stone by it. Sit on yours, knight. You have earned the warm side.'),
  line('hrolf', 'Three cairns held, a column of the dead broken on its own road, and not one of us lost. I will tell it badly for years.'),
  line(EBBA, 'The cathedral bell has stopped. My mother used to say it rang for the ones who never got home. Now it does not have to.'),
  line('aelfreda', 'Harrowmark is still Vey\'s, and the boy is still a king without a city. We have not won anything yet.'),
  line('cael', 'No. But we have a road, and people who will walk it with us. Gaut would have called that a start.'),
  line('wulfhild', 'Up there is the Caldera, where the Sunforge first burned. Whatever Vey is feeding on, it comes from that fire. The rim will not open for one knight alone.'),
  line('hrolf', 'Then it is a good thing he is not alone.'),
  { s: 'cael', t: 'Tomorrow, the rim. Tonight we keep the fire.', fx: [{ setFlag: ACT4_CAMP_SEEN_FLAG, value: true }] },
];

export const SCENE_ACT4_CAMP = buildTree({
  id: ACT4_CAMP_DIALOGUE,
  start: [{ when: all(), seg: 'scene' }],
  segments: { scene: { lines: [...ACT4_CAMP_LINES] } },
});
