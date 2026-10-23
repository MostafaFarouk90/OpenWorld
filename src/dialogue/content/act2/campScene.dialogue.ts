// "scene-act2-camp" (A16): the camp scene after "The Houses Stand" card. Wenna Grisel joins the camp, and the second
// companion seat is open (the seat itself follows `story.gate.a3`, set by the ending director before the card).
// Plays once: the last line sets `story.a2.campSeen`, the director's record that it ran to its end.
import { buildTree } from './build';
import { all } from './cond';

export const ACT2_CAMP_SEEN_FLAG = 'story.a2.campSeen';
/** Set by the scene's last line: Wenna is at the camp from here on (readers: presence rules, banter). */
export const ACT2_WENNA_CAMP_FLAG = 'story.a2.wennaAtCamp';

export const SCENE_ACT2_CAMP = buildTree({
  id: 'scene-act2-camp',
  start: [{ when: all(), seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        { s: 'tobb', t: 'There. Pledged and sealed, and the Houses still standing. I have not seen the Keep hall so quiet since before the smoke.' },
        { s: 'gaut', t: 'The fountain in the square is running. I heard it from the Keep road, and I stopped like a boy to listen. Water, in Harrowmark, on a working day.' },
        { s: 'aelfreda', t: 'The stalls have lifted their shutters too. People are buying bread without looking over their shoulders. That is a kind of healing no rite of mine could give.' },
        { s: 'wenna', t: 'May I sit? I have been standing at my father\'s side for so long that I forgot a fire could be warm.' },
        { s: 'cael', t: 'There is room. You walked us through the Galleries. You have earned a seat.' },
        { s: 'wenna', t: 'Then I will not go back to the court. My father keeps his seat, and the Council will watch him. I would rather watch the road with people who tell me the truth.' },
        { s: 'hrolf', t: 'Another mouth at the fire. Good. She can carry the second kettle.' },
        { s: 'wenna', t: 'I can do better than carry kettles. Ask me when the road turns bad, and I will say what I see.' },
        { s: 'tobb', t: 'Mind the party, {name}. There is a second seat beside you now, and I would not leave it empty. Choose at any waystone.' },
        {
          s: 'cael',
          t: 'Then the fire is a little bigger, and the road ahead is long. Let it come.',
          fx: [{ setFlag: ACT2_CAMP_SEEN_FLAG, value: true }, { setFlag: ACT2_WENNA_CAMP_FLAG, value: true }, { event: 'story.act2.camp.end' }],
        },
      ],
    },
  },
});
