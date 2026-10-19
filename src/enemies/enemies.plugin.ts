import type { AssetId } from '../assets/AssetManifest';
import { ModelLibrary, modelLibraryFor } from '../assets/swap/ModelLibrary';
import type { GamePlugin } from '../core/plugins';
import { ENEMY_DEFS } from './defs';
import { EnemyManager, type ModelFactory } from './EnemyManager';
import { hostFromContext } from './host';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { HARROWMARK_SPAWNERS } from './harrowmarkSpawners';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { ENEMY_STRINGS_EN } from './strings.en';
import './events';

const KNIGHT = 'knight';

/**
 * Enemy AI and the slice's first enemies (plans/enemy-ai.md). Registers the `enemies` service, the
 * `enemies` persistable and four systems; auto spawners start once the Knight model has loaded
 * (setup never awaits a download). Headless (no asset loader) the service still works for tests
 * that pass their own model factory, and spawning warns instead of throwing.
 */
let manager: EnemyManager | null = null;

const plugin: GamePlugin = {
  id: 'enemies',
  dependsOn: ['core'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[enemies] ${m}`);
    const assets = ctx.assets;
    // Pack props worn by recipes (the watch guard's pot helm): preloaded here, skipped by the model builder until loaded.
    const lib = modelLibraryFor(assets);
    void lib.preload([...new Set(Object.values(ENEMY_DEFS).flatMap((d) => (d.model.props ?? []).map((p) => p.id)))]);
    const prop = (id: string) => {
      const t = lib.peek(id);
      return t ? ModelLibrary.object(t) : null;
    };
    const makeModel: ModelFactory = (def) => {
      if (!assets) throw new Error('no asset loader (headless)');
      // The recipe's preferred models (the cutpurse's Rogue) when loaded, the Knight otherwise.
      for (const id of def.model.prefer) {
        try {
          return { model: assets.instantiate(id as AssetId), clips: assets.animations(id as AssetId), prop };
        } catch {
          // not loaded (yet): try the next, then the Knight
        }
      }
      return { model: assets.instantiate(KNIGHT), clips: assets.animations(KNIGHT), prop };
    };
    const m = new EnemyManager(hostFromContext(ctx, warn), makeModel, { spawners: [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...HARROWMARK_SPAWNERS] });
    manager = m;

    ctx.strings.register('en', ENEMY_STRINGS_EN);
    ctx.services.provide('enemies', m.service);
    ctx.persist.register({
      key: 'enemies',
      version: 1,
      serialize: () => m.spawners.serialize(),
      load: (data) => m.spawners.load(data),
    });
    ctx.persist.register({
      key: m.tally.key,
      version: m.tally.version,
      serialize: () => m.tally.serialize(),
      load: (data) => m.tally.load(data),
    });
    ctx.systems.add({ id: 'enemies.think', fixedPhase: 'intent', order: -150, fixedUpdate: (dt) => m.think(dt) });
    ctx.systems.add({ id: 'enemies.animate', fixedPhase: 'animation', order: 50, fixedUpdate: (dt) => m.animate(dt) });
    ctx.systems.add({ id: 'enemies.react', fixedPhase: 'afterCombat', order: 50, fixedUpdate: (dt) => m.react(dt) });
    ctx.systems.add({ id: 'enemies.render', renderPhase: 'world', order: 50, render: (alpha) => m.render(alpha) });

    if (assets) {
      for (const def of Object.values(ENEMY_DEFS)) for (const id of def.model.prefer) assets.load(id as AssetId).catch(() => undefined);
      assets.load(KNIGHT).then(
        () => {
          if (manager === m) m.spawners.startAuto();
        },
        (err) => warn(`Knight model failed to load; no enemies spawn (${String(err)})`),
      );
    }
  },
  dispose() {
    manager?.dispose();
    manager = null;
  },
};

export default plugin;
