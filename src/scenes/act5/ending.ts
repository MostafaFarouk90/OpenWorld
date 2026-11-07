// Act 5 N11 PR 2 (plans/act5-N11.md section 5, plan 2.8): the ending's data. N12's ending director plays it: the two ending
// cutscenes (scene ids; my director registers the defs and starts the theme), the title card, the epilogue spoken by the
// highest favour track at the M56 snapshot (Tobb sings it on a tie), and the credits with Tobb's ballad and the five DLC
// cards. Every reader takes `flags: (k) => unknown`, and every slide has an `otherwise`, so a missing flag still resolves.
// Prose is invented (Q6) and logged under "Act 5 N11" in design/changes-applied.md.
import type { SceneDef } from '../types';
import type { SlideDef } from '../../hud/act5/slides';
import type { CreditBlock, CreditsDef } from '../../hud/act5/credits';
import { ACT5_CREDITS_STRINGS_EN } from '../../hud/act5/strings.en';
import { bandAt, highestTrack, type FavourBand, type FavourTrack } from '../../state/favour';
import {
  bannersHeld, eormenReleased, f2, f4, f5, f6, f8, pyresLit, r11Spared, r16Given, r27Choice, r30Verse, veyOutcome, type FlagReader,
} from '../../quests/content/act5/foundry/readers';
import { scarBand } from '../../quests/content/act5/foundry/scars';
import { M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG, M56_SCARS_FLAG } from '../../quests/content/act5/foundry/flags';

export type Flags = (k: string) => unknown;
export type EndingChoice = 'rekindle' | 'let-it-die';
const reader = (flags: Flags): FlagReader => ({ getFlag: flags });
const choiceOf = (flags: Flags): EndingChoice => (flags(M56_CHOICE_FLAG) === 'let-it-die' ? 'let-it-die' : 'rekindle');
const scarsOf = (flags: Flags): number => {
  const v = flags(M56_SCARS_FLAG);
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};
const SNAP = 'm56';

// ---- the cutscenes (design 11.3 rows 27 and 28): sequencer data; the look is N13's (worldTint), the theme N8's ------------
export const ENDING_CUTSCENES: Readonly<Record<EndingChoice, string>> = { rekindle: 'scene-ending-rekindle', 'let-it-die': 'scene-ending-let-it-die' };
/** Seconds each runs (12 and 14, the design's). */
export const ENDING_SECONDS: Readonly<Record<EndingChoice, number>> = { rekindle: 12, 'let-it-die': 14 };

export const ENDING_SCENE_DEFS: readonly SceneDef[] = [
  {
    id: ENDING_CUTSCENES.rekindle,
    steps: [
      { line: { speakerId: 'cael', textKey: 'scene.ending.rekindle.1', seconds: 4 } },
      { line: { speakerId: 'cael', textKey: 'scene.ending.rekindle.2', seconds: 4 } },
      { line: { speakerId: 'cael', textKey: 'scene.ending.rekindle.3', seconds: 4 } },
    ],
  },
  {
    id: ENDING_CUTSCENES['let-it-die'],
    steps: [
      { line: { speakerId: 'cael', textKey: 'scene.ending.let-it-die.1', seconds: 5 } },
      { line: { speakerId: 'cael', textKey: 'scene.ending.let-it-die.2', seconds: 5 } },
      { line: { speakerId: 'cael', textKey: 'scene.ending.let-it-die.3', seconds: 4 } },
    ],
  },
];

/**
 * The cutscene's effects on a timeline (seconds from the start), quality-tiered: Low drops the bloom pulse. N13's look and
 * N12's director read it; nothing here touches the renderer.
 */
export type EndingFx = 'fresnel-wave' | 'bloom-pulse' | 'embers-rise' | 'tint-warm' | 'anvil-dim' | 'wyrm-lights' | 'ash-settle' | 'sfx.anvil';
export function endingFxFor(choice: EndingChoice, quality: 'low' | 'medium' | 'high'): readonly { at: number; fx: EndingFx }[] {
  const all: { at: number; fx: EndingFx; notLow?: boolean }[] = choice === 'rekindle'
    ? [{ at: 0, fx: 'sfx.anvil' }, { at: 1, fx: 'fresnel-wave' }, { at: 3, fx: 'bloom-pulse', notLow: true }, { at: 4, fx: 'embers-rise' }, { at: 7, fx: 'tint-warm' }]
    : [{ at: 0, fx: 'sfx.anvil' }, { at: 1, fx: 'anvil-dim' }, { at: 5, fx: 'wyrm-lights' }, { at: 9, fx: 'ash-settle' }];
  return all.filter((e) => quality !== 'low' || !e.notLow).map(({ at, fx }) => ({ at, fx }));
}

