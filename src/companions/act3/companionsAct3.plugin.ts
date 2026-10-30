// Act 3 thread K5 (plans/act3-K5.md): the companions in movement modes, the event barks, the Quenched aura and the M27
// deserter. The area barks and their strings sit with the companion defs (tobb.ts, hrolf.ts, aelfreda.ts).
import type { GamePlugin } from '../../core/plugins';
import type { NpcModelLoader } from '../../npcs/types';
import { GREYFEN_NPC_DEFS } from '../../greyfen/npcDefs';
import { MOVEMENT_MODE_RULES } from '../../movement/types';
import { heightAt } from '../../terrain/heightfield';
import { npcDefenderBodyFactory } from '../../waves/defenders';
import { companionControllers } from '../companions.plugin';
import { DeserterAlly } from './deserter';
import { listenEventBarks } from './eventBarks';
import { QUENCHED_EVERYWHERE_FLAG, QUENCHED_GREYFEN_FLAG, QuenchedAura } from './quenched';
import { COMPANION_ACT3_STRINGS_EN } from './strings.en';
import './types';

let teardown: (() => void) | null = null;

export default {
  id: 'companions-act3',
  dependsOn: ['core', 'companions'],
  setup(ctx) {
    const offs: (() => void)[] = [];
    teardown = () => {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          console.warn('companions-act3: dispose failed', err);
        }
      }
    };
    try {
      ctx.strings.register('en', COMPANION_ACT3_STRINGS_EN);
      // ---- movement modes (v0.7 item 25): hidden while the rule says so, back behind the player when it ends.
      const hideForMode = (mode: keyof typeof MOVEMENT_MODE_RULES) => {
        const hide = MOVEMENT_MODE_RULES[mode]?.companions === 'hidden';
        for (const c of companionControllers()) c.hideForMode(hide);
      };
      offs.push(ctx.events.on('movement.mode', ({ mode }) => hideForMode(mode)));

      // ---- event barks: the trial, the reveal, a ferry stop.
      offs.push(
        listenEventBarks({
          on: (type, fn) => ctx.events.on(type, fn),
          say: (place) => {
            for (const c of companionControllers()) c.sayAt(place);
          },
        }),
      );

      // ---- the Quenched aura (Q13): K5 is the sole owner of the Burn gain slot.
      const aura = new QuenchedAura({
        flag: (k) => ctx.state.getFlag(k),
        setFlag: (k, v) => ctx.state.setFlag(k, v),
        feet: () => ctx.player.feet,
        setBurnGainScale: () => {
          const spells = ctx.services.get('spells');
          return spells && typeof spells.setBurnGainScale === 'function' ? (fn) => spells.setBurnGainScale!(fn) : undefined;
        },
        toast: (textKey) => ctx.events.emit('hud.toast', { textKey }),
      });
      offs.push(() => aura.dispose());
      offs.push(
        ctx.events.on('region.entered', () => aura.onChange()),
        ctx.events.on('flag.changed', ({ key }) => {
          if (key === QUENCHED_GREYFEN_FLAG || key === QUENCHED_EVERYWHERE_FLAG) aura.onChange();
        }),
        ctx.events.on('save.loaded', () => aura.onLoaded()),
      );

      // ---- the M27 deserter (service `act3Allies`).
      const loader = () => {
        const a = ctx.assets as unknown as Partial<NpcModelLoader> | null;
        return a && typeof a.load === 'function' && typeof a.instantiate === 'function' && typeof a.animations === 'function'
          ? (a as NpcModelLoader)
          : null;
      };
      const deserterDef = GREYFEN_NPC_DEFS.find((d) => d.id === 'deserter')!;
      const deserter = new DeserterAlly({
        host: ctx,
        makeBody: () => npcDefenderBodyFactory(loader(), deserterDef)(),
        flag: (k) => ctx.state.getFlag(k),
        anchor: (id) => ctx.anchors.find(id),
        groundAt: (x, z, y) => {
          const h = heightAt(x, z);
          const top = Math.max(y, Number.isFinite(h) ? h : y) + 4;
          const hit = ctx.physics.raycast({ x, y: top, z }, { x: 0, y: -1, z: 0 }, 60, ctx.world.player.controller.collider);
          if (hit) return hit.point.y;
          return Number.isFinite(h) ? h : null;
        },
        warn: (m) => console.warn(m),
      });
      offs.push(() => deserter.dispose());
      offs.push(ctx.services.provide('act3Allies', deserter));

      // Rules phase, like the waves director (the militia tick there too). The aura registers on the first tick once
      // the spells service is up (it may set up after this plugin).
      offs.push(
        ctx.systems.add({
          id: 'companions-act3.tick',
          fixedPhase: 'rules',
          order: 10,
          fixedUpdate: (dt) => {
            aura.ensureRegistered();
            deserter.fixedUpdate(dt);
          },
        }),
      );
      aura.ensureRegistered();
    } catch (err) {
      teardown?.();
      teardown = null;
      throw err;
    }
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
} satisfies GamePlugin;
