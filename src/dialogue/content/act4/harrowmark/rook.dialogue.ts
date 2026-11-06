import { buildTree } from '../../act2/build';
import { flagIs, qActive } from '../../act2/cond';
import { R23_CHOICE } from '../../../../quests/content/act4/harrowmark/r23.quest';
import { C, at, offer, voice, when } from './common';

const R = voice('rook');

/** Rook: R23 (brief, the choice, report) and D07 (brief, report, inside the Crucible). Extends `npc-rook`. */
export const ROOK_A4 = buildTree({
  id: 'npc-rook',
  start: [
    { when: at('r23', 'choose'), seg: 'a4-r23-choose' },
    { when: at('r23', 'report'), seg: 'a4-r23-report' },
    { when: at('d07', 'report'), seg: 'a4-d07-report' },
    { when: offer('r23'), seg: 'a4-r23-brief' },
    { when: offer('d07'), seg: 'a4-d07-brief' },
    { when: qActive('d07'), seg: 'a4-d07-wait' },
    { when: qActive('r23'), seg: 'a4-r23-wait' },
  ],
  segments: {
    'a4-r23-brief': {
      lines: [
        R('When Vey purged the watch, he did it in one night. Forty men struck from the rolls and told to go home and keep quiet.'),
        R('Most of them went home. Five did not keep quiet, or not to me. They are old, they drink, and they remember every order they were given.'),
        C('And the orders?'),
        R('Sealed, and forged. Vey\'s seal on the Regent\'s paper, but the hand is a clerk\'s. Each of the five kept one, because each of them thought he would need it one day.'),
        R('Cuthred at the Barracks, Osgood at the gatehouse, Leofwine at the stables, Wulfstan at the chapel, Aldred in the Tilted Anvil\'s yard. In that order: it is the order they were struck.'),
        {
          s: 'rook', t: 'Will you take their testimony, {name}?',
          choices: [
            { id: 'accept', t: 'All five. Then we decide what to do with it.', go: null, fx: [{ startQuest: 'r23' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a4-r23-wait': { lines: [R('Five watchmen, five orders. Someone will notice you asking. Watch your back after the third.')] },
    'a4-r23-choose': {
      lines: [
        R('Five orders in Vey\'s seal and a clerk\'s hand. That is enough to hang a Regent, if anyone is allowed to see it.'),
        R('There are two ways. Read them aloud in the watch yard, to every man who was struck off and every one who still wears the badge. Halvard will love it. Oswin will call it a mob.'),
        R('Or give them quietly to the Council clerk, Hamon Quill, and let the Houses read them before they vote. Oswin will be grateful. The watch will never know.'),
        {
          s: 'rook', t: 'Which?',
          choices: [
            { id: 'public', t: 'In the yard. Let the watch hear it.', go: 'a4-r23-public', fx: [{ setFlag: R23_CHOICE, value: 'public' }, { favour: 'halvard', delta: 5 }, { favour: 'oswin', delta: -2 }] },
            { id: 'private', t: 'To the clerk. Let the Houses read it first.', go: 'a4-r23-private', fx: [{ setFlag: R23_CHOICE, value: 'private' }, { favour: 'oswin', delta: 4 }] },
          ],
        },
      ],
    },
    'a4-r23-public': { lines: [R('Then the yard it is. I will gather them. Stand where they can see you, and read it slow.')] },
    'a4-r23-private': { lines: [R('Then Quill. He waits at the Keep court with his ink. He is honest, which in this city makes him lonely.')] },
    'a4-r23-report': {
      lines: [
        when(R('The yard shouted itself hoarse. Half the men wearing Vey\'s badge took it off before you finished reading.'), flagIs(R23_CHOICE, 'public')),
        when(R('Quill has the orders under the Council seal. Every House will read them before the vote, and no one can say they were not told.'), flagIs(R23_CHOICE, 'private')),
        C('And the forger?'),
        R('Gone to ground. He will turn up when Vey needs him again. They always do.'),
        R('This is the watch\'s old seal. Cuthred wanted you to have it. He said a knight should know what it is to be struck off.'),
      ],
    },
    'a4-d07-brief': {
      lines: [
        R('Cuthred told you about the Crucible. I have been down the old Smelter stair before, years ago, when it was only a cellar.'),
        R('There is a gate at the bottom that the city forgot. Somebody remembered it. Carts go in at night under black wax and come out empty.'),
        C('Dragon hearts. The crates from the Underways.'),
        R('Forty of them, if the stamps are true. I have the key to the gate. Smiths\' guild, older than the Regent.'),
        R('I will hold the stair foot inside. Whatever is at the bottom, it is feeding on those hearts, and it will not want to stop.'),
        {
          s: 'rook', t: 'Ready?',
          choices: [
            { id: 'accept', t: 'Open the gate.', go: null, fx: [{ startQuest: 'd07' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a4-d07-wait': { lines: [R('I have the stair. Find whoever they keep down here, take the ledgers, and stop that engine.')] },
    'a4-d07-report': {
      lines: [
        R('The furnaces have gone quiet. I felt it through the stone, like a heart stopping.'),
        C('The ledgers name the buyers. Aldous Grisel is one of them. The last entry is in the Regent\'s own hand.'),
        R('Then the Council will hear it from the ledgers, not from us. Keep them close.'),
        R('And keep this. A gear from the engine, still warm. Dunstan will know what to make of it.'),
        R('Go and sleep, {name}. Tobb has been asking where you are, and he is not a patient man when there is food on the table.'),
      ],
    },
  },
});
