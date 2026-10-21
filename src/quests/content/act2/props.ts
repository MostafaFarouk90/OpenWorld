import type { QuestPropSpec } from '../../props';

const each = (n: number, f: (i: number) => QuestPropSpec): QuestPropSpec[] => Array.from({ length: n }, (_, i) => f(i + 1));

/** Interactable props of the Cinderreach quests (anchors are A3's; the d03 gate points are A12's, defined by the director). */
export const ACT2_PROPS: QuestPropSpec[] = [
  // M11: the Halvard banner at the River Gate; the three blightblooms on the ring
  {
    interactableId: 'use:m11-banner', anchorId: 'harrowmark.gate.river.inside', promptKey: 'quest.prompt.banner',
    objective: ['m11', 'banner'], usedFlag: 'story.m11.bannerRaised', look: 'stake',
  },
  ...each(3, (n) => ({
    interactableId: `use:m11-bloom-${n}`, anchorId: `cinderreach.m11.bloom.${n}`, promptKey: 'quest.prompt.bloom',
    objective: ['m11', 'blooms'] as [string, string], usedFlag: `story.m11.bloom.${n}`, look: 'brazier' as const, hideWhenUsed: true,
  })),
  // M12: barricade prep and the two wounded who are tended where they lie
  ...each(3, (n) => ({
    interactableId: `use:m12-prep-${n}`, anchorId: `cinderreach.m12.prep.${n}`, promptKey: 'quest.prompt.prep',
    objective: ['m12', 'prep'] as [string, string], usedFlag: `story.m12.prep.${n}`, look: 'stake' as const,
  })),
  ...[3, 4].map((n) => ({
    interactableId: `use:m12-tend-${n - 2}`, anchorId: `cinderreach.m12.wounded.${n}`, promptKey: 'quest.prompt.tend',
    objective: ['m12', 'tend'] as [string, string], usedFlag: `story.m12.tend.${n - 2}`, look: 'box' as const,
  })),
  // R06: blight samples; the well (sealed: boarded; cleansed by an Emberwright's fire)
  ...each(3, (n) => ({
    interactableId: `use:r06-sample-${n}`, anchorId: `cinderreach.r06.sample.${n}`, promptKey: 'quest.prompt.sample',
    objective: ['r06', 'samples'] as [string, string], usedFlag: `story.r06.sample.${n}`, look: 'candle' as const, hideWhenUsed: true,
  })),
  {
    interactableId: 'use:r06-board-well', anchorId: 'cinderreach.r06.well', promptKey: 'quest.prompt.boardWell',
    objective: ['r06', 'board'], usedFlag: 'story.r06.boarded', look: 'chain',
  },
  {
    interactableId: 'use:r06-cleanse', anchorId: 'cinderreach.r06.well', promptKey: 'quest.prompt.cleanseWell',
    objective: ['r06', 'fire'], usedFlag: 'story.r06.fired', look: 'brazier',
  },
  // R05: the fog hollows, the tracks and the Dell stone
  ...each(3, (n) => ({
    interactableId: `use:r05-hollow-${n}`, anchorId: `cinderreach.pasture.hollow.${n}`, promptKey: 'quest.prompt.hollow',
    objective: ['r05', 'hollows'] as [string, string], usedFlag: `story.r05.hollow.${n}`,
  })),
  ...each(3, (n) => ({
    interactableId: `use:r05-track-${n}`, anchorId: `cinderreach.r05.track.${n}`, promptKey: 'quest.prompt.track',
    objective: ['r05', 'tracks'] as [string, string], usedFlag: `story.r05.track.${n}`, look: 'stake' as const, hideWhenUsed: true,
  })),
  {
    interactableId: 'use:r05-dell-stone', anchorId: 'cinderreach.dell.entrance', promptKey: 'quest.prompt.dellStone',
    objective: ['r05', 'dell'], usedFlag: 'story.r05.dellStone', look: 'grave',
  },
  // M13: the boulder heave
  {
    interactableId: 'use:m13-heave', anchorId: 'cinderreach.m13.boulder', promptKey: 'quest.prompt.heave',
    objective: ['m13', 'heave'], usedFlag: 'story.m13.heaved', look: 'rubble',
  },
  // R07: den signs and the two pups (cull branch)
  ...each(5, (n) => ({
    interactableId: `use:r07-sign-${n}`, anchorId: `cinderreach.r07.sign.${n}`, promptKey: 'quest.prompt.sign',
    objective: ['r07', 'signs'] as [string, string], usedFlag: `story.r07.sign.${n}`, look: 'stake' as const, hideWhenUsed: true,
  })),
  ...each(2, (n) => ({
    interactableId: `use:r07-pup-${n}`, anchorId: `cinderreach.r07.pup.${n}`, promptKey: 'quest.prompt.cullPup',
    objective: ['r07', 'pups'] as [string, string], usedFlag: `story.r07.pup.${n}`, hideWhenUsed: true,
  })),
  // R11: the axe
  {
    interactableId: 'use:r11-axe', anchorId: 'cinderreach.r11.axe', promptKey: 'quest.prompt.axe',
    objective: ['r11', 'axe'], usedFlag: 'story.r11.axeTaken', look: 'box',
  },
  // M15: the cage keys, the bound carter's bonds and the wyrmling's cage
  {
    interactableId: 'use:m15-cage-keys', anchorId: 'cinderreach.m15.search.4', promptKey: 'quest.prompt.cageKeys',
    objective: ['m15', 'keys'], usedFlag: 'story.m15.keysTaken', give: { itemId: 'cage-keys', count: 1 }, look: 'box', hideWhenUsed: true,
  },
  {
    interactableId: 'use:m15-free-carter', anchorId: 'cinderreach.m15.carter', promptKey: 'quest.prompt.freeCarter',
    objective: ['m15', 'free'], usedFlag: 'story.m15.carterFree', look: 'chain',
  },
  {
    interactableId: 'use:m15-cage', anchorId: 'cinderreach.m15.cage', promptKey: 'quest.prompt.openCage',
    objective: ['m15', 'cage'], usedFlag: 'story.m15.cageOpen', look: 'chain',
  },
  // D03: three charge points on the fort gate (anchors `cinderreach.d03.gate.<n>`, A3's, added by A12) and the caged prisoners
  ...each(3, (n) => ({
    interactableId: `use:d03-gate-${n}`, anchorId: `cinderreach.d03.gate.${n}`, promptKey: 'quest.prompt.charge',
    objective: ['d03', 'gate'] as [string, string], usedFlag: `story.d03.gate.${n}`, look: 'brazier' as const,
  })),
  ...each(2, (n) => ({
    interactableId: `use:d03-prisoner-${n}`, anchorId: `cinderreach.d03.prisoner.${n}`, promptKey: 'quest.prompt.freePrisoner',
    objective: ['d03', 'prisoners'] as [string, string], usedFlag: `story.d03.prisoner.${n}`, look: 'chain' as const,
  })),
];

/** Props on the spot an NPC stands on (Pell in the second hollow, Osric at the first sign, the bound carter): the prop outranks him while it is current (focus ties go to `npc:`). */
const UNDER_NPCS: ReadonlySet<string> = new Set(['use:r05-hollow-2', 'use:r07-sign-1', 'use:m15-free-carter']);
for (const p of ACT2_PROPS) if (UNDER_NPCS.has(p.interactableId)) p.priority = 1;