// ---- the title card ---------------------------------------------------------------------------------------------------------
export const TITLE_CARDS = {
  rekindleLives: { titleKey: 'scene.ending.title.lastEmber' },
  rekindleDies: { titleKey: 'scene.ending.title.lastEmber', lineKey: 'scene.ending.title.lastBearer' },
  letItDie: { titleKey: 'scene.ending.title.longDawn' },
} as const;
export function titleCardFor(flags: Flags): { titleKey: string; lineKey?: string } {
  if (choiceOf(flags) === 'let-it-die') return TITLE_CARDS.letItDie;
  return flags(M56_CAEL_LIVES_FLAG) === false ? TITLE_CARDS.rekindleDies : TITLE_CARDS.rekindleLives;
}

// ---- the epilogue -------------------------------------------------------------------------------------------------------------
export type Speaker = FavourTrack | 'tie';
export const EPILOGUE_SPEAKERS: Readonly<Record<Speaker, string>> = {
  halvard: 'Lord Wystan Halvard', oswin: 'Lady Merrin Oswin', grisel: 'Lady Wenna Grisel', dragons: 'Ysmeryth', ashwalkers: 'Wulfhild', tie: 'Tobb Fenwick',
};
/** Each speaker's opening and closing line, in their voice. On a tie Tobb sings, so his frame is verse. */
export const SPEAKER_FRAMES: Readonly<Record<Speaker, { open: string; close: string }>> = {
  halvard: { open: 'I was asked to set down what came after. I am a soldier; I will be brief, and I will be honest.', close: 'That is the account. I have signed it. Let the next man who reads it do better than we did.' },
  oswin: { open: 'My clerks wanted to write this. I would not let them. Some ledgers a lady keeps herself.', close: 'The books balance, more or less. They never do entirely. That is how you know they are honest.' },
  grisel: { open: 'My father would have told this story with himself in the middle of it. I will try not to.', close: 'That is all of it. House Grisel was wrong for a long time. We are trying to be less wrong now.' },
  dragons: { open: 'Little ones. You asked a keeper to tell it. Then listen, and do not hurry me.', close: 'That is the keeping. We will remember it longer than you will. That is what we are for.' },
  ashwalkers: { open: 'We walk with the dead, so we are asked to speak for them. Here is what they would want said.', close: 'Light a lamp for them tonight. Then go to bed. They would want that too.' },
  tie: { open: 'Nobody could agree who ought to tell it, so they gave the job to me. Gather round; this one has a tune.', close: 'And that is the song, and the song is done; now somebody buy the bard a cup.' },
};

interface Case { when: (r: FlagReader, flags: Flags) => boolean; lines: (r: FlagReader, flags: Flags) => string[] }
interface SlideSpec { title: string; cases: readonly Case[]; otherwise: string[] }
const c = (when: Case['when'], ...lines: string[]): Case => ({ when, lines: () => lines });
const lives = (_r: FlagReader, flags: Flags): boolean => flags(M56_CAEL_LIVES_FLAG) !== false;
const band = (r: FlagReader, t: FavourTrack): FavourBand => bandAt(r, SNAP, t) ?? 'cold';
const letItDie = (_r: FlagReader, flags: Flags): boolean => choiceOf(flags) === 'let-it-die';

