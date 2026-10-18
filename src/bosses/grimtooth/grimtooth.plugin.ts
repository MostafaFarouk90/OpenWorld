import type { GamePlugin } from '../../core/plugins';
import { GrimtoothDirector } from './GrimtoothDirector';
import { buildGrimtoothModel } from './GrimtoothModel';
import { GRIMTOOTH_STRINGS_EN } from './strings.en';

let director: GrimtoothDirector | null = null;

/**
 * Gaffer Grimtooth, the D02 boss (plans/slice-2-grimtooth.md). Waits in 3a's Underways arena; the fight runs on the core
 * boss registry, which alone emits `boss.*`. His model is thread 5's procedural hound rig, so there is nothing to load.
 * Depends on `interiors` (its `save.loaded` teleport runs after 3a's stale-load rescue) and `enemies` (the summons).
 */
const plugin: GamePlugin = {
  id: 'gaffer-grimtooth',
  dependsOn: ['core', 'interiors', 'enemies'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[gaffer-grimtooth] ${m}`);
    const d = new GrimtoothDirector(ctx, { warn, modelState: () => 'ready', makeModel: () => buildGrimtoothModel(warn) });
    director = d;
    ctx.strings.register('en', GRIMTOOTH_STRINGS_EN);
    ctx.systems.add({ id: 'bosses.grimtooth', fixedPhase: 'intent', order: -140, fixedUpdate: (dt) => d.fixedUpdate(dt) });
  },
  dispose() {
    director?.dispose();
    director = null;
  },
};

export default plugin;
