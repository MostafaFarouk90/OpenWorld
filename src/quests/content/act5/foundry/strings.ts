// The Foundry quests' journal strings (titles, summaries, objective lines) and prompts. Prose is invented where the design is
// silent (Q6). Keys are `quest.<id>.*` and `quest.prompt.a5f.*`; none is shared with another block (the duplicate-key trap).
import { beatStrings } from '../../act4/harrowmark/director/beat';
import { FOUNDRY_A5_PROMPTS } from './props';
import { SPIRIT_FLAME_STRINGS } from './spiritFlames';

const prompts = Object.fromEntries(Object.entries(FOUNDRY_A5_PROMPTS).map(([k, v]) => [`quest.prompt.a5f.${k}`, v]));

export const FOUNDRY_A5_QUEST_STRINGS: Record<string, string> = {
  ...prompts,
  'quest.prompt.a5f.token': 'Carry the token to the pyre',
  ...SPIRIT_FLAME_STRINGS,

  // R27
  'quest.r27.title': 'Grisel\'s Redemption',
  'quest.r27.summary': 'Vey\'s counter-attack is coming through the old stokers\' tunnel under the rim. Wenna means to hold it.',
  'quest.r27.brief': 'Hear Wenna out at the Rim Camp',
  'quest.r27.enter': 'Go into the stokers\' tunnel',
  'quest.r27.captain': 'Find the tunnel\'s captain',
  'quest.r27.props': 'Set the shoring props',
  'quest.r27.lamps': 'Light the tunnel\'s lamps',
  'quest.r27.charges': 'Set the charges at the far shoring',
  'quest.r27.signs': 'Read the tunnel\'s marks',
  'quest.r27.hold': 'Hold the tunnel',
  'quest.r27.choose': 'Decide the far shoring: bring it down or keep the tunnel',
  'quest.r27.report': 'Tell Wenna it is done',

  // R28
  'quest.r28.title': 'The Ashwalkers\' Pyre',
  'quest.r28.summary': 'The siege\'s fallen lie in the Rim Gate\'s court. Wulfhild asks that they be given to the fire properly.',
  'quest.r28.brief': 'Speak with Wulfhild',
  ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [
    [`quest.r28.mourner${n}`, `Hear the mourner at the ${['first', 'second', 'third', 'fourth'][n - 1]} pyre`],
    [`quest.r28.name${n}`, 'Find the fallen soldier\'s name'],
    [`quest.r28.token${n}`, 'Carry their token to the pyre'],
    [`quest.r28.lay${n}`, 'Lay the pyre\'s wood'],
  ])),
  'quest.r28.risen2': 'Lay the risen dead to rest',
  'quest.r28.risen4': 'Lay the risen dead to rest',
  'quest.r28.rite': 'Light the pyres you choose, then begin the rite',
  'quest.r28.farewell': 'Speak with Wulfhild at the pyres',

  // R30
  'quest.r30.title': 'Tobb\'s Ballad',
  'quest.r30.summary': 'Tobb is writing the song of the Rim and wants a line from everyone who stood there.',
  'quest.r30.brief': 'Talk to Tobb',
  'quest.r30.lines': 'Collect a line from each ally',
  'quest.r30.pages': 'Find the three pages the siege scattered',
  'quest.r30.tune': 'Drum the tune on the camp\'s anvil with Tobb',
  'quest.r30.verse': 'Choose the verse the song will end on',
  'quest.r30.sing': 'Hear the camp sing',

  // M53
  'quest.m53.title': 'Vey\'s Last Argument',
  'quest.m53.summary': 'Edric wants you to hear the Regent before the duel. Vey waits at the Inner Gate under a truce banner.',
  'quest.m53.brief': 'Speak with Edric',
  'quest.m53.rook': 'Hear Rook before you go',
  'quest.m53.truce': 'Go down to the Inner Gate and hear Vey',
  'quest.m53.broken': 'Deal with those who break the truce',
  'quest.m53.gate': 'Look over what the truce left at the gate',
  'quest.m53.decide': 'Hear Edric\'s decision',

  // D09
  'quest.d09.title': 'Iron and Ember',
  'quest.d09.summary': 'Vey has withdrawn into the Foundry. Alric knows the way down, floor by floor.',
  'quest.d09.brief': 'Speak with Alric at the Foundry door',
  'quest.d09.enter': 'Enter the Foundry',
  'quest.d09.patrol': 'Clear the slag foundry\'s patrol',
  'quest.d09.stoker': 'Free the captive stoker',
  'quest.d09.plate': 'Read the stokers\' plate',
  'quest.d09.slag': 'Route the slag to cool the lift',
  'quest.d09.guards': 'Get past the vat gallery\'s guards',
  'quest.d09.gallery': 'Search the vat gallery',
  'quest.d09.vey': 'Face Morcant Vey',
  'quest.d09.after': 'Hear Alric out',
  'quest.d09.slagFlood': 'The slag floods the runnels. The sluices reset.',
  'quest.d09.slagLesson': 'The plate\'s next wheel glows.',
  'quest.r28.lit': 'The pyre takes the Heartshard fire.',
  'quest.r28.litWalkers': 'The pyre takes the Heartshard fire. The Ashwalkers light their torches from it.',
  'quest.r28.tooHot': 'The Heartshard is too hot to give more fire. Let the Burn fall first.',
  'quest.r28.riteDone': 'The pyres burn down. The ash goes up, not into the stone.',
  'quest.r27.lineSet': 'The line is set. Stand at the posts: they are coming.',
  'quest.r27.collapse': 'The charges go off. The far shoring comes down with a sound like a mountain sitting.',
  'quest.r30.sung': 'The whole camp takes up Tobb\'s song.',
  'quest.m53.withdrawn': 'Vey walks back into the Foundry. The truce is over.',
  'quest.d09.sluiceRight': 'The slag runs down the right channel.',
  'quest.d09.slagDone': 'The slag cools in the basin. The lift gate grinds open.',
  ...beatStrings('quest.r30.beat', {
    start: 'Tobb counts you in. Strike the anvil on the beat.', lesson: 'Strike on the gold cells.', real: 'Ring out the Rim\'s tune: strike on the gold cells.',
    falter: 'Tobb loses the tune and laughs. Again.', assist: 'Tobb takes the beat and nods you along.',
  }),
};
