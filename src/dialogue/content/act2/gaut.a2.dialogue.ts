import { buildTree, type Line } from './build';
import { all, flagIs, qActive, qDone, qIdle, step } from './cond';

const G = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'gaut', t, fx } : { s: 'gaut', t });

/** Act 2 extension of Act 1's npc-gaut: the Cinder Road column (M11). Start rules are not a catch-all; Act 1's rules follow. */
export const GAUT_A2 = buildTree({
  id: 'npc-gaut',
  start: [
    { when: flagIs('story.m11.rideout'), seg: 'a2-rideout' },
    { when: flagIs('story.m11.stage', 1), seg: 'a2-stage1' },
    { when: flagIs('story.m11.stage', 2), seg: 'a2-stage2' },
    { when: flagIs('story.m11.stage', 3), seg: 'a2-stage3' },
    { when: flagIs('story.m11.speech'), seg: 'a2-speech' },
    { when: step('m11', 'stone', 'report'), seg: 'a2-report' },
    { when: qActive('m11'), seg: 'a2-wait' },
    { when: all(qIdle('m11'), flagIs('story.gate.a2')), seg: 'a2-brief' },
    { when: qDone('m11'), seg: 'a2-after' },
  ],
  segments: {
    'a2-rideout': {
      lines: [
        G('The banner is up, {name}. Halvard\'s hawk over the River Gate, and not a man on the wall asked who gave leave. That tells you how worried they are.'),
        G('Keep close and keep your blade loose. We ride.', [{ clearFlag: 'story.m11.rideout' }]),
      ],
    },
    'a2-stage1': {
      lines: [
        G('Listen to the road. No carts, no drovers, no crows. A road this quiet has been told to be.'),
        G('Halvard is quiet like this too, these days. He sits and says little, and I have served him long enough to know the quiet is not peace.'),
        G('He sent us because he cannot send an army. Mind that when the going turns hard.', [{ clearFlag: 'story.m11.stage' }]),
      ],
    },
    'a2-stage2': {
      lines: [
        G('There. Grey on the grass, and the trees gone brittle. That is the blight Osgar wrote of, before he stopped writing.'),
        G('The Council had the reports a season ago. Two seasons, if you believe the clerks. They sent a letter about tax arrears.'),
        G('I am not a man for treason, {name}, but I have begun to count how many of their letters ever carried a soldier.', [{ clearFlag: 'story.m11.stage' }]),
      ],
    },
    'a2-stage3': {
      lines: [
        G('The dark stone is ahead, past that bend. Do you feel the cold in the air? That is not weather.'),
        G('Shields up, spacing wide. If anything stands between us and that stone, we meet it together.', [{ clearFlag: 'story.m11.stage' }]),
      ],
    },
    'a2-speech': {
      lines: [
        G('Look at that. The stone is lit again, and you did it with your own hands. I have not seen a waystone burn since I was a boy.'),
        G('It means the road is ours again, at least this far. Messengers can pass, carts can pass, and a man on this road need not walk alone in the dark.'),
        G('The blight will not care for a lit stone, mind. It will push at it. But a flame that is tended holds, and Halvard will send keepers to tend it.'),
        G('The road ahead runs to Cinderford. Osgar Thane is the reeve there, a farmer, plain as a plank. If he is alive, he is holding the town with nothing but stubbornness.'),
        G('He waits for us at Cinderford. We shall not keep him waiting longer than the road demands.'),
        G('Walk with me, {name}. You have earned the front rank, and I will not pretend I mind.', [{ clearFlag: 'story.m11.speech' }]),
      ],
    },
    'a2-report': {
      lines: [
        G('The stone burns and the wraiths are gone. I will tell Halvard, and I will tell it plainly, and he will believe me.'),
        G('I have fought beside a good many Emberwrights, {name}. Most of them lit things only when someone watched. You lit that stone and did not look back to see who saw.'),
        G('We go on to Cinderford. Osgar needs us more than the stone does now.'),
        G('Take a moment first. Catch your breath, mend what is torn. I will hold the road.'),
      ],
    },
    'a2-wait': {
      lines: [G('Keep to the banner and the ring on the road, {name}. When there is something to report, I shall be here.')],
    },
    'a2-brief': {
      lines: [
        G('Good, you came. Halvard Bastion has a poor view of the north, so I will give you mine.'),
        G('The waystones along the Cinder Road have gone dark. One by one, from the far end first. The lamplighters who tend them have not come back, and no rider has come down in nine days.'),
        G('The last word we had was from Osgar Thane, the reeve at Cinderford. A short letter. Smoke on the hills, sickness in the wells, and then nothing. Osgar writes more than that when he is bored.'),
        G('His silence is what frightens me. He is a man who sends a complaint about the weather.'),
        G('Halvard has chosen a small column. Eight spears, myself, and you. Not an army.'),
        G('Do not take that for contempt. An army on that road would be seen and would be ambushed. A small column moves fast, and it can be fed from what a few farms can spare.'),
        G('And he wants you, {name}, because a waystone is not a thing a spear can fix. It wants an Emberwright, and there are few enough of you.'),
        G('The Council would have us wait for a writ. I have asked Halvard what a writ does against a wraith. He did not answer, which is an answer.'),
        G('The banner goes up at the River Gate. It tells the road and the town that Halvard has not forgotten the north, whatever the Council thinks.'),
        G('What to expect. First, a road gone strange: no travellers, ash on the grass, the cold coming off the dark stones.'),
        G('Second, soldiers who are not soldiers any longer. The blight takes men and keeps them walking. Do not hesitate over a familiar face.'),
        G('Third, wraiths near the stones. They are slow to rise and quick when risen. Strike them where they gather, and light the stone as soon as the way is clear.'),
        {
          s: 'gaut',
          t: 'That is the whole of it. Will you ride with me?',
          choices: [
            { id: 'eager', t: 'I am ready. Let us make that road safe.', go: 'a2-brief-end' },
            { id: 'wary', t: 'I will come, but I want to know every danger before we meet it.', go: 'a2-brief-end' },
            { id: 'sceptical', t: 'A small column against a blight. Halvard asks a great deal.', go: 'a2-brief-end' },
          ],
        },
      ],
    },
    'a2-brief-end': {
      lines: [G('Then fetch what you need and meet me at the River Gate. The sooner we ride, the less of that road the dark will have taken.', [{ startQuest: 'm11' }])],
    },
    'a2-after': {
      lines: [
        G('Cinderford holds, for now. My men sleep in shifts and the reeve sleeps not at all. We are all very tired, {name}.'),
        G('I will hold the town while there is work for you elsewhere. Go where you are needed, and come back when you can.'),
      ],
    },
  },
});
