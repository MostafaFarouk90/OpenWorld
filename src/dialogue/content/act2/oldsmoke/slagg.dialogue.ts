import { buildTree, type Line } from '../build';
import { all, any, flagIs, not, objDone, objOpen, qActive, qDone, qIdle, step } from '../cond';

const S = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'slagg', t, fx } : { s: 'slagg', t });
const C = (t: string): Line => ({ s: 'cael', t });

const r09Avail = all(qDone('m16'), qIdle('r09'));
const r10Avail = all(qDone('m17'), qIdle('r10'));

/** Foreman Burchard Slagg: R09 and R10 at the market. M17 and D04 join with the mines. */
export const SLAGG = buildTree({
  id: 'npc-slagg',
  start: [
    // Report and choice entries first, so that no wait entry (or an extension's catch-all) hides one: a Slagg talk credits every
    // `talk slagg` objective, and the effects of R09/R10 live in these nodes. An active R09 report shows ahead of R10's waits.
    { when: all(qActive('r10'), objDone('r10', 'talks'), objOpen('r10', 'report')), seg: 'r10-report' },
    { when: step('r10', 'read', 'choice'), seg: 'r10-choice' },
    { when: all(qActive('r09'), objDone('r09', 'choice'), objOpen('r09', 'report')), seg: 'r09-report' },
    { when: step('r09', 'miners', 'choice'), seg: 'r09-choice' },
    { when: all(qActive('r10'), objDone('r10', 'choice'), objOpen('r10', 'talks')), seg: 'r10-wait-talks' },
    { when: all(qActive('r10'), objDone('r10', 'choice'), objOpen('r10', 'ruling')), seg: 'r10-wait-ruling' },
    { when: qActive('r10'), seg: 'r10-wait' },
    { when: qActive('r09'), seg: 'r09-wait' },
    { when: any(r09Avail, r10Avail), seg: 'offers' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    offers: {
      lines: [
        {
          s: 'slagg', t: '{name}. I have two jobs that need a Knight\'s name behind them, and only one pair of hands to spare. Which first?',
          choices: [
            { id: 'coin', t: 'The payroll chests.', go: 'r09-brief', when: r09Avail },
            { id: 'strike', t: 'The strike.', go: 'r10-brief', when: r10Avail },
          ],
        },
      ],
    },
    'r09-brief': {
      lines: [
        S('The night the strike was voted, the stewards took the payroll chests and put them where no hungry man could find them. The market cellars, with the locks off the stairs and the cellar door barred from outside.'),
        C('Where the crawlers nest.'),
        S('They did not nest there then. They do now. Three nests, under the market, and the chests somewhere among them. I have sent four men down and I have not lost one yet, but I have not got anyone back with a chest, either.'),
        S('The coin is the miners\' wages, four weeks owed. But it is the stewards\' ledger too, and the stewards will say it is the House\'s. There is a choice at the end of this, and it is not an easy one.'),
        C('Clear the nests first. Choose after.'),
        S('That is the way I would do it. Three nests, three chests. They have a smell. You will not mistake them.'),
        S('Take them to the paymaster\'s office. The clerk will see you. And read what the office kept: the ledger, the safe, the seal. It is good to know whose coin you are handing back.'),
        S('Come to me when the work is done and we shall settle whose it is.', [{ startQuest: 'r09' }]),
      ],
    },
    'r09-wait': { lines: [S('The nests first, the chests after, the office after that. Then the choice. In that order.')] },
    'r09-choice': {
      lines: [
        S('You have read the ledger and heard the clerk and heard my miners. Now it is yours to say.'),
        S('The stewards are owed their trust back, and a House that cannot pay its own men cannot hold a gate. The miners are owed their wages, and have been owed them for four weeks.'),
        {
          s: 'slagg', t: 'The chests are in the office. Whose are they, {name}?',
          choices: [
            { id: 'stewards', t: 'The stewards. Return the coin; the wages come from the House, as they should.', go: 'r09-choice-done', fx: [{ favour: 'grisel', delta: 5 }, { setFlag: 'story.r09.choice', value: 'stewards' }, { event: 'story.r09.chosen' }] },
            { id: 'miners', t: 'The miners. Share it out tonight.', go: 'r09-choice-done', fx: [{ favour: 'grisel', delta: -3 }, { setFlag: 'story.r09.choice', value: 'miners' }, { event: 'story.r09.chosen' }] },
          ],
        },
      ],
    },
    'r09-choice-done': { lines: [S('Then it is done. Bring it back to me when the chests are where you have said they go.')] },
    'r09-report': {
      lines: [
        S('It is done, then. The coin is where you said it should be.', undefined),
        S('If it is the stewards, I will tell my miners it was fair. They will not believe me. If it is the miners, I will tell the stewards it was lawful. They will not believe me either.'),
        S('Either way, you came back with chests, and nobody died under the market. Do not underestimate that. I have buried men for less coin.'),
        S('Here: three hundred, from the fund. It is the least I can do, and the most the fund can do.'),
        S('The stewards will remember what you did, and so will my miners. In Deepgate it is the same thing, in the end.'),
        S('Come and find me when you are ready for the next one. There is always a next one.'),
      ],
    },
    'r10-brief': {
      lines: [
        S('The miners have downed tools. The stewards will not open the paymaster\'s drawer. The market is ten days from a riot, and Lord Aldous will not come out of his hall.'),
        C('What do the miners want?'),
        S('What they are owed. A sixth of every shift, paid at the shaft head, and a widow\'s share when a man dies. Not much, as such things go.'),
        S('And the stewards want the strike broken. They say they hold the line on the Lord\'s orders, and they do. Halse, the steward-lead, is not a bad man, but he has a key ring and a conscience, and he is learning which is heavier.'),
        S('The miners\' hall, the stewards\' office, and the market stalls hold everything. Go to both halls. Read both sides. Then tell me what you would do.'),
        C('And if I take a side?'),
        S('Then you take a side, and the other half of Deepgate hates you for it. Or you find a third way. I never have.'),
        S('Speak to Oda at the miners\' hall, and to Halse. I will wait.', [{ startQuest: 'r10' }]),
      ],
    },
    'r10-wait': { lines: [S('Oda at the miners\' hall, Halse in the office, the stalls in between. I can wait; the shift cannot.')] },
    'r10-choice': {
      lines: [
        S('You have heard both halls and read the stalls. I have been a foreman for twenty years and I have never seen it all laid out like that.'),
        S('Three roads. One: the miners. We keep the strike, the stewards give way, and Grisel takes it on the chin. Two: the stewards. The strike ends, the pay comes, and the wages are what the House says.'),
        S('Three, the one I never managed: both sit at one table, and both give a little. You would have to talk each of them round. Oda, Halse, and the paymaster\'s clerk.'),
        C('What happens to the market under each?'),
        S('Miners: the miners\' watch holds the market. Stewards: the stewards hold it. Compromise: both do, and it is never easy.'),
        {
          s: 'slagg', t: 'It is yours to say, {name}. I will abide by it, whichever it is.',
          choices: [
            { id: 'miners', t: 'The miners. The strike stands, and the pay is theirs.', go: 'r10-choice-miners', fx: [{ setFlag: 'story.r10.branch', value: 'miners' }, { event: 'story.r10.chosen' }] },
            { id: 'stewards', t: 'The stewards. The strike ends and the pay comes.', go: 'r10-choice-stewards', fx: [{ setFlag: 'story.r10.branch', value: 'stewards' }, { event: 'story.r10.chosen' }] },
            { id: 'compromise', t: 'Neither alone. I will talk each of them round.', go: 'r10-choice-compromise', fx: [{ setFlag: 'story.r10.branch', value: 'compromise' }, { event: 'story.r10.chosen' }] },
          ],
        },
      ],
    },
    'r10-choice-miners': { lines: [S('Then post the ruling in the market square, and give the keys of the miners\' hall back to Oda. The strike is the miners\' to end.')] },
    'r10-choice-stewards': { lines: [S('Then post the ruling, and take the keys to the stewards\' office. I will tell my men to go down again. They will not like it, and they will go.')] },
    'r10-choice-compromise': { lines: [S('Then go to Oda, to Halse, and to the clerk. Win each of them over. If any of the three will not sit, there is no table.')] },
    'r10-wait-ruling': { lines: [S('Post the ruling in the market, then the keys. Then we are done.')] },
    'r10-wait-talks': { lines: [S('Oda, Halse and the clerk. Each of them needs a reason, not a threat. You have the evidence; use it.')] },
    'r10-report': {
      lines: [
        S('The ruling stands. The market has read it, and read it again, and the shout that followed was not a riot. That is a good day.', [
          // The choice is written on every pass; the favour is paid once (`story.r10.paid`), so an aborted or repeated report cannot pay twice.
          { if: flagIs('story.r10.branch', 'miners'), then: [{ if: not(flagIs('story.r10.paid')), then: [{ favour: 'grisel', delta: -5 }] }, { setFlag: 'story.r10.choice', value: 'miners' }] },
          { if: flagIs('story.r10.branch', 'stewards'), then: [{ if: not(flagIs('story.r10.paid')), then: [{ favour: 'grisel', delta: 5 }] }, { setFlag: 'story.r10.choice', value: 'stewards' }] },
          { if: flagIs('story.r10.branch', 'compromise'), then: [{ if: not(flagIs('story.r10.paid')), then: [{ favour: 'grisel', delta: 2 }, { favour: 'oswin', delta: 2 }] }, { setFlag: 'story.r10.choice', value: 'compromise' }] },
          { setFlag: 'story.r10.paid', value: true },
        ]),
        S('I have been a foreman twenty years and I have won three strikes and lost four. This is the first one that I do not know how to count.'),
        S('Come here, take this badge. It is tin, crossed picks. Miners will nod to whoever wears it. The stewards will look the other way.'),
        S('The union\'s oath is simple. We dig, we are paid. We are not paid, we do not dig. It is not much, but it is ours.'),
        S('Say it with me, if you like. It will not do you harm.'),
        S('Now go. Deepgate has had enough of the strike. It will want the next thing, whatever it is.'),
      ],
    },
    idle: { lines: [S('If the shaft needs you, I will say. If it does not, enjoy the quiet. It is rare.')] },
  },
});
