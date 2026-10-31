import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../quests/service';
import '../../waystones/service';
import { ForgeShrineBinding } from '../forgeShrine';
import { WyrmsHearth } from './wyrmsHearth';
import { WyrmsHearthVisuals } from './wyrmsHearth.visuals';
import { WYRMS_HEARTH as H } from './tuning';

/**
 * The Wyrm's Hearth (K9 PR 2): the shrine is the waystone `wyrms-hearth`, lit through the shared ForgeShrineBinding (the
 * shipped spells listener charges the Burn). The stone stays dark until M34 is active (or done, or the shrine is lit).
 * The slag nest is placed from K4's site anchor, resolved lazily; without it the plugin builds nothing.
 */
const wyrmsHearthPlugin: GamePlugin = {
  id: 'wyrms-hearth',
  dependsOn: ['core', 'waystones', 'shrine'],
  setup(ctx: GameContext) {
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const waystones = () => ctx.services.get('waystones');
    const lit = () => ctx.state.getBool(ForgeShrineBinding.flag(H.id));

    const hearth = new WyrmsHearth({
      getBool: (k) => ctx.state.getBool(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      questState: (id) => ctx.services.get('quests')?.state(id),
    });
    const binding = new ForgeShrineBinding(H.id, {
      waystoneLit: () => waystones()?.isLit(H.id) ?? false,
      isLit: lit,
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitRekindled: (shrineId) => emit('shrine.rekindled', { shrineId }),
    });
    ctx.events.on('waystone.rekindled', (e) => binding.onRekindled(e.waystoneId));
    ctx.events.on('flag.changed', ({ key }) => {
      if (key === H.completeFlag || key === ForgeShrineBinding.flag(H.id)) hearth.deriveOpen();
    });
    ctx.events.on('save.loaded', () => {
      binding.sync();
      hearth.deriveOpen();
    });

    // The quests service may arrive after setup; its change feed re-derives the gate.
    let offQuests: (() => void) | null = null;
    // A shrine flag set by a script or the ?act3= jump lights the stone (script rekindle, no Burn, no second announce).
    const syncStone = () => {
      if (lit() && !(waystones()?.isLit(H.id) ?? true)) waystones()?.rekindle(H.id, 'script');
    };

    // ---- placement, once K4's site anchor exists ---------------------------------------------------
    const visuals = new WyrmsHearthVisuals();
    ctx.scene.add(visuals.root);
    const offs: (() => void)[] = [];
    let warned = false;
    const place = () => {
      if (visuals.hasSite) return;
      const site = ctx.anchors.find(H.siteAnchor);
      if (!site) {
        if (!warned) {
          warned = true;
          console.info(`wyrms-hearth: waiting for anchor "${H.siteAnchor}"`);
        }
        return;
      }
      const s = site.position;
      if (!ctx.anchors.find(H.waystoneAnchor)) {
        offs.push(
          ctx.anchors.define({
            id: H.waystoneAnchor,
            position: { x: s.x + H.waystoneOffset.x, y: s.y, z: s.z + H.waystoneOffset.z },
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
      id: 'wyrms-hearth.tick',
      fixedPhase: 'rules',
      order: 116,
      renderPhase: 'world',
      fixedUpdate() {
        if (first) {
          first = false;
          binding.sync();
        }
        if (!offQuests) offQuests = ctx.services.get('quests')?.onChange(() => hearth.deriveOpen()) ?? null;
        hearth.deriveOpen();
        place();
        syncStone();
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

export default wyrmsHearthPlugin;
