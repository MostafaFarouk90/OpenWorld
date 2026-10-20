// Act 1 density pass, batch 3 (the quests thread; additive to thread 17's city layout): the anchors, triggers and NPCs the
// fuller M06, M07, R02 (in the Bastion yard), R03 and R04 need. Engine metres, +Z north; compass headings as in
// harrowmark.layout.ts. The two gate refugees stand on thread 17's queue anchors outside the wall.
import type { AnchorSpec, LayoutData, NpcSpec, TriggerSpec } from '../region/layoutTypes';
import { a } from './layout.helpers';

const anchors: AnchorSpec[] = [
  // M06: Rook waits by the gate brazier inside the gate once Cael is through; the refugees move in once the brazier may
  // judge them too.
  a('npc-post.rook.inner', 8530, 1289, 135, ['npc-post']),
  a('npc-post.refugee-1.inside', 8452, 1338, 90, ['npc-post']),
  a('npc-post.refugee-2.inside', 8455, 1343, 120, ['npc-post']),

  // M07: two Guild Quarter stallholders who saw the thieves run, and the coins dropped along the way to the alley.
  a('npc-post.stallholder-1', 8763.8, 1529.5, 120, ['npc-post']),
  a('npc-post.stallholder-2', 8789.5, 1536.4, 210, ['npc-post']),
  a('m07.coin-1', 8830, 1522, 90, ['quest', 'interact']),
  a('m07.coin-2', 8885, 1524, 90, ['quest', 'interact']),
  a('m07.coin-3', 8928, 1523, 90, ['quest', 'interact']),

  // R02 in the Bastion yard (from M06 on): Stane's three blocking dummies south of his post, then the yard veterans.
  a('bastion.r02.dummy-1', 8170, 1730, 0, ['dummy']),
  a('bastion.r02.dummy-2', 8175, 1730, 0, ['dummy']),
  a('bastion.r02.dummy-3', 8180, 1730, 0, ['dummy']),
  a('spawn.r02.bastion-bout', 8195, 1728, 300, ['spawn']),
  a('spawn.r02.bastion-pair-1', 8190, 1722, 330, ['spawn']),
  a('spawn.r02.bastion-pair-2', 8200, 1722, 30, ['spawn']),

  // R03: the Guildhall doorman, Jory Pellam by the old stable (once his thugs are down) and the two cutpurses who try
  // to snatch the copper on the way back to the Anvil.
  a('npc-post.guild-doorman', 8858, 1582, 180, ['npc-post']),
  a('npc-post.pellam', 8858, 1622, 90, ['npc-post']),
  a('spawn.r03.snatch-1', 8745, 1626, 90, ['spawn']),
  a('spawn.r03.snatch-2', 8750, 1632, 90, ['spawn']),

  // R04: the chapel sexton, the Guild fence, and Steward Crabbe on the Counting-House steps.
  a('npc-post.sexton', 8372, 2142, 270, ['npc-post']),
  a('npc-post.fence', 8727, 1545, 90, ['npc-post']),
  a('npc-post.crabbe', 8774, 1984, 90, ['npc-post']),
];

const triggers: TriggerSpec[] = [
  // M06 ends at the Tilted Anvil's sign on Forge Row, where Aldith offers M07.
  { id: 'trg.harrowmark.anvil-sign', shape: 'sphere', x: 8204, z: 1645, radius: 7 },
];

const npcs: NpcSpec[] = [
  { id: 'refugee-1', post: 'harrowmark.gate.south.queue.1' },
  { id: 'refugee-2', post: 'harrowmark.gate.south.queue.3' },
  { id: 'stallholder-1', post: 'npc-post.stallholder-1' },
  { id: 'stallholder-2', post: 'npc-post.stallholder-2' },
  { id: 'guild-doorman', post: 'npc-post.guild-doorman' },
  { id: 'pellam', post: 'npc-post.pellam', presentWhen: 'story.r03.thugsBeaten' },
  { id: 'sexton', post: 'npc-post.sexton' },
  { id: 'fence', post: 'npc-post.fence' },
  { id: 'crabbe', post: 'npc-post.crabbe', presentWhen: 'story.r04.pagesFound' },
];

export const DENSITY_LAYOUT_HM: LayoutData = { anchors, triggers, structures: [], patrols: [], npcs, fields: [] };