const HOUSE_LINES: Readonly<Record<'halvard' | 'oswin' | 'grisel', Readonly<Record<FavourBand, string>>>> = {
  halvard: {
    cold: 'House Halvard went home to its walls and kept its own counsel. Its soldiers still salute the knight. Its lord does not.',
    banked: 'House Halvard rebuilt its border forts and sent a captain to sit at the boy king\'s table, which is more than it ever sent before.',
    stoked: 'Lord Wystan Halvard rode at the head of the spring muster, and for the first time in forty years nobody asked whose side he was on.',
    hearthbound: 'Lord Wystan Halvard swore his sword to Edric before the whole court, and meant it. Old soldiers wept. So did he.',
  },
  oswin: {
    cold: 'House Oswin balanced its books, sold its grain dear, and asked for nothing. It got nothing, and seemed content.',
    banked: 'House Oswin opened its granaries for one hard winter, and charged only half. In Oswin\'s ledgers, that is a love letter.',
    stoked: 'Lady Merrin Oswin paid for the new bridges herself and put the knight\'s name on the first stone. She says it was good business.',
    hearthbound: 'Lady Merrin Oswin forgave every debt the war had made, in one afternoon, with one signature. The clerks are still recovering.',
  },
  grisel: {
    cold: 'House Grisel closed its gates and its mines and waited for the world to forget. The world did not.',
    banked: 'House Grisel sent its miners home with wages owed, and paid them. It was a beginning.',
    stoked: 'Lady Wenna Grisel took her father\'s seat and gave half of it away, to the miners\' council. Aldous has not been heard from.',
    hearthbound: 'Lady Wenna Grisel melted her father\'s seal and had it struck into lamps for every mine on the rim. Nobody has called a Grisel a jailer since.',
  },
};
const DRAGON_BAND: Readonly<Record<FavourBand, string>> = {
  cold: 'The keepers kept their distance. They do not hate us. They are only very slow to forget.',
  banked: 'The keepers came down from the terraces sometimes, to sun themselves on the rim, and let the children watch from a safe way off.',
  stoked: 'The keepers flew over the harvest that year, low and slow, and every field they passed came up early.',
  hearthbound: 'The keepers learned the names of the villages below them, and the villages learned theirs. Ysmeryth answers to "Grandmother" now.',
};

