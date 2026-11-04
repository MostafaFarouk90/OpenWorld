import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import '../../quests/service';
import '../../waystones/service';
import '../../actors/status';
import { showToast } from '../../waystones/toast';
import { ForgeShrineBinding } from '../forgeShrine';
import { HathrensMere } from './hathrensMere';
import { HathrensMereVisuals } from './hathrensMere.visuals';
import { MERE_STRINGS_EN } from './strings.en';
import { MERE } from './tuning';

/**
 * Hathren's Mere (K9 PR 1, design 7.4): the shrine is the waystone `hathrens-mere`, lit through the shared ForgeShrineBinding
 * (the shipped spells listener charges the Burn). The stone stays dark until M26's nets are cut (or M26 is active), the
 * Mere's rest also puts out ignite, and Hathren's Scale eases up to 3 Scars once. Everything is placed from K3's site anchor,
 * resolved lazily; without it the plugin builds nothing.
 */
const hathrensMerePlugin: GamePlugin = {
  id: 'hathrens-mere',
  dependsOn: ['core', 'waystones', 'shrine'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', MERE_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const waystones = () => ctx.services.get('waystones');
    const lit = () => ctx.state.getBool(ForgeShrineBinding.flag(MERE.id));

    const mere = new HathrensMere({
      getBool: (k) => ctx.state.getBool(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      questState: (id) => ctx.services.get('quests')?.state(id),
      itemCount: (id) => ctx.services.get('inventory')?.count(id) ?? 0,
      canRemoveScars: () => typeof ctx.services.get('spells')?.removeScars === 'function',
      removeScars: (n) => ctx.services.get('spells')?.removeScars?.(n, 'hathren-scale') ?? 0,
      clearIgnite: () => {
        const status = ctx.services.get('status');
        if (!status) return;
        const id = ctx.actors.player.id;
        for (const s of status.list(id)) if (s.kind === 'ignite') status.clear(id, s.id);
      },
      toast: (key, params) => showToast(ctx.hud, ctx.strings.t(key, params)),
    });
    const binding = new ForgeShrineBinding(MERE.id, {
      waystoneLit: () => waystones()?.isLit(MERE.id) ?? false,
      isLit: lit,
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitRekindled: (shrineId) => emit('shrine.rekindled', { shrineId }),
    });
    ctx.events.on('waystone.rekindled', (e) => binding.onRekindled(e.waystoneId));
    ctx.events.on('rest', (e) => {
      if (e.waystoneId) mere.onRest(e.waystoneId);
    });
    ctx.events.on('flag.changed', ({ key }) => {
      if (key === MERE.netsCutFlag || key === MERE.completeFlag || key === ForgeShrineBinding.flag(MERE.id)) mere.deriveOpen();
    });
    ctx.events.on('save.loaded', () => {
      binding.sync();
      mere.deriveOpen();
      mere.checkScale();
    });

    // The quests service may arrive after setup; its change feed re-derives the gate (M26 completed opens the stone).
    let offQuests: (() => void) | null = null;
    // A shrine flag set by a script or the ?act3= jump lights the stone (script rekindle, no Burn, no second announce).
    const syncStone = () => {
      if (lit() && !(waystones()?.isLit(MERE.id) ?? true)) waystones()?.rekindle(MERE.id, 'script');
    };

    // ---- placement, once K3's site anchor exists ---------------------------------------------------
    const visuals = new HathrensMereVisuals();
    ctx.scene.add(visuals.root);
    const offs: (() => void)[] = [];
    let warned = false;
    const place = () => {
      if (visuals.hasSite) return;
      const site = ctx.anchors.find(MERE.siteAnchor);
      if (!site) {
        if (!warned) {
          warned = true;
          console.info(`hathrens-mere: waiting for anchor "${MERE.siteAnchor}"`);
        }
        return;
      }
      const s = site.position;
      if (!ctx.anchors.find(MERE.waystoneAnchor)) {
        offs.push(
          ctx.anchors.define({
            id: MERE.waystoneAnchor,
            position: { x: s.x + MERE.waystoneOffset.x, y: s.y, z: s.z + MERE.waystoneOffset.z },
            yaw: 0,
            tags: ['waystone'],
          }),
        );
      }
      visuals.build(s);
      binding.sync(); // a load that ran before the anchors existed saw the waystone as unlit
    };

    let first = true;
    ctx.systems.add({
      id: 'hathrens-mere.tick',
      fixedPhase: 'rules',
      order: 112,
      renderPhase: 'world',
      fixedUpdate() {
        if (first) {
          first = false;
          binding.sync();
        }
        if (!offQuests) offQuests = ctx.services.get('quests')?.onChange(() => mere.deriveOpen()) ?? null;
        mere.deriveOpen();
        place();
        syncStone();
        mere.checkScale();
        visuals.setLit(lit());
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {
        offQuests?.();
        for (const off of offs.splice(0)) off();
        visuals.dispose();
      },
    });
  },
};

export default hathrensMerePlugin;
