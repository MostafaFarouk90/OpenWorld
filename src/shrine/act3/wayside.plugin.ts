import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../hud/events';
import '../../quests/service';
import { showToast } from '../../waystones/toast';
import { WAYSIDE_STRINGS_EN } from './strings.en';
import { WAYSIDE } from './tuning';
import { WaysideShrines } from './wayside';
import { WaysideVisuals } from './wayside.visuals';

/**
 * The six R17 wayside shrines (K9 PR 1): a candle at each of K4's `dragonspine.wayside.<n>` anchors, lit while R17 is
 * active. Never forge-shrines, never counted in W. K13 may gate the lighting through `waysideShrines.setLightGate`.
 */
const waysidePlugin: GamePlugin = {
  id: 'wayside-shrines',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', WAYSIDE_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const wayside = new WaysideShrines({
      getBool: (k) => ctx.state.getBool(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      questState: (id) => ctx.services.get('quests')?.state(id),
      emitLit: (index) => emit('wayside.lit', { index }),
      warn: (m) => console.warn(m),
    });
    ctx.services.provide('waysideShrines', wayside);

    const visuals = new WaysideVisuals();
    ctx.scene.add(visuals.root);
    const offs: (() => void)[] = [];
    const placed = new Set<number>();
    const warned = new Set<number>();
    const place = () => {
      for (let n = 1; n <= WAYSIDE.count; n++) {
        if (placed.has(n)) continue;
        const a = ctx.anchors.find(WAYSIDE.anchor(n));
        if (!a) {
          if (!warned.has(n)) {
            warned.add(n);
            console.info(`wayside-shrines: waiting for anchor "${WAYSIDE.anchor(n)}"`);
          }
          continue;
        }
        placed.add(n);
        const p = a.position;
        visuals.build(n, p);
        offs.push(
          ctx.interaction.register({
            id: `use:r17-wayside-${n}`,
            kind: 'use',
            position: (out: THREE.Vector3) => out.set(p.x, p.y, p.z),
            radius: WAYSIDE.radius,
            coneDegrees: 360,
            promptKey: 'wayside.prompt',
            enabled: () => wayside.canLight(n),
            onInteract: () => {
              if (wayside.light(n)) showToast(ctx.hud, ctx.strings.t('wayside.lit'));
            },
          }),
        );
      }
    };

    ctx.systems.add({
      id: 'wayside-shrines.tick',
      fixedPhase: 'rules',
      order: 115,
      renderPhase: 'world',
      fixedUpdate() {
        place();
        for (const n of placed) visuals.setLit(n, wayside.lit(n));
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {
        for (const off of offs.splice(0)) off();
        visuals.dispose();
      },
    });
  },
};

export default waysidePlugin;
