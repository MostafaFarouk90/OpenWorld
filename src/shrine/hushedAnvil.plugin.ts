import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import { codexEntry } from '../codex/entries';
import '../codex/service';
import '../hud/events';
import '../waystones/service';
import { showToast } from '../waystones/toast';
import { ForgeShrineBinding } from './forgeShrine';
import { HUSHED_ANVIL as H, muralCodexId, muralFlag } from './hushedAnvil.tuning';
import { HUSHED_ANVIL_STRINGS_EN } from './hushedAnvil.strings.en';
import { HushedAnvilVisuals } from './hushedAnvil.visuals';
import type { TemperStationService } from './temperStation';
import './temperStation';

/**
 * The Hushed Anvil (design 7.3, Act 2 A9): rekindle through the shipped waystone, three readable murals and the
 * tempering station A10 plugs into. Everything is placed relative to A3's site anchor, resolved lazily; without it the
 * plugin does nothing.
 */
const hushedAnvilPlugin: GamePlugin = {
  id: 'hushed-anvil',
  dependsOn: ['core', 'waystones', 'shrine', 'codex'],
  setup(ctx) {
    ctx.strings.register('en', HUSHED_ANVIL_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const waystones = () => ctx.services.get('waystones');
    const lit = () => ctx.state.getBool(ForgeShrineBinding.flag(H.id));
    let warned = false;

    const binding = new ForgeShrineBinding(H.id, {
      waystoneLit: () => waystones()?.isLit(H.id) ?? false,
      isLit: lit,
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitRekindled: (shrineId) => emit('shrine.rekindled', { shrineId }),
    });
    ctx.events.on('waystone.rekindled', (e) => binding.onRekindled(e.waystoneId));
    // A silent sync that lights the shrine must wake the quests: the quests plugin rechecked before it, and the flag raises no event.
    const syncAndRecheck = (): void => {
      if (binding.sync()) ctx.services.get('quests')?.recheck?.();
    };
    ctx.events.on('save.loaded', syncAndRecheck);

    const codex = ctx.services.get('codex');
    const offCodex = codex?.register([1, 2, 3].map((n) => codexEntry('lore', muralCodexId(n), `hushed-anvil-mural-${n}`)));

    // ---- the tempering station service (A10 sets the handler) -------------------------------------
    let handler: ((stationId: string) => void) | null = null;
    const station: TemperStationService = {
      stations: () => [{ id: H.id, usable: lit() }],
      setHandler(fn) {
        handler = fn;
        return () => {
          if (handler === fn) handler = null;
        };
      },
    };
    ctx.services.provide('temperStation', station);
    const useStation = () => {
      if (!lit()) return showToast(ctx.hud, ctx.strings.t('hushedAnvil.station.dark'));
      if (!handler) return showToast(ctx.hud, ctx.strings.t('hushedAnvil.station.idle'));
      try {
        handler(H.id);
      } catch (err) {
        console.warn('hushed-anvil: tempering handler failed', err);
      }
    };

    // ---- placement, once A3's site anchor exists --------------------------------------------------
    const visuals = new HushedAnvilVisuals();
    ctx.scene.add(visuals.root);
    const offs: (() => void)[] = [];
    let placed = false;
    const place = () => {
      if (placed) return;
      const site = ctx.anchors.find(H.siteAnchor);
      if (!site) {
        if (!warned && ctx.services.get('waystones')) {
          warned = true;
          console.info(`hushed-anvil: waiting for anchor "${H.siteAnchor}"`);
        }
        return;
      }
      placed = true;
      const s = site.position;
      const at = (o: { x: number; z: number }) => ({ x: s.x + o.x, y: s.y, z: s.z + o.z });
      if (!ctx.anchors.find(H.waystoneAnchor)) {
        offs.push(ctx.anchors.define({ id: H.waystoneAnchor, position: at(H.waystoneOffset), yaw: 0, tags: ['waystone'] }));
      }
      const stationPos = at(H.stationOffset);
      const murals = H.muralOffsets.map(at);
      visuals.build(s, stationPos, murals);
      // A load that ran before the anchors existed saw the waystone as unlit.
      syncAndRecheck();
      offs.push(
        ctx.interaction.register({
          id: 'use:hushed-anvil-station',
          kind: 'use',
          position: (out: THREE.Vector3) => out.set(stationPos.x, stationPos.y, stationPos.z),
          radius: H.radius,
          coneDegrees: 360,
          promptKey: 'hushedAnvil.station.prompt',
          onInteract: useStation,
        }),
      );
      murals.forEach((m, i) => {
        const n = i + 1;
        offs.push(
          ctx.interaction.register({
            id: `use:hushed-anvil-mural-${n}`,
            kind: 'use',
            position: (out: THREE.Vector3) => out.set(m.x, m.y, m.z),
            radius: H.radius,
            coneDegrees: 360,
            promptKey: 'hushedAnvil.mural.prompt',
            onInteract: () => {
              showToast(ctx.hud, ctx.strings.t(`hushedAnvil.mural.${n}`));
              ctx.state.setFlag(muralFlag(n), true);
              ctx.services.get('codex')?.unlock(muralCodexId(n));
            },
          }),
        );
      });
    };

    let first = true;
    ctx.systems.add({
      id: 'hushed-anvil.tick',
      fixedPhase: 'rules',
      order: 111,
      renderPhase: 'world',
      fixedUpdate() {
        if (first) {
          first = false;
          syncAndRecheck();
        }
        place();
        visuals.setLit(lit());
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {
        for (const off of offs.splice(0)) off();
        offCodex?.();
        visuals.dispose();
      },
    });
  },
};

export default hushedAnvilPlugin;
