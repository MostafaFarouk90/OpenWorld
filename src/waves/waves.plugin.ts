import type { GamePlugin } from '../core/plugins';
import type { StructureKind } from './types';
import { defenderBodyFactory } from './defenders';
import { WAVE_SETS } from './defs';
import { WaveDirector } from './director';
import { WAVES_STRINGS_EN } from './strings.en';
import type { NpcModelLoader } from '../npcs/types';

declare module '../core/coreServices' {
  interface WavesService {
    /** v0.6 additive (A7): kind and maximum health of a structure id from `structure.damaged` (carts and the barricade); undefined for an unknown id. */
    structure(id: string): { kind: StructureKind; maxHealth: number } | undefined;
  }
}

let director: WaveDirector | null = null;

/**
 * Waves and structures (plans/act2-A7.md): provides the `waves` service, the `waves` persistable and one `rules` system.
 * The wave spawners are data in the enemies plugin's list (`WAVE_SPAWNERS`), because only it can register spawners.
 */
const plugin: GamePlugin = {
  id: 'waves',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const d = new WaveDirector(ctx, { defs: WAVE_SETS, makeBody: defenderBodyFactory(ctx.assets as unknown as NpcModelLoader | null) });
    director = d;
    ctx.strings.register('en', WAVES_STRINGS_EN);
    ctx.services.provide('waves', d);
    ctx.persist.register({
      key: 'waves',
      version: 1,
      serialize: () => d.serialize(),
      load: (data, version) => d.load(data, version),
    });
    ctx.systems.add({ id: 'waves.director', fixedPhase: 'rules', order: 0, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    director?.dispose();
    director = null;
  },
};

export default plugin;
