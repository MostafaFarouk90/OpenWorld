import type { QuestPropSpec } from '../../../props';
import { M24_BLOW, M24_BLOWN, M24_HORN, M24_HORN_FLAG, M24_ITEM } from './m24.quest';
import { R12_BEDS, R12_BURNING, R12_CUTTING, R12_CUT_FLAG, R12_TORCH_FLAG } from './r12.quest';
import { M25_HERBS, M25_PICKS, M25_POTS, M25_POT_FLAGS } from './m25.quest';
import { R14_FREE, R14_FREED } from './r14.quest';
import { R13_ALTAR, R13_SUNG } from './r13.quest';
import { M26_NETS, M26_NET_FLAGS, M26_SCALE, M26_SCALE_TAKEN } from './m26.quest';
import { M27_FREE, M27_FREE_FLAGS } from './m27.quest';
import { D05_SLUICES, D05_SLUICE_FLAGS } from './d05.quest';

/** Interactable props of the nine Greyfen quests (anchors are K3's, plus the extras in extraAnchors.ts); each is live only while its objective is current. */
export const GREYFEN_PROPS: QuestPropSpec[] = [
  // M24: the horn on the pool floor, then the blow at the landing
  { interactableId: M24_HORN, anchorId: 'greyfen.m24.pool.horn', promptKey: 'quest.prompt.horn', objective: ['m24', 'horn'], give: { itemId: M24_ITEM, count: 1 }, usedFlag: M24_HORN_FLAG, look: 'box', hideWhenUsed: true, priority: 1 },
  { interactableId: M24_BLOW, anchorId: 'greyfen.m24.horn.blow', promptKey: 'quest.prompt.blow', objective: ['m24', 'blow'], usedFlag: M24_BLOWN, look: 'chain', priority: 1 },
  // R12: a torch to each bed (the burn) or two cuts at each (the sickle)
  ...R12_BEDS.map((n): QuestPropSpec => ({
    interactableId: `use:r12-bed-${n}-torch`, anchorId: `greyfen.r12.bed.${n}.torch`, promptKey: 'quest.prompt.torch', objective: ['r12', 'burn'],
    usedFlag: R12_TORCH_FLAG(n), when: R12_BURNING, look: 'brazier', hideWhenUsed: true, priority: 1,
  })),
  ...R12_BEDS.flatMap((n) => [1, 2].map((c): QuestPropSpec => ({
    interactableId: `use:r12-bed-${n}-cut-${c}`, anchorId: `greyfen.r12.bed.${n}.cut.${c}`, promptKey: 'quest.prompt.cut', objective: ['r12', 'cut'],
    usedFlag: R12_CUT_FLAG(n, c), when: R12_CUTTING, look: 'stake', hideWhenUsed: true, priority: 1,
  }))),
  // M25: three herbs to pick, then the three pots at the cauldron in order
  ...M25_HERBS.map((herb, i): QuestPropSpec => ({
    interactableId: M25_PICKS[i], anchorId: `greyfen.m25.herb.${i + 1}.pick`, promptKey: `quest.prompt.herb${i + 1}`, objective: ['m25', `pick${i + 1}`],
    give: { itemId: herb, count: 1 }, usedFlag: `story.m25.herb.${i + 1}`, look: 'bucket', hideWhenUsed: true, priority: 1,
  })),
  ...M25_POTS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: 'greyfen.m25.cauldron', promptKey: `quest.prompt.pot${i + 1}`, objective: ['m25', 'brew'], usedFlag: M25_POT_FLAGS[i],
    ...(i > 0 ? { when: { flag: M25_POT_FLAGS[i - 1], equals: true } } : {}), priority: 1,
  })),
  // R14: the tied ranger at post 3 (the prop outranks him until he is free)
  { interactableId: R14_FREE, anchorId: 'greyfen.r14.tied', promptKey: 'quest.prompt.free', objective: ['r14', 'free'], usedFlag: R14_FREED, priority: 1 },
  // R13: the altar, pressed in time to the song (the director judges each press; no used flag, so it stays live for a restart)
  { interactableId: R13_ALTAR, anchorId: 'greyfen.r13.altar', promptKey: 'quest.prompt.altar', objective: ['r13', 'song'], when: { not: { flag: R13_SUNG, equals: true } }, priority: 1 },
  // M26: the four nets, then the scale in the bed Hathren leaves
  ...M26_NETS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `greyfen.mere.net.${i + 1}`, promptKey: 'quest.prompt.net', objective: ['m26', 'nets'], usedFlag: M26_NET_FLAGS[i], look: 'chain', hideWhenUsed: true, priority: 1,
  })),
  { interactableId: M26_SCALE, anchorId: 'greyfen.m26.scale-bed', promptKey: 'quest.prompt.scale', objective: ['m26', 'scale'], give: { itemId: 'hathrens-scale', count: 1 }, usedFlag: M26_SCALE_TAKEN, priority: 1 },
  // M27: three caged wyrmlings
  ...M27_FREE.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `greyfen.m27.brood.${i + 1}`, promptKey: 'quest.prompt.cage', objective: ['m27', 'free'], usedFlag: M27_FREE_FLAGS[i], look: 'chain', hideWhenUsed: true, priority: 1,
  })),
  // D05: the two sluice wheels (K3's water sets read the flags)
  ...D05_SLUICES.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `greyfen.d05.sluice.${i + 1}`, promptKey: 'quest.prompt.sluice', objective: ['d05', `sluice${i + 1}`], usedFlag: D05_SLUICE_FLAGS[i], look: 'chain', priority: 1,
  })),
];
