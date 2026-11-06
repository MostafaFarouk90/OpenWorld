// Plugin `structure-breaks` (L0, contracts v0.8 item 11): provides the `structureBreaks` service and ticks its windows.
import type { GamePlugin } from '../core/plugins';
import { StructureBreaks } from './structureBreak';

let teardown: (() => void) | null = null;

const structureBreaks: GamePlugin = {
  id: 'structure-breaks',
  dependsOn: ['core'],
  setup(ctx) {
    const svc = new StructureBreaks((e, p) => ctx.events.emit(e, p));
    const offs = [
      ctx.services.provide('structureBreaks', svc),
      ctx.systems.add({ id: 'structure-breaks.tick', fixedPhase: 'rules', order: 471, fixedUpdate: (dt) => svc.tick(dt) }),
    ];
    teardown = () => {
      for (const o of offs.splice(0).reverse()) o();
    };
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

export default structureBreaks;