const SLIDES: readonly SlideSpec[] = [
  {
    title: 'The Forge',
    cases: [
      c((r, f) => !letItDie(r, f) && lives(r, f), 'The Anvil of Ages burns again, and the land warms from the Caldera outward. The knight who lit it came up from the island on their own feet, and slept for three days.'),
      c((r, f) => !letItDie(r, f) && !lives(r, f), 'The Anvil of Ages burns again, and the land warms from the Caldera outward. The knight who lit it did not come back up. Cael Brannoc was the last bearer, and the fire remembers them.'),
      c(letItDie, 'The Anvil of Ages is cold, and will stay cold. The knight walked up from the island with the shard still in their hand, and gave it to no one.'),
    ],
    otherwise: ['The Anvil of Ages is quiet now. The knight came down to it, and the land is changing.'],
  },
  {
    title: 'The Regent',
    cases: [
      c((r) => veyOutcome(r) === 'spared', 'Morcant Vey stood trial in Harrowmark\'s Council Chamber, in chains, and answered every charge. He was not forgiven. He was not hanged. He sweeps the Chamber floor, every morning, under guard.'),
      c((r) => veyOutcome(r) === 'defeated', 'Morcant Vey\'s forge-iron armour hangs in the Foundry, empty, where the stokers can see it. Nobody polishes it.'),
    ],
    otherwise: ['Morcant Vey is gone from the Caldera, and the Foundry is the stokers\' again.'],
  },
  {
    title: 'Harrowmark',
    cases: [
      {
        when: () => true,
        lines: (r) => {
          const held = bannersHeld(r);
          const names = held.map((h) => ({ halvard: 'Halvard\'s grey', oswin: 'Oswin\'s blue', grisel: 'Grisel\'s green' })[h]);
          return [
            'Harrowmark was retaken by midsummer. The boy king\'s first act was to open the Council Chamber to anyone who would sit in it.',
            ...(names.length > 0 ? [`On the Chamber wall hang the banners that held the Rim Gate: ${names.join(', ')}, and one bedsheet nobody will take down.`] : []),
          ];
        },
      },
    ],
    otherwise: ['Harrowmark was retaken by midsummer, and the boy king opened its Council Chamber to all.'],
  },
  {
    title: 'The Houses',
    cases: [{ when: () => true, lines: (r) => (['halvard', 'oswin', 'grisel'] as const).map((h) => HOUSE_LINES[h][band(r, h)]) }],
    otherwise: ['The three Houses went home to count what the war had cost them.'],
  },
  {
    title: 'The Keepers',
    cases: [
      {
        when: () => true,
        lines: (r, flags) => {
          const out = [DRAGON_BAND[band(r, 'dragons')]];
          out.push(f2(r) === 'yielded' ? 'Ysmeryth still tells the story of the knight who yielded to her on the Dragonspine and lived. She thinks it very funny.' : 'Ysmeryth still tells the story of the knight who bested her on the Dragonspine. She tells it as a story about herself.');
          if (r11Spared(r)) out.push('The drake that was spared in the Greyfen nests on the terraces now, and has opinions about everyone.');
          if (r16Given(r)) out.push('The egg that was given back hatched in the spring. The wyrmling follows Ysmeryth everywhere, and does not yet know the song.');
          if (letItDie(r, flags)) {
            const b = scarBand(scarsOf(flags));
            out.push(b === 'light'
              ? 'Without the forge, the keepers warm the land with their own breath. They are strong; they will keep it warm for a long time.'
              : b === 'heavy'
                ? 'Without the forge, the keepers warm the land with their own breath. The shard\'s Scars tire them; they will need help, in time.'
                : 'Without the forge, the keepers warm the land with their own breath, and it costs them. The knight carried too many Scars; the keepers carry them now.');
          }
          return out;
        },
      },
    ],
    otherwise: ['The keepers are awake on the terraces, and they are watching.'],
  },
  {
    title: 'The Ashwalkers',
    cases: [
      {
        when: () => true,
        lines: (r) => {
          const n = pyresLit(r);
          return [
            f8(r) === 'all' ? 'The Ashwalkers came down from the Waste and stayed. Their camp on the rim is a village now, with a name.' : 'Half the Ashwalkers came down from the Waste. The other half are still out there, walking, and send word sometimes.',
            n === 4 ? 'All four pyres in the court were lit with the knight\'s fire. The Ashwalkers sing at them every year, and the names are never forgotten.'
              : n > 0 ? 'Some of the pyres in the court were lit with the knight\'s fire. The Ashwalkers tend those, and remember the others.'
                : 'The pyres in the court were laid but never lit. Wulfhild lights a lamp beside them, every night, so the dead are not in the dark.',
            ...(eormenReleased(r) ? ['Eormen, released, walks with them sometimes, at dusk. Nobody is frightened of him any more.'] : []),
          ];
        },
      },
    ],
    otherwise: ['The Ashwalkers keep their dead, and the knight\'s name with them.'],
  },
  {
    title: 'The Company',
    cases: [
      {
        when: () => true,
        lines: (_r, flags) => {
          const rank = (id: string): number => { const v = flags(`companion.${id}.rank`); return typeof v === 'number' ? v : 0; };
          return [
            rank('tobb') >= 2 ? 'Tobb Fenwick\'s ballad is sung in every tavern from Kettlewick to Saltmere. He swears the best verse is the one he has not written yet.' : 'Tobb Fenwick went back to the road with a new song and an old lute, and was happy.',
            rank('hrolf') >= 2 ? 'Hrolf keeps a cup on his table with the knight\'s name on it, and fills it every feast day, whether the knight comes or not.' : 'Hrolf went back to Cinderreach and the forges. He tells nobody what he did in the war. Everybody knows.',
            rank('aelfreda') >= 2 ? 'Sister Aelfreda keeps a small shrine on the rim where the camp stood. She says the fire there was the truest she ever prayed over.' : 'Sister Aelfreda went home to her order and asked for a quiet chapel. She did not get one.',
          ];
        },
      },
    ],
    otherwise: ['The company went their ways, and kept in touch.'],
  },
  {
    title: 'The Small Folk',
    cases: [
      {
        when: () => true,
        lines: (r) => {
          const miners = f5(r);
          const keep = r27Choice(r) === 'keep';
          return [
            f4(r) === 'cleanse' ? 'Maud\'s well in the Greyfen runs clean, and she charges travellers a penny a cup, and gives the penny back if they look tired.' : 'Maud\'s well in the Greyfen stays sealed. She planted roses on the stone, and they grow very well.',
            'In Kettlewick, Ebba still lights a candle in the window, though the road is safe now. She says it is for whoever comes next.',
            miners === 'miners' ? 'The miners the keep sent up to the tunnel went home heroes, and dug a new seam with their own names on it.'
              : miners === 'stewards' ? 'The stewards who held the tunnel went back to their ledgers, and keep a pick on the wall of the counting-house.'
                : 'The miners and the stewards who held the tunnel still argue about who held it best. Dagna says both of them.',
            keep ? (f6(r) === 'leaders' ? 'The old stokers\' tunnel is a road now, open at both ends, and the miners take their carts through it.' : 'The old stokers\' tunnel stays open, a sally port nobody needs any more. The children dare each other to walk it.') : 'The old stokers\' tunnel is rubble, and the miners have planted a tree on the rim above it.',
            'And the bakery in Kettlewick opened again, the first week of spring. The first loaf went to the knight. The second went to the dragons.',
          ];
        },
      },
    ],
    otherwise: ['The small folk of Valdren went back to their lives, which was what all of it had been for.'],
  },
];

