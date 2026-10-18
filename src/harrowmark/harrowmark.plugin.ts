// Plugin `harrowmark`: the greybox city inside the ring wall. Anchors, triggers, walls and districts, the South Gate's
// portcullis, the Harrowmark cast (through `npcs.register`) and the mini-ending world change. Failing here costs only
// this city: the region and npcs plugins do not depend on it.
import { heightAt } from '../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { resolveLayout } from '../region/resolveLayout';
import { buildCity } from './cityBuild';
import { watchSouthGate } from './gate';
import { DOORS, HARROWMARK_LAYOUT, INSIDE_HOMES } from './harrowmark.layout';
import { HARROWMARK_NPC_DEFS, HARROWMARK_NPC_STRINGS_EN } from './npcDefs';
import './types';
import { validateCity } from './validateCity';
import { buildWorldChange } from './worldChange';

export interface HarrowmarkPluginOptions {
  layout?: typeof HARROWMARK_LAYOUT;
  heightAt?: (x: number, z: number) => number;
}

export function createHarrowmarkPlugin(opts: HarrowmarkPluginOptions = {}): GamePlugin {
  const layout = opts.layout ?? HARROWMARK_LAYOUT;
  const height = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('harrowmark: teardown step failed', err);
      }
    }
  };

  return {
    id: 'harrowmark',
    // `interiors`: the inside home posts (npc-post.aldith.inside, ...) exist only once its plugin has set up.
    dependsOn: ['core', 'region', 'npcs', 'interiors'],
    setup(ctx: CoreContext) {
      try {
        if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
          const errors = validateCity(layout, { doors: DOORS });
          if (errors.length) throw new Error(`harrowmark: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
        }
        cleanups.push(ctx.strings.register('en', HARROWMARK_NPC_STRINGS_EN));

        const resolved = resolveLayout(layout, height);
        for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
        for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

        if (!ctx.physics.rapier) throw new Error('harrowmark: physics is not ready');
        const city = buildCity({ ...ctx, rapier: ctx.physics.rapier }, layout.structures, height);
        cleanups.push(() => city.dispose());

        const gate = watchSouthGate(ctx.gates, (state) => city.setPortcullis(state === 'closed'));
        cleanups.push(() => gate.dispose());

        const change = buildWorldChange(ctx);
        cleanups.push(() => change.dispose());

        // The cast is best effort: a failure here (a missing home anchor) costs the NPCs, not the city.
        try {
          const npcs = ctx.services.get('npcs');
          if (!npcs) throw new Error('the npcs service is missing');
          const specs = layout.npcs.map((n) => {
            const inside = INSIDE_HOMES[n.id];
            return inside && ctx.anchors.find(inside) ? { ...n, post: inside } : n;
          });
          cleanups.push(npcs.register(specs, HARROWMARK_NPC_DEFS));
        } catch (err) {
          console.warn('harrowmark: could not register the Harrowmark NPCs', err);
        }

        cleanups.push(
          ctx.services.provide('harrowmark', {
            southGate: { state: gate.state, override: gate.override },
            drawCalls: () => city.drawCalls,
            worldChange: () => ({ active: change.active, ...change.counts() }),
          }),
        );
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createHarrowmarkPlugin();
