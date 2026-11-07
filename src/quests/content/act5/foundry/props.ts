// Interactable props of the Foundry quests; each is live only while its objective is current. Prompt keys are
// `quest.prompt.a5f.<name>`, so they never share a key with another block's table.
import type { QuestPropSpec } from '../../../props';
import { FA } from './anchors';
import { R27_CHARGE, R27_LAMP, R27_PROP, D09_SLUICE, R28_LAID, R28_LIT, R30_LINE } from './flags';
import { R27_CHARGES, R27_LAMPS, R27_PROPS, R27_USE } from './r27.quest';
import { R28_LAY, R28_LIGHT, R28_PYRE_NS, R28_RITE } from './r28.quest';
import { R30_ANVIL, R30_YSMERYTH_SPOT, R30_YSMERYTH_USE } from './r30.quest';
import { D09_SLUICES, D09_SLUICE_USE } from './d09.quest';

export const R28_RITE_USE = 'use:r28-rite';
const T = (s: string): string => `caldera.int.tunnel.${s}`;

const p = (name: string, interactableId: string, anchorId: string, objective: [string, string], usedFlag: string | undefined, extra: Partial<QuestPropSpec> = {}): QuestPropSpec =>
  ({ interactableId, anchorId, promptKey: `quest.prompt.a5f.${name}`, objective, ...(usedFlag ? { usedFlag } : {}), priority: 1, ...extra });

export const FOUNDRY_A5_PROPS: QuestPropSpec[] = [
  // R27: the shoring props, the tunnel's lamps, the charges at the far shoring
  ...R27_PROPS.map((n) => p('shore', R27_USE.prop(n), T(`prop.${n}`), ['r27', 'line'], R27_PROP(n), { look: 'stake', lookOnlyUsed: true })),
  ...R27_LAMPS.map((n) => p('lamp', R27_USE.lamp(n), T(`lamp.${n}`), ['r27', 'line'], R27_LAMP(n), { look: 'brazier', lookOnlyUsed: true })),
  ...R27_CHARGES.map((n) => p('charge', R27_USE.charge(n), T(`charge.${n}`), ['r27', 'line'], R27_CHARGE(n), { look: 'box', lookOnlyUsed: true })),
  // R28: lay the wood at each pyre (its token carried in first); light it (optional, Heartshard fire, before the rite); the rite
  ...R28_PYRE_NS.map((n) => p('lay', R28_LAY(n), FA.pyre(n), ['r28', `lay${n}`], R28_LAID(n), { look: 'hearth', lookOnlyUsed: true })),
  // no used flag: the director spends the Burn and writes `story.r28.lit<n>` (the prop hides itself once lit)
  ...R28_PYRE_NS.map((n) => p('light', R28_LIGHT(n), FA.pyre(n), ['r28', 'rite'], undefined, { when: { not: { flag: R28_LIT(n), equals: true } }, priority: 2 })),
  p('rite', R28_RITE_USE, FA.rite, ['r28', 'rite'], R28_RITE, { look: 'brazier' }),
  // R30: the camp's old anvil (the director runs the rhythm run on use)
  p('anvil', R30_ANVIL, FA.r30Anvil, ['r30', 'tune'], undefined, { look: 'hearth' }),
  // R30: Ysmeryth's line (she has no talk interactable of her own; the director opens her tree)
  p('ysmeryth', R30_YSMERYTH_USE, R30_YSMERYTH_SPOT, ['r30', 'lines'], undefined, { when: { not: { flag: R30_LINE('ysmeryth'), equals: true } } }),
  // D09: the three slag sluices (the director checks the order; no used flag, a wrong order resets them)
  ...D09_SLUICES.map((n) => p('sluice', D09_SLUICE_USE(n), `caldera.int.foundry.sluice.${n}`, ['d09', 'slag'], undefined, { when: { not: { flag: D09_SLUICE(n), equals: true } } })),
];

export const FOUNDRY_A5_PROMPTS: Record<string, string> = {
  shore: 'Set the shoring prop', lamp: 'Light the lamp', charge: 'Set the charge', lay: 'Lay the pyre wood',
  light: 'Light the pyre with Heartshard fire (10 Burn)', rite: 'Begin the rite', anvil: 'Drum the tune with Tobb', ysmeryth: 'Speak to Ysmeryth', sluice: 'Turn the sluice',
};
