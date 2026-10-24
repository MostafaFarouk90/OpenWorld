import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { codexEntry } from '../../codex/entries';
import '../../codex/service';
import { AnvilRubbings, READABLE_FLAG } from './rubbings';
import { RUBBING_STRINGS_EN } from './strings.en';
import { RUBBINGS_COLLECTION_ID } from './tuning';

/**
 * The `anvilRubbings` service (K9 PR 1). K9's Last Anvil plugin registers six rubbings; K2 registers its six through the
 * same `register` call, at any time (a registration after a load re-derives the codex).
 */
const rubbingsPlugin: GamePlugin = {
  id: 'anvil-rubbings',
  dependsOn: ['core', 'codex'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', RUBBING_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const service = new AnvilRubbings({
      getBool: (k) => ctx.state.getBool(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitTaken: (rubbingId) => emit('rubbing.taken', { rubbingId }),
      unlock: (id) => ctx.services.get('codex')?.unlock(id),
      registerCodex: (entries) => ctx.services.get('codex')?.register(entries) ?? (() => {}),
      warn: (m) => console.warn(m),
    });
    const offCollection = ctx.services.get('codex')?.register([codexEntry('lore', RUBBINGS_COLLECTION_ID, 'anvil-rubbings')]);
    ctx.services.provide('anvilRubbings', service);
    ctx.events.on('save.loaded', () => service.derive());
    ctx.events.on('flag.changed', ({ key }) => {
      if (key === READABLE_FLAG) service.derive();
    });
    ctx.systems.add({
      id: 'anvil-rubbings.tick',
      dispose: () => offCollection?.(),
    });
  },
};

export default rubbingsPlugin;
