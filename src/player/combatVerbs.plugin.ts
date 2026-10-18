import type { GamePlugin } from '../core/plugins';
import { CombatVerbs } from './CombatVerbs';
import { COMBAT_STRINGS_EN } from './strings.en';

/** The Knight's combat verbs: block, parry, dodge, stamina, poise, lock-on, Second Wind, death and respawn. */
let verbs: CombatVerbs | null = null;

const plugin: GamePlugin = {
  id: 'combat-verbs',
  dependsOn: ['core'],
  setup(ctx) {
    ctx.strings.register('en', COMBAT_STRINGS_EN);
    verbs = new CombatVerbs(ctx);
    verbs.install();
  },
  dispose() {
    verbs?.dispose();
    verbs = null;
  },
};

export default plugin;
