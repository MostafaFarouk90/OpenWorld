// Quest posts for the summit's movers (spread into `POST_RULES`, quests/posts.ts, after K4's): Eadgyth walks from the shelter to the summit gate
// while M31 runs and on to the Hearth for the rest of the act; Thorgar is at Skyhold for M33, at the Hearth for M34, at the chasm ledge for D06 and at
// the Aerie landing for its hand-in; the captive hunter stands in the keep. Derived from flags and quest state (a load re-applies them); the
// anchors `dragonspine.d06.thorgar` and `dragonspine.m34.thorgar` are defined by the summit director.
import type { PostRule } from '../../../posts';

export const D06_THORGAR_POST = 'dragonspine.d06.thorgar';
export const M34_THORGAR_POST = 'dragonspine.m34.thorgar';
const GATE_MET = 'story.m31.gateMet';

export const SUMMIT_POST_RULES: PostRule[] = [
  {
    npcId: 'eadgyth',
    home: 'npc-post.eadgyth.fire',
    posts: [
      { when: { flag: GATE_MET, equals: true }, anchorId: 'dragonspine.hearth.eadgyth' },
      { when: { all: [{ quest: 'm31', state: 'active' }, { objective: ['m31', 'brief'], done: true }] }, anchorId: 'dragonspine.summit-gate.eadgyth' },
    ],
  },
  {
    npcId: 'thorgar',
    home: 'npc-post.thorgar.yard',
    posts: [
      { when: { all: [{ quest: 'd06', state: 'active' }, { objective: ['d06', 'skarl'], done: true }] }, anchorId: 'dragonspine.aerie.landing' },
      { when: { all: [{ quest: 'm34', state: 'completed' }, { not: { quest: 'd06', state: 'completed' } }] }, anchorId: D06_THORGAR_POST },
      { when: { quest: 'm34', state: 'active' }, anchorId: M34_THORGAR_POST },
      { when: { all: [{ quest: 'm32', state: 'completed' }, { not: { quest: 'm33', state: 'completed' } }] }, anchorId: 'dragonspine.skyhold.thorgar' },
    ],
  },
  { npcId: 'captive-hunter', home: 'dragonspine.aerie.keep.door', posts: [{ when: { flag: 'story.d06.started', equals: true }, anchorId: 'dragonspine.keep.captive' }] },
];
