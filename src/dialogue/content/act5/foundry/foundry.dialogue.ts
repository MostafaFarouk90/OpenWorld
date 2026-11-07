// The Foundry quests' own cast (N11): Dagna the tunnel captain (R27's line and choice), the four mourners at the pyres (R28),
// Vey under the truce cloth (M53's argument), Alric at the Foundry door and at its foot (D09), Old Tam the captive stoker, and
// Wenna in the vat gallery (F1 Spy). Prose is invented (Q6). Choices pick words, never outcomes (Q5).
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import type { Condition, DialogueDef } from '../../../../quests/types';
import { D09_OUTCOME_SEEN, D09_STOKER } from '../../../../quests/content/act5/foundry/d09.quest';
import {
  D09_TURNED, D09_WENNA_MET, M53_SCAR_BAND, M53_TRUCE_SEEN, R27_CHOICE, R27_FAR_OPEN, VEY_OUTCOME,
} from '../../../../quests/content/act5/foundry/flags';
import { M53_VEY } from '../../../../quests/content/act5/foundry/m53.quest';
import { R28_MOURNER, R28_PYRE_NS } from '../../../../quests/content/act5/foundry/r28.quest';
import { R27_CAPTAIN, R27_CHOSEN_EVENT } from '../../../../quests/content/act5/foundry/r27.quest';
import { C, all, any, at, flagIs, not, offer, open, qActive, voice } from './common';
import { ALRIC_DESCENT_RULES, ALRIC_DESCENT_SEGMENTS } from './descent.dialogue';

const CA = voice(R27_CAPTAIN);
const VE = voice(M53_VEY);
const AL = voice('alric');
const TA = voice(D09_STOKER);
const WE = voice('wenna');
const r10 = (v: string): Condition => flagIs('story.r10.choice', v);
const leaders = flagIs('story.r21.choice', 'leaders');