/** The epilogue as N9's `showEpilogue` takes it: the speaker (Tobb on a tie), and eight slides with the speaker's frame. */
export function epilogueFor(flags: Flags): { speaker: string; tie: boolean; slides: SlideDef[] } {
  const r = reader(flags);
  const top = highestTrack(r, SNAP) ?? 'tie';
  const frame = SPEAKER_FRAMES[top];
  const slides: SlideDef[] = SLIDES.map((s) => {
    const hit = s.cases.find((x) => x.when(r, flags));
    const lines = (hit ? hit.lines(r, flags) : s.otherwise).filter((l) => l.trim() !== '');
    return { title: s.title, lines: lines.length > 0 ? lines : s.otherwise };
  });
  slides[0] = { ...slides[0]!, lines: [frame.open, ...slides[0]!.lines] };
  const last = slides.length - 1;
  slides[last] = { ...slides[last]!, lines: [...slides[last]!.lines, frame.close] };
  return { speaker: EPILOGUE_SPEAKERS[top], tie: top === 'tie', slides };
}

// ---- the credits --------------------------------------------------------------------------------------------------------------
const S = (k: string): string => ACT5_CREDITS_STRINGS_EN[k] ?? ENDING_STRINGS[k] ?? k;
const verse = (key: string): string[] => [1, 2, 3, 4].map((i) => S(`${key}.${i}`));
const card = (n: number): CreditBlock => ({ kind: 'card', id: `dlc.${n}`, title: S(`hud.credits.dlc.${n}.title`), lines: [S(`hud.credits.dlc.${n}.line`)] });

/** N9's `CreditsDef`: the cast, Tobb's ballad (the fixed first verse, R30's chosen verse when R30 was sung, the last), and the five DLC cards between the blocks. */
export function creditsFor(flags: Flags): CreditsDef {
  const v = r30Verse(reader(flags));
  return {
    blocks: [
      { kind: 'heading', text: S('hud.credits.title') },
      { kind: 'verse', step: 'verse1', lines: verse('hud.credits.verse1') },
      { kind: 'heading', text: S('credits.a5.cast'), names: CAST },
      card(1),
      ...(v ? [{ kind: 'verse', step: 'chosen', lines: verse(`hud.credits.verse.${v}`) } as const] : []),
      card(2),
      { kind: 'heading', text: S('hud.credits.made'), names: MADE_WITH },
      card(3),
      card(4),
      { kind: 'verse', step: 'last', lines: verse('hud.credits.verse.last') },
      card(5),
      { kind: 'heading', text: S('hud.credits.thanks') },
    ],
  };
}

const CAST = [
  'Cael Brannoc, the knight', 'Tobb Fenwick, the bard', 'Hrolf of Cinderreach', 'Sister Aelfreda', 'Edric IV, the boy king',
  'Lady Wenna Grisel', 'Lord Wystan Halvard', 'Lady Merrin Oswin', 'Wulfhild of the Ashwalkers', 'Brother Ansgar', 'Rook',
  'Alric Emberhand, the last stoker', 'Ysmeryth, the Coal-Mother', 'Morcant Vey, the Regent', 'Ulthred, the First Smith',
];
/** Under N9's "Made with" heading (its wording is open to Mostafa): the libraries the game runs on. */
const MADE_WITH = ['three.js', 'Rapier', 'howler.js', 'Vite', 'TypeScript'];

export const ENDING_STRINGS: Record<string, string> = {
  'scene.ending.rekindle.1': 'A wave of gold runs out across the Anvil\'s face and over the lava lake.',
  'scene.ending.rekindle.2': 'Embers rise from the Caldera like sparks from a struck hammer, thousands of them.',
  'scene.ending.rekindle.3': 'And the land, all the way to the sea, grows warm.',
  'scene.ending.let-it-die.1': 'The Anvil\'s glow sinks from orange to red to the grey of old coals.',
  'scene.ending.let-it-die.2': 'On the terraces the keepers wake, and their breath lights the rim in blue and orange.',
  'scene.ending.let-it-die.3': 'Ash settles, soft as snow. A long dawn begins.',
  'scene.ending.title.lastEmber': 'The Last Ember',
  'scene.ending.title.lastBearer': 'Cael Brannoc, the last bearer',
  'scene.ending.title.longDawn': 'The Long Dawn',
  'credits.a5.cast': 'The company',
};
