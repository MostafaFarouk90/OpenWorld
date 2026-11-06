import { buildTree } from '../../act2/build';
import { flagIs, qActive } from '../../act2/cond';
import { R19_CHOICE } from '../../../../quests/content/act4/harrowmark/r19.quest';
import { C, at, offer, voice, when } from './common';

const W = voice('wystan');

/** Wystan in the occupied city: M35 (brief and report) and R19 (brief and report). Extends `npc-wystan`. */
export const WYSTAN_A4 = buildTree({
  id: 'npc-wystan',
  start: [
    { when: at('m35', 'report'), seg: 'a4-m35-report' },
    { when: at('r19', 'report'), seg: 'a4-r19-report' },
    { when: offer('m35'), seg: 'a4-m35-brief' },
    { when: qActive('m35'), seg: 'a4-m35-wait' },
    { when: offer('r19'), seg: 'a4-r19-brief' },
    { when: qActive('r19'), seg: 'a4-r19-wait' },
  ],
  segments: {
    'a4-m35-brief': {
      lines: [
        W('{name}. Good. Edric has called the Council of Ash, all three Houses under one roof, and Vey has a guard on every gate in the city.'),
        W('The Regent calls it keeping order. I call it a net. Every delegate who comes to the Keep has to walk through it.'),
        C('Then they walk through it with me beside them.'),
        W('That is the job. The Oswin delegation waits at the Counting-House with Merrin, the Halvard men at the Bastion with Ser Aldric, and the Grisel party is coming in by the river road.'),
        W('Each of them must pass one of Vey\'s checkpoints. Show the guard the Council writ. He cannot refuse it without refusing the King, and he knows it.'),
        W('Orrin, the Grisel steward, has the worst of it. The River Gate lane is narrow and dark, and I do not trust it.'),
        {
          s: 'wystan', t: 'Will you bring them in?',
          choices: [
            { id: 'accept', t: 'All three. Oswin first.', go: null, fx: [{ startQuest: 'm35' }] },
            { id: 'later', t: 'Give me a moment.', go: null },
          ],
        },
      ],
    },
    'a4-m35-wait': { lines: [W('Oswin at the Counting-House, Halvard at the Bastion, Grisel at the River Gate. Walk each of them to the Keep court, and do not let the checkpoints keep them.')] },
    'a4-m35-report': {
      lines: [
        W('All three delegations are inside the Keep. I counted the heads twice.'),
        C('Masked men tried for the Grisel party in the River Gate lane. They carried the Regent\'s mark.'),
        W('Then Vey has stopped pretending. Good. A man who pretends is harder to fight than one who strikes.'),
        W('The Council sits when the Houses have made up their minds, and not before. Some of them have not.'),
        W('Merrin will tell you who. And come and find me at the Bastion. The banners need a knight who can choose.'),
        W('Take this. The Council\'s seal, so the next guard who reads your writ knows whose it is.'),
      ],
    },
    'a4-r19-brief': {
      lines: [
        W('Four Halvard captains, four companies, and every one of them wants to march when the Council sits.'),
        W('If they all march, the walls are empty and Vey takes the city behind us. If none march, the Council sits under the Regent\'s spears.'),
        C('So two march and two hold.'),
        W('Two march and two hold. I cannot choose. They are my friends, all four, and they would hear favour in whatever I said.'),
        W('Hesketh keeps the archers on the wall walk, Morwen the pikes in the Bastion yard, Bran the horse at the stables, Tolly the engineers by the chapel.'),
        W('A third of every company has gone over to the Regent\'s pay. Read the muster roll first, so you know what you are asking of them.'),
        {
          s: 'wystan', t: 'Will you choose for me?',
          choices: [
            { id: 'accept', t: 'I will choose, and answer for it.', go: null, fx: [{ startQuest: 'r19' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a4-r19-wait': { lines: [W('Speak to all four captains, then raise two banners in the yard and sound the horn. The yard will know what it means.')] },
    'a4-r19-report': {
      lines: [
        W('Two banners in the yard and the horn still ringing off the walls. I heard it from the Keep.'),
        when(W('Archers and pikes in the field. A wall of points and a hail of shafts. Vey will see that coming a mile off, and still not like it.'), flagIs(R19_CHOICE, 'archers-pikes')),
        when(W('The horse and the engineers. Speed and ropes. You mean to go where Vey does not expect us.'), flagIs(R19_CHOICE, 'engineers-horse')),
        when(W('Archers and engineers. Shafts from the walls and the means to bring the walls down. A siege, then, if it comes to one.'), flagIs(R19_CHOICE, 'archers-engineers')),
        when(W('Archers and horse. Bran\'s riders to run them in, Hesketh\'s bows to finish it. Quick work, if it works.'), flagIs(R19_CHOICE, 'archers-horse')),
        when(W('Engineers and pikes. Ropes, rams and a line that will not break behind them. Slow, and very hard to stop.'), flagIs(R19_CHOICE, 'engineers-pikes')),
        when(W('Horse and pikes. Morwen holds them and Bran hits them from the side. The old way, and it still works.'), flagIs(R19_CHOICE, 'horse-pikes')),
        C('The other two hold the city. They did not like it.'),
        W('No. But they will do it, because you asked them to their faces. That is more than the Regent ever did.'),
        W('Take the standard. When the Council sits, it should be in the hall.'),
      ],
    },
  },
});
