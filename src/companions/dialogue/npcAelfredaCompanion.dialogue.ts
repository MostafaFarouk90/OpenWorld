// Sister Aelfreda's companion talk (thread A5, plans/act2-A5.md section 2): the Hearth Rite, once per act. Offered
// while `aelfreda.rite.ready` holds (the companions plugin derives it from the `rite` service). Invented lines,
// logged in design/changes-applied.md.
import type { DialogueDef } from '../../quests/types';

export const RITE_READY_FLAG = 'aelfreda.rite.ready';
const P = 'dialogue.npc-aelfreda-companion.';

export const npcAelfredaCompanion: DialogueDef = {
  id: 'npc-aelfreda-companion',
  start: [
    { when: { flag: RITE_READY_FLAG, equals: true }, node: 'rite-offer' },
    // Scars, but this act's rite is spent.
    { when: { flag: 'story.f10.scars' }, node: 'spent' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'rite-offer', speaker: 'aelfreda', textKey: P + 'rite-offer', next: 'rite-offer-2' },
    {
      id: 'rite-offer-2', speaker: 'aelfreda', textKey: P + 'rite-offer-2',
      choices: [
        { id: 'yes', textKey: P + 'rite-offer-2.yes', effects: [{ event: 'npc.aelfreda.hearthRite' }], next: 'rite-done' },
        { id: 'no', textKey: P + 'rite-offer-2.no', next: 'later' },
      ],
    },
    { id: 'rite-done', speaker: 'aelfreda', textKey: P + 'rite-done', next: 'rite-done-2' },
    { id: 'rite-done-2', speaker: 'aelfreda', textKey: P + 'rite-done-2', next: null },
    { id: 'later', speaker: 'aelfreda', textKey: P + 'later', next: null },
    { id: 'spent', speaker: 'aelfreda', textKey: P + 'spent', next: null },
    { id: 'idle', speaker: 'aelfreda', textKey: P + 'idle', next: null },
  ],
};

export const NPC_AELFREDA_COMPANION_STRINGS_EN: Record<string, string> = {
  [P + 'rite-offer']: 'The shard has marked you, {name}. I can see the scars from here, like frost on a window.',
  [P + 'rite-offer-2']: 'The Hearth Rite can take one away. Once this season, no more; the Hearth is generous, not foolish.',
  [P + 'rite-offer-2.yes']: 'Perform the Hearth Rite.',
  [P + 'rite-offer-2.no']: 'Not now.',
  [P + 'rite-done']: 'Kneel. Breathe out. There. One mark the shard will not get back.',
  [P + 'rite-done-2']: 'Do not thank me. Thank me by not earning it back by supper.',
  [P + 'later']: 'It will keep. Unlike stew.',
  [P + 'spent']: 'I have given the rite once this season. The Hearth gives again when the season turns. Be careful until then.',
  [P + 'idle']: 'No new marks. Good. Keep it so, and keep your bowl out of the ash.',
};
