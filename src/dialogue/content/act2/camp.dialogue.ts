import { buildTree, type Line } from './build';
import { all, flagIs, objDone, objOpen, qActive, step } from './cond';

const L = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });

const c = L('carter-bound');
export const CARTER_BOUND = buildTree({
  id: 'npc-carter-bound',
  start: [
    { when: step('m15', 'keys', 'carter'), seg: 'm15-carter' },
    { when: flagIs('story.m15.carterFree'), seg: 'free' },
    { when: qActive('m15'), seg: 'm15-early' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm15-carter': {
      lines: [
        c('Quiet, quiet, I can talk now that the guards are on the floor. I am Wulfric, a carter out of Cinderford. I took a load of feed to the high pasture and walked into their camp.'),
        c('They did not ask my business. They bound me and said I was cheap labour for the pens. I have mucked out cages for nine days.'),
        c('They take wyrmlings, you understand. Young ones, hardly bigger than a hound, from the dens in the hills. They break them for a buyer and ship the cages south under a tarp.'),
        c('The cage is at the back of the camp, the big one with the iron straps. There is one in it now, and it has not eaten since it was caught. I hear it at night.'),
        c('I do not know who buys. The hunters say only that the coin is good and the buyer does not ask where the bruises come from.'),
        c('The keys hang at the sergeant\'s post. Get them, and the cage, and me, in that order if you can. I will wait. I am used to waiting.'),
      ],
    },
    'm15-early': { lines: [c('Not now, friend. The guards are watching, and they have long ears. Mind yourself and come back when it is quiet.')] },
    free: {
      lines: [
        c('Free air. I had forgotten how it tastes. I owe you more than a carter has to give.'),
        c('Tell the reeve I am alive, and tell my wife the feed was delivered. Thank you, {name}. I mean it.'),
      ],
    },
    idle: { lines: [c('A long road home. But a road, at least.')] },
  },
});

const w = L('corwin');
export const CORWIN = buildTree({
  id: 'npc-corwin',
  start: [
    { when: step('m15', 'carter', 'doubter'), seg: 'm15-doubter' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm15-doubter': {
      lines: [
        w('I took the coin, I will not pretend otherwise. Twelve silver for a season, and no one said the quarry was a living thing in a cage.'),
        w('I saw the cages. I saw one of them bleed through the straw, and the captain said it would mend. I stopped sleeping after that.'),
        w('I was the first to put down my spear when your people came. Not out of cowardice. Out of shame, if you want the truth.'),
        w('I will say what I saw, to the reeve or to the Council or to whoever has the patience. Let it be written. Someone should answer for those cages, and it ought not to be only the ones who did the lifting.'),
      ],
    },
    idle: { lines: [w('I have nothing to say that I have not said already. I am sorry for all of it.')] },
  },
});

const p = L('prisoner');
export const SCENE_D03_PRISONER = buildTree({
  id: 'scene-d03-prisoner',
  start: [{ when: all(), seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        p('You came. We heard the fighting through the stone and thought it was another cull. I did not think anyone would come for us.'),
        { s: 'cael', t: 'You are free now. Who held you here, and who bought the cages?' },
        p('The hunters answered to a ledger and a seal. A black anvil on red wax, always. The name on the papers was Aldous Grisel, a Council factor.'),
        p('I do not know how high it goes. But men like that do not buy cages for themselves. Thank you, {name}. Go and find the rest.'),
      ],
    },
  },
});

const r = L('redmane');
export const REDMANE = buildTree({
  id: 'npc-redmane',
  start: [
    { when: all(qActive('d03'), objDone('d03', 'prisoners'), objOpen('d03', 'testimony')), seg: 'testimony' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    testimony: {
      lines: [
        r('You let me live. I know what that costs you, and I know what it is meant to buy. Ask. I will answer without being bled for it.'),
        r('I was hired by a factor out of Valdren with a black anvil on his wax. He paid half in advance and put the rest in escrow with a lender I never met.'),
        r('The seal was always the same, red wax and a black anvil. On the orders, on the receipts, on the bill of sale for the first wyrmling.'),
        r('The name was Aldous Grisel. He never stood in the camp. He sent letters, and he sent coin, and I sent him what he asked for.'),
        r('The Council\'s hand is in it. Not every seat, but enough. I have been a hunter for twenty years, and I know the smell of a contract that has a nobleman at the other end.'),
        r('What am I owed? Nothing. I took pay for a cruel thing. If the reeve wishes to hang me, he has reason.'),
        r('But the second half of that coin was never paid. If you find the escrow, you will find the lender, and the lender keeps records.'),
        r('I surrender to Reeve Osgar. He is a plain man, and plain men are fair when they are angry. Lead me to him.'),
      ],
    },
    idle: { lines: [r('I have said what I know. The reeve will decide what I am worth.')] },
  },
});
