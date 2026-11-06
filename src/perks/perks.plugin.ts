// Plugin `perks` (L0, contracts v0.8 item 17): the perks service, bound once to the spells service's Burn decay scale.
import type { GamePlugin } from '../core/plugins';
import { Perks } from './Perks';
import './types';

let teardown: (() => void) | null = null;

const perks: GamePlugin = {
  id: 'perks',
  dependsOn: ['core', 'spells'],
  setup(ctx) {
    const svc = new Perks();
    const offs: Array<() => void> = [ctx.services.provide('perks', svc)];
    const bind = ctx.services.get('spells')?.setBurnDecayScale?.(() => svc.burnDecayScale());
    if (bind) offs.push(bind);
    teardown = () => {
      for (const o of offs.splice(0).reverse()) o();
    };
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

export default perks;