// ---- Dagna Coalbrow: R27 ----------------------------------------------------------------------------------------------------
export const CAPTAIN_TREE: BuiltTree = buildTree({
  id: `npc-${R27_CAPTAIN}`,
  start: [
    { when: at('r27', 'captain'), seg: 'r27-captain' },
    { when: at('r27', 'ready'), seg: 'r27-ready' },
    { when: at('r27', 'choose'), seg: 'r27-choose' },
    { when: qActive('r27'), seg: 'r27-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r27-captain': {
      lines: [
        CA('You are the knight. Good. Dagna Coalbrow, captain of this hole for as long as it stays a hole.'),
        { s: R27_CAPTAIN, t: 'The keep sent me miners: real ones, with picks and sense. We will hold the near posts.', when: r10('miners') },
        { s: R27_CAPTAIN, t: 'The keep sent me stewards. Good with ledgers, bad with rock. They will hold the posts if someone shows them which end of a spear is which.', when: r10('stewards') },
        { s: R27_CAPTAIN, t: 'The keep sent me half miners and half stewards. They argue. That is fine; it keeps them awake.', when: r10('compromise') },
        { s: R27_CAPTAIN, t: 'The keep sent me nobody. Wenna\'s diggers and me. We will make do; we always have.', when: not(any(r10('miners'), r10('stewards'), r10('compromise'))) },
        CA('Vey\'s people dug through from the Waste side. We heard them stop an hour ago. That is not a good sound.'),
        C('How long have we got?'),
        CA('Three props on the old shoring, four lamps along the gallery, three charges on the near seal. Do them in any order. Do them fast.'),
        { s: R27_CAPTAIN, t: 'And the far door is open. Some fool in the keep sent only the leaders up the stairs, so nobody sealed the far end. They will come from both sides.', when: leaders },
        CA('When it is ready, stand at the line by the second post and we will see who is louder, them or us.'),
      ],
    },
    'r27-ready': {
      lines: [
        CA('Props in, lamps lit, charges set. I checked them twice; you did them right. That is rarer than you would think.'),
        CA('Wenna\'s people on the left posts, mine on the right. You in the middle, because you are the one with the shard.'),
        C('And if the line breaks?'),
        CA('Then we fall back past the lamps and do it again. Nobody dies in my tunnel today. That is an order, and I outrank the rock.'),
      ],
    },
    'r27-choose': {
      lines: [
        CA('That is the last of them. Listen to it. The rock is ringing like a bell.'),
        CA('The charges are set on the far shoring. One word and the tunnel is gone for good. Or we leave it, and it is ours.'),
        C('Ours, or Vey\'s again, if we lose the camp.'),
        {
          s: R27_CAPTAIN, t: 'Your call, knight. Wenna said so, and I do not argue with Grisels any more.',
          choices: [
            { id: 'collapse', t: 'Bring it down.', go: 'r27-collapsed', fx: [{ setFlag: R27_CHOICE, value: 'collapse' }, { setFlag: R27_FAR_OPEN, value: false }, { event: R27_CHOSEN_EVENT, payload: { choice: 'collapse' } }] },
            { id: 'keep', t: 'Keep it. It is our door now.', go: 'r27-kept', fx: [{ setFlag: R27_CHOICE, value: 'keep' }, { setFlag: R27_FAR_OPEN, value: true }, { event: R27_CHOSEN_EVENT, payload: { choice: 'keep' } }] },
          ],
        },
      ],
    },
    'r27-collapsed': { lines: [CA('Back, everyone! Back past the third post! Cover your ears and pray to whoever digs.')] },
    'r27-kept': { lines: [CA('Then we keep it. I will put my best two on the far door, and a bell on a string.')] },
    'r27-wait': { lines: [CA('Props, lamps, charges. Then the line. Do not stand in the middle of the gallery admiring the rock.')] },
    idle: { lines: [CA('Wenna has gone up. Tell her the rock is quiet. She will not believe you either.')] },
  },
});

// ---- the mourners: R28 ------------------------------------------------------------------------------------------------------
const MOURNER: Record<number, { dead: string; lines: readonly [string, string, string]; answer: string; last: string }> = {
  1: {
    dead: 'Ceolwin',
    lines: ['That is Ceolwin under the cloak. We drew bows together on the first stair. She would not fall back when the horn went.', 'Her name is inside her shield, where only she would see it. She painted it the night before the gate.', 'Take her bowstring to the pyre. She said a string should burn with the archer, or it pulls crooked for the next one.'],
    answer: 'I will see her off with it.',
    last: 'Thank you. She hated being late for anything.',
  },
  2: {
    dead: 'Osric',
    lines: ['Osric drove my carts up the rim stairs. Forty crates. He would have made it forty-one if they had let him.', 'His tally-stick will have his name on it. He cut it deep on the last notch, like he knew.', 'His driving gloves. Put them on the wood, knight. And careful: he twitched when they carried him. The heat is in him.'],
    answer: 'If he rises, I will lay him down gently.',
    last: 'He would have counted the steps up to the wood. Forty-one, I expect.',
  },
  3: {
    dead: 'Edda',
    lines: ['Edda Tallowhand. She dug Deepdelve before any of us were born, and she dug the Rim when Wenna asked.', 'Look on her pick handle for the name. Miners burn them there so the rock knows who to thank.', 'And this: her tallow lamp. It never once stayed lit in a draught. She will want it anyway.'],
    answer: 'The rock will know who to thank.',
    last: 'Go on, then. Before I start laughing at her myself.',
  },
  4: {
    dead: 'Hrefna',
    lines: ['Hrefna walked with us from the Waste. She carried water for the lowlanders on the stairs, under the arrows.', 'Her name is in the knot-cord on her spear. Four turns, a loop, three. Wulfhild taught you the count?', 'Lay her water-skin on the pyre. And be ready. She did not want to die. I think she still does not.'],
    answer: 'I will be ready.',
    last: 'Walk soft by her pyre. The ash listens.',
  },
};
export const MOURNER_TREES: readonly BuiltTree[] = R28_PYRE_NS.map((n) => {
  const m = MOURNER[n]!;
  const MO = voice(R28_MOURNER(n));
  return buildTree({
    id: `npc-${R28_MOURNER(n)}`,
    start: [{ when: open('r28', `mourner${n}`), seg: 'r28-mourner' }, { when: all(), seg: 'idle' }],
    segments: {
      'r28-mourner': { lines: [MO(m.lines[0]), MO(m.lines[1]), MO(m.lines[2]), C(m.answer), MO(m.last)] },
      idle: { lines: [MO(`${m.dead} would have liked the fire. Thank you.`)] },
    },
  });
});

// ---- Vey under the truce cloth: M53 -----------------------------------------------------------------------------------------
const band = (t: 'ashwalkers' | 'dragons', b: 'cold' | 'warm'): Condition =>
  b === 'cold' ? { favour: t, band: 'cold' } : { favour: t, band: ['banked', 'stoked', 'hearthbound'] };
const ledgers = flagIs('story.d07.ledgers');
const released = flagIs('boss.eormen.outcome', 'released');
const scars = (b: 'light' | 'heavy' | 'grave'): Condition => flagIs(M53_SCAR_BAND, b);

const VEY_TRUCE_BUILT: BuiltTree = buildTree({
  id: `npc-${M53_VEY}`,
  start: [{ when: at('m53', 'truce'), seg: 'm53-truce' }, { when: all(), seg: 'idle' }],
  segments: {
    'm53-truce': {
      lines: [
        VE('You came. Edric said you would; he always thought better of people than I taught him to.'),
        VE('Sit, if you like. No? You stand like your old captain did. He also never sat with me.'),
        C('Say what you came to say.'),
        VE('Hear me first. The Forge under this mountain is dying. Not sleeping: dying. Its fire goes out a little more every year, and the blight comes in where the warmth was.'),
        {
          s: M53_VEY, t: 'It cannot be mended. Everything that is broken, stays broken. I have read every page there is.',
          choices: [
            { id: 'walkers', t: 'The Walkers mended a tribe out of ash. I watched them do it.', go: 'm53-part2', when: band('ashwalkers', 'warm') },
            { id: 'quiet', t: 'Pages are not people.', go: 'm53-part2', when: band('ashwalkers', 'cold') },
            { id: 'hear', t: 'Then say what you would do instead.', go: 'm53-part2' },
          ],
        },
      ],
    },
    'm53-part2': {
      lines: [
        VE('So be it. You hold to hope. I held to it for thirty years, and I watched it cost us a village a winter.'),
        VE('Then it must be made into something else. A weapon. Dragon hearts in the Foundry\'s crucibles, and the fire turned outward to burn the blight to the root.'),
        {
          s: M53_VEY, t: 'Three hearts would do it. Perhaps four. What are four dragons against a kingdom?',
          choices: [
            { id: 'ledgers', t: 'I read your heart ledgers in the Crucible. I know how many you have already used.', go: 'm53-part3', when: ledgers },
            { id: 'keepers', t: 'The keepers came to the gate for us. They are not fuel.', go: 'm53-part3', when: band('dragons', 'warm') },
            { id: 'ask', t: 'Did you ask the dragons what they think?', go: 'm53-part3', when: not(ledgers) },
            { id: 'no', t: 'No.', go: 'm53-part3', when: band('dragons', 'cold') },
          ],
        },
      ],
    },
    'm53-part3': {
      lines: [
        VE('You think me a monster. Perhaps. Monsters keep the lamps lit while good men argue about the price of oil.'),
        C('You keep hearts in jars, Vey.'),
        VE('And then there is you. You carry the Heartshard. It is a piece of the Forge\'s own fire, and it is the only key the Foundry\'s last door will take.'),
        ...([
          ['light', 'It is not yours. It never was.', not(any(scars('heavy'), scars('grave')))],
          ['heavy', 'It has cost me enough already. You will not have the rest.', scars('heavy')],
          ['grave', 'Look at my hands, Vey. There is not much of me left to give. None of it is for you.', scars('grave')],
        ] as const).map(([id, t, when]): Line => ({
          s: M53_VEY, t: 'You carry what I need, knight. Give it to me, and walk home.', when,
          choices: [
            { id: 'eormen', t: 'I released Eormen from a forge like yours. I will not build him another.', go: 'm53-end', when: released },
            { id: 'refuse', t: 'No. Not to you, not to anyone who keeps hearts in jars.', go: 'm53-end', when: not(released) },
            { id, t, go: 'm53-end' },
          ],
        })),
      ],
    },
    'm53-end': {
      lines: [
        VE('So. I expected nothing else. I had to ask; a regent always has to ask.'),
        VE('Tell Edric I kept his mother\'s letters. They are in the Foundry, with the rest of what I could not throw away.'),
        C('Tell him yourself.'),
        VE('The truce holds until I am through the Foundry door. After that, come down if you must. I will be waiting where the iron is hottest.', [{ setFlag: M53_TRUCE_SEEN, value: true }]),
      ],
    },
    idle: { lines: [VE('Go and see your king, knight. He will want to know what I said. He always did.')] },
  },
});
/**
 * Vey's third question has one node per Scar band, each with its `when`: a choice node normally ends a chain, so each band's
 * node also carries `next` to the following band's, and the runner skips a node whose `when` fails along that `next`.
 */
export const VEY_TRUCE_TREE: BuiltTree = {
  ...VEY_TRUCE_BUILT,
  def: {
    ...VEY_TRUCE_BUILT.def,
    nodes: (() => {
      const nodes = VEY_TRUCE_BUILT.def.nodes;
      const bands = nodes.filter((n) => n.choices?.some((c) => c.id === 'eormen')).map((n) => n.id);
      return nodes.map((n) => { const i = bands.indexOf(n.id); return i >= 0 && i + 1 < bands.length ? { ...n, next: bands[i + 1]! } : n; });
    })(),
  },
};

// ---- Alric: D09 (at the Foundry door, and at its foot after Vey) ------------------------------------------------------------
const spared = flagIs(VEY_OUTCOME, 'spared');
export const ALRIC_A5F: BuiltTree = buildTree({
  id: 'npc-alric',
  start: [
    { when: offer('d09'), seg: 'a5f-d09-brief' },
    { when: at('d09', 'after'), seg: 'a5f-d09-after' },
    { when: all(qActive('d09'), at('d09', 'enter')), seg: 'a5f-d09-wait' },
    ...ALRIC_DESCENT_RULES,
  ],
  segments: {
    ...ALRIC_DESCENT_SEGMENTS,
    'a5f-d09-brief': {
      lines: [
        AL('The Foundry. I worked here once, before Vey, when the vats only held iron.'),
        AL('Three floors. The furnace floor is ruled by slag: if it is not routed, the lift will not cool and you will not go down.'),
        AL('Below it, the vat gallery, where he kept the hearts. Grisel guards. Paid men. Some of them still have families on the rim.'),
        C('And Vey?'),
        AL('At the bottom, at the great crucible. He will have his household with him, and the people he made watch.'),
        C('You know the way well.'),
        AL('I carried coal down it for eleven years. I could walk it blind. Some nights I still do, in my sleep.'),
        AL('I will not go in with you. My hands shake near those vats now. But I will be at the foot of the stair when it is done, one way or the other.'),
        AL('The door shuts behind whoever enters. Take what you need from the camp first.'),
        {
          s: 'alric', t: 'Are you ready to go down?',
          choices: [
            { id: 'accept', t: 'Open it.', go: null, fx: [{ startQuest: 'd09' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a5f-d09-wait': { lines: [AL('The door is open for you. It will not stay that way once you are through.')] },
    'a5f-d09-after': {
      lines: [
        AL('It is over, then. The crucible is cooling. I can hear it ticking.'),
        { s: 'alric', t: 'You let him live. He sat down on the steps like an old man and gave me his seal without a word.', when: spared },
        { s: 'alric', t: 'He is dead. He fought to the last, and the iron took him. I find I cannot hate him now. I tried.', when: not(spared) },
        C('There is a door past the crucible. Older than all of this.'),
        AL('The Hammer Hall. The first king\'s forge. Something is awake down there, and it has been listening to us.'),
        C('You knew.'),
        AL('I suspected. When I was a boy the stokers left bread at that door. Nobody said why. You do not ask why in a foundry.'),
        AL('The hum in the walls. You have heard it too, since the Waste. It is louder here.'),
        C('It sounds like a song.'),
        AL('It sounds like a music box. My mother had one. That is the part I do not like.'),
        { s: 'alric', t: 'Halvard will want the Regent alive for the courts. Oswin will want him hanged. Neither will thank you.', when: spared },
        { s: 'alric', t: 'Halvard will call it justice. Oswin will call it a waste of a good trial. Both will remember it.', when: not(spared) },
        AL('Rest first. When you are ready, I will show you the way down.', [{ setFlag: D09_OUTCOME_SEEN, value: true }]),
      ],
    },
  },
});
/** Alric's own tree belongs to the Rim block (N10); this one stands in for it until then. */
const ALRIC_BASE: DialogueDef = {
  id: 'npc-alric',
  start: [{ when: { all: [] }, node: 'idle' }],
  nodes: [{ id: 'idle', speaker: 'alric', textKey: 'dialogue.npc-alric.idle', next: null }],
};
export const ALRIC_BASE_STRINGS: Record<string, string> = { 'dialogue.npc-alric.idle': 'The fire is lower than it was. I can hear it from here.' };
export { ALRIC_BASE };

// ---- Old Tam: D09 -----------------------------------------------------------------------------------------------------------
export const STOKER_TREE: BuiltTree = buildTree({
  id: `npc-${D09_STOKER}`,
  start: [{ when: at('d09', 'stoker'), seg: 'd09-stoker' }, { when: all(), seg: 'idle' }],
  segments: {
    'd09-stoker': {
      lines: [
        TA('Do not cut the chain yet. Listen first. Forty years I have routed slag on this floor, and his men still could not do it without me.'),
        TA('Three sluices. The slag has to go down the runnels in the right order, or it backs up and floods the floor.'),
        TA('The order is on the plate by the basin. I scratched it there myself, so the next fool would not drown.'),
        C('And the wrong order?'),
        TA('Then the runnel fills and throws you off it like a cat off a stove. You will live. You will not enjoy it.'),
        C('Why did they chain you here?'),
        TA('Because I would not feed the vats. Hearts burn hot, they said. Forty years of iron and I never once put a living thing in a crucible.'),
        TA('The Regent came down himself to ask me. Polite as a priest. I told him where to put his hearts.'),
        TA('He laughed. He said I was the only honest man in the Foundry. Then he had them bring the chain.'),
        C('There is a shift board by the lift. Is your name on it?'),
        TA('Right. Now cut the chain. I am going up, and I am never coming down again.'),
      ],
    },
    idle: { lines: [TA('Still here? Mind the runnels.')] },
  },
});

// ---- Wenna in the vat gallery: D09 (F1 Spy) ---------------------------------------------------------------------------------
export const WENNA_D09_SEGMENT: Record<string, { lines: Line[] }> = {
  'a5f-d09-wenna': {
    lines: [
      WE('Down here. Quietly. Those are my family\'s guards at the vats, and I have been talking to them for an hour.'),
      { s: 'wenna', t: 'All four will stand down. They knew my mother. They are tired of guarding hearts.', when: flagIs(D09_TURNED, 4) },
      { s: 'wenna', t: 'Two of them will stand down. The other two have Vey\'s gold in their teeth. I could not reach them.', when: not(flagIs(D09_TURNED, 4)) },
      C('And you? Vey\'s household is below.'),
      WE('I am a Grisel. We are very good at not being where the fighting is. My mother taught me that, and you taught me when to stop.'),
      WE('Go on. I will take the ones who listened up the stair.', [{ setFlag: D09_WENNA_MET, value: true }]),
    ],
  },
};
export const WENNA_D09_RULE = { when: all(at('d09', 'guards'), not(flagIs('story.m21.choice', 'confront')), not(flagIs(D09_WENNA_MET))), seg: 'a5f-d09-wenna' };
