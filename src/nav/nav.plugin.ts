import type { GamePlugin } from '../core/plugins';
import { NavRegistry } from './NavRegistry';
import type { NavService } from './service';
import './service';

const nav: GamePlugin = {
  id: 'nav',
  dependsOn: ['core'],
  setup(ctx) {
    const registry = new NavRegistry();
    const service: NavService = {
      path: (from, to, opts) => registry.path(from, to, opts),
      hasGrid: (at) => registry.hasGrid(at),
      floorAt: (at) => registry.floorAt(at),
      addGrid: (grid) => registry.add(grid),
      setBlocker: (id, closed) => registry.setBlocker(id, closed),
    };
    ctx.services.provide('nav', service);
  },
};

export default nav;
