import { buildTree } from '../../act2/build';
import { all, any, flagIs, qActive, qDone } from '../../act2/cond';
import { R15_HAUL_ID, R15_SLEDS } from '../../../../quests/content/act3/dragonspine/r15.quest';
import { C, at, offer, voice } from './common';

const T = voice('thorgar');

/** Thorgar's "reset haul": K7's `npc.carry.resetHaul { id }`, for whichever sled the director says is out (`story.r15.haulId`). */
const resetHaul = R15_SLEDS.map((id) => ({ if: { flag: R15_HAUL_ID, equals: id }, then: [{ event: 'npc.carry.resetHaul', payload: { id } }] }));
export const HAUL_OUT = 'story.r15.haulOut';

/**
 * Thorgar Skyhold, master of Wyrmwatch Lodge: M28 (12 + 6), R15 (8 + 6) and R18 (8 + 8). Segment sizes are the plan's node counts.
 * The idle tree is the lodge's counter: the shop, the smith and the sockets. "Reset haul" is offered whenever a sled is out.
 */
export const THORGAR = buildTree({
  id: 'npc-thorgar',
  start: [
    { when: at('m28', 'report'), seg: 'm28-report' },
    { when: at('r15', 'report'), seg: 'r15-report' },
    { when: at('r18', 'report'), seg: 'r18-report' },
    { when: offer('m28'), seg: 'm28-brief' },
    { when: qActive('m28'), seg: 'm28-wait' },
    { when: qActive('r15'), seg: 'r15-wait' },
    { when: offer('r15'), seg: 'r15-brief' },
    { when: qActive('r18'), seg: 'r18-wait' },
    { when: offer('r18'), seg: 'r18-brief' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm28-brief': {
      lines: [
        T('Welcome to Wyrmwatch, {name}. The Council wrote ahead, and I have read their letter twice. I still do not know what to make of a knight who comes to the dragon mountain to ask questions.'),
        C('I came to see what the Dragonspine is before I decide what to do about it.'),
        T('Then you will learn what we learned. It is a mountain that bites back.'),
        T('This lodge sits on the first shoulder. Above us is the Hawk Crag, above that Rime Pass, and above that the summit nobody has crossed in forty winters.'),
        C('Why the crag first?'),
        T('Because the hawks nest there, and the hawks are what keep the slope closed. Climb to the crag and you will see all of it: the lodge, the road, the peaks.'),
        T('Four of my hunters will tell you what they know of the trail. Talk to them. They will lie about the cold. It is colder.'),
        T('A scout of ours went up three days ago and has not come down. He is a good man gone wrong, or a good man gone cold. Put him down if he still stands in your way.'),
        C('And the cairns?'),
        T('Four of them along the trail, each for a climber the mountain took. Read them. They are the only guide the slope has.'),
        T('One warning, and I mean it. Beyond the lodge the beasts are hardened to the high cold. Look at the level chip on your map before you leave the road, and go back if it is red. The mountain does not soften for the unready.'),
        {
          s: 'thorgar', t: 'Will you climb, {name}?',
          choices: [
            { id: 'accept', t: 'I will climb it.', go: null, fx: [{ startQuest: 'm28' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'm28-wait': { lines: [T('Four hunters to talk to, the scout on the trail, the cairns, the two ledges and the crag. Then come back and tell me what the summit looked like.')] },
    'm28-report': {
      lines: [
        T('You came down. I had a bet with myself on it, and I am glad to lose it.'),
        C('The crag is cleared. And I saw the summit. It glows.'),
        T('It does. It has glowed since my father\'s time. We call it the hearth. No one has been near it and lived to describe it.'),
        T('You have shown the mountain you are not afraid of it, and it has shown you it is not afraid of you. That is a fair beginning.'),
        T('Take this cloak. It is rime-wool, spun for the pass. It will keep you warm longer than your armour will.'),
        T('The lodge has work for you when you are rested. Supplies for the heights, and the hawks that have turned on us. Ask.'),
      ],
    },
    'r15-brief': {
      lines: [
        T('The hunters on the heights are short of everything. Rope, lamp oil, salt, hard bread. They will not come down for it and I will not leave them without.'),
        C('How do I get it to them?'),
        T('On the sleds. Three in the shed behind the bunkhouse, each loaded for the climb. You drag them by the traces, slow, no sprinting and no sword while you pull.'),
        T('The road runs north to the hawk-line cache. Eight hundred paces, nothing steep, all of it in the hawks\' sight.'),
        C('The hawks stoop.'),
        T('At anyone who hauls. Dodge, and set the sled down before you fight. A hit drops it where it stands. It will keep.'),
        T('If a sled goes wrong, off the road or into the river or down a drop, come and tell me. I will have it brought back to the last bend it passed. Ask me for a reset of your haul.'),
        T('Talk to my sled-hands first. They know the traces.', [{ startQuest: 'r15' }]),
      ],
    },
    'r15-wait': {
      lines: [
        T('Three sleds, one at a time, to the cache on the north road. Mind the hawks.'),
        {
          s: 'thorgar', t: 'Has a sled gone wrong? I can send it back to the last bend it passed.', when: any(flagIs(HAUL_OUT), offer('r18')),
          choices: [
            { id: 'reset', t: 'Reset my haul.', go: null, fx: resetHaul, when: flagIs(HAUL_OUT) },
            { id: 'eggs', t: 'Is there other work?', go: 'r18-brief', when: offer('r18') },
            { id: 'fine', t: 'It is fine.', go: null },
          ],
        },
      ],
    },
    'r15-report': {
      lines: [
        T('The cache is full and the hawks are fewer. Good work.'),
        C('Where the surplus goes was settled with the sled-hands at the cache.'),
        T('So they said. I will not argue it. A lodge that does not eat is no lodge, and a hut that does not warm is no hut.'),
        T('Either way the heights are fed. That is the work.'),
        T('Take the saddlebags. They are cut for the Ashmare, hide-lined, and the strap does not fray. A horse that carries more goes farther.'),
        T('Come back if you want to trade. The lodge sells to anyone who has hauled.'),
      ],
    },
    'r18-brief': {
      lines: [
        T('Someone has been stealing rime hawk eggs from the Hawk Cliffs, and the parents have gone off their heads. They stoop at my hunters on the road, and at the sleds.'),
        C('Who is taking them?'),
        T('A man with a camp at the cliff foot. I will not say he is a bad one. I have not asked.'),
        T('Go and ask him. Then put the eggs back in the nest where they came from, every one. The parents will let you, if you are not seen.'),
        C('And if I am seen?'),
        T('Then they defend the nest, and anything that kills a parent turns the rest of the cliff against us. Do not harm them, {name}. The hawks keep this mountain closed to the Council\'s hunters.'),
        C('Then I will go quietly.'),
        T('Your companions will have to wait at the cliff foot. Three people on a nest is a war party.', [{ startQuest: 'r18' }]),
      ],
    },
    'r18-wait': { lines: [T('The thief first, his camp, then the eggs, one at a time, up the cliff. Quietly.')] },
    'r18-report': {
      lines: [
        T('The parents are back on the nest, and my hunters tell me they have stopped stooping at the road. You did it.'),
        C('It took three trips. The last was the quietest.'),
        T('It always is. The first is brave, the second is careful, the third knows how.'),
        T('Would you have killed them, if it came to it?'),
        C('I would have tried not to.'),
        T('That is the right answer. The mountain is not ours to clear. The Council believes it is.'),
        T('Take this feather, bound in a hunter\'s cord. It is a keepsake and a thank you.'),
        T('Come to the lodge whenever you like. There is a door here for you.'),
      ],
    },
    idle: {
      lines: [
        {
          s: 'thorgar', t: 'The lodge is open to you, {name}. What do you need?',
          choices: [
            { id: 'trade', t: 'Show me your stock.', go: null, fx: [{ event: 'npc.vendor.open', payload: { vendorId: 'thorgar' } }] },
            { id: 'smith', t: 'I need the forge.', go: null, fx: [{ event: 'npc.smith.open' }], when: qDone('m28') },
            { id: 'sockets', t: 'I have gems to set.', go: null, fx: [{ event: 'npc.sockets.open' }], when: qDone('m28') },
            { id: 'bye', t: 'Nothing, thank you.', go: null },
          ],
        },
      ],
    },
  },
});
