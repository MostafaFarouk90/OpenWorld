import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.scene-act1-camp.';
const flagIs = (flag: string, equals: string): Condition => ({ flag, equals });
const route = (v: string): Condition => flagIs('story.m06.route', v);
const d01Done: Condition = { quest: 'd01', state: 'completed' };
const prior = (v: string): Condition => ({ all: [d01Done, flagIs('boss.ashen-prior.outcome', v)] });

export const sceneAct1Camp: DialogueDef = {
  id: 'scene-act1-camp',
  start: 'c1',
  nodes: [
    { id: 'c1', speaker: 'tobb', textKey: P + 'c1', effects: [{ event: 'story.act1.camp.begin' }], next: 'c2' },
    { id: 'c2', speaker: 'cael', textKey: P + 'c2', next: 'gate-stealth' },

    // 1. how Cael got through the South Gate
    { id: 'gate-stealth', speaker: 'rook', textKey: P + 'gate-stealth', when: route('stealth'), next: 'gate-bribe' },
    { id: 'gate-bribe', speaker: 'gaut', textKey: P + 'gate-bribe', when: route('bribe'), next: 'gate-persuasion' },
    { id: 'gate-persuasion', speaker: 'rook', textKey: P + 'gate-persuasion', when: route('persuasion'), next: 'prior-released' },

    // 2. the Prior in the chapel vault
    { id: 'prior-released', speaker: 'tobb', textKey: P + 'prior-released', when: prior('released'), next: 'prior-defeated' },
    { id: 'prior-defeated', speaker: 'gaut', textKey: P + 'prior-defeated', when: prior('defeated'), next: 'prior-rumour' },
    { id: 'prior-rumour', speaker: 'rook', textKey: P + 'prior-rumour', when: { not: d01Done }, next: 'grim-released' },

    // 3. Gaffer Grimtooth
    { id: 'grim-released', speaker: 'rook', textKey: P + 'grim-released', when: flagIs('boss.gaffer-grimtooth.outcome', 'released'), next: 'grim-defeated' },
    { id: 'grim-defeated', speaker: 'tobb', textKey: P + 'grim-defeated', when: flagIs('boss.gaffer-grimtooth.outcome', 'defeated'), next: 'steward-expose' },

    // 4. the Archive steward
    { id: 'steward-expose', speaker: 'gaut', textKey: P + 'steward-expose', when: flagIs('story.r04.choice', 'expose'), next: 'steward-shield' },
    { id: 'steward-shield', speaker: 'rook', textKey: P + 'steward-shield', when: flagIs('story.r04.choice', 'shield'), next: 'debt-forgiven' },

    // 5. Aldith's debt
    { id: 'debt-forgiven', speaker: 'tobb', textKey: P + 'debt-forgiven', when: flagIs('world.harrowmark.inn.price', 'forgiven'), next: 'debt-collected' },
    { id: 'debt-collected', speaker: 'gaut', textKey: P + 'debt-collected', when: flagIs('world.harrowmark.inn.price', 'collected'), next: 'notes' },

    { id: 'notes', speaker: 'tobb', textKey: P + 'notes', next: 'oath' },
    { id: 'oath', speaker: 'gaut', textKey: P + 'oath', next: 'respect' },
    { id: 'respect', speaker: 'rook', textKey: P + 'respect', next: 'smoke' },
    { id: 'smoke', speaker: 'rook', textKey: P + 'smoke', next: 'bells' },
    { id: 'bells', speaker: 'gaut', textKey: P + 'bells', next: 'end' },
    {
      id: 'end', speaker: 'cael', textKey: P + 'end',
      effects: [{ setFlag: 'story.d02.campSeen', value: true }, { event: 'story.act1.camp.end' }],
      next: null,
    },
  ],
};
