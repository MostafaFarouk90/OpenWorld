// The Greyfen region's setup (the plugin's body), loaded by `greyfen.plugin.ts` with a dynamic import: plugin modules are
// imported eagerly at boot, and the places here are fitted on the shaped ground at import (places.ts). A fit that fails after a
// terrain change then fails this plugin only, never the game's boot.
import type { CoreContext } from '../region/coreTypes';
import type { LayoutData } from '../region/layoutTypes';
import { layoutInterior } from '../interiors/layout';
import { resolveLayout } from '../region/resolveLayout';
import { buildStructures, coreFactories } from '../region/StructureBuilder';
import { BuildingLookup } from '../region/buildingLookup';
import { envModelLibraryFor } from '../env/envStructureArt';
import type * as THREE from 'three';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { ToggleStructure } from '../cinderreach/toggleStructure';
import type { WaterService } from '../water/types';
import { BRIDGE_STRINGS_EN, registerBridges } from './bridges';
import { channelCatch } from './channelCatch';
import { CHAPEL_STRINGS_EN } from './chapelInterior';
import { DEEPS_DEF, DEEPS_STRINGS_EN } from './deepsInterior';
import { createGreyfenArt } from './greyfenArt';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { HUT_STRINGS_EN } from './hutInterior';
import { GREYFEN_NPC_DEFS, GREYFEN_NPC_STRINGS_EN } from './npcDefs';
import { watchChoices } from './readers';
import { registerGreyfenKinds } from './structureKinds';
import { GREYFEN_TOGGLES } from './toggles';
import { greyfenWater } from './water';

export { GREYFEN_LAYOUT };

/** Sets the region up on `ctx`, pushing every undo onto `cleanups` (the plugin tears them down on a failure or dispose). */
export function setupGreyfen(ctx: CoreContext, layout: LayoutData, cleanups: Array<() => void>): void {
  const height = heightAt;
  cleanups.push(registerGreyfenKinds());
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    const errors = validateLayout(layout, height, { spawnId: null });
    if (errors.length) throw new Error(`greyfen: invalid layout:\n${errors.slice(0, 20).join('\n')}`);
  }
  cleanups.push(
    ctx.strings.register('en', { ...GREYFEN_NPC_STRINGS_EN, ...CHAPEL_STRINGS_EN, ...DEEPS_STRINGS_EN, ...HUT_STRINGS_EN, ...BRIDGE_STRINGS_EN }),
  );

  const resolved = resolveLayout(layout, height);
  for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
  for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));

  if (!ctx.physics.rapier) throw new Error('greyfen: physics is not ready');
  const deps = { ...ctx, rapier: ctx.physics.rapier };
  const art = createGreyfenArt(envModelLibraryFor(ctx.assets));
  const structures = buildStructures({ ...deps, ...coreFactories(ctx) }, layout, height, new BuildingLookup(undefined, undefined, art));
  cleanups.push(() => structures.dispose());
  void structures.upgrade();

  // The toggled pieces: shown or hidden by a flag, re-derived on a load through ctx.gates.
  const toggles = GREYFEN_TOGGLES.map((def) => {
    const toggle = new ToggleStructure(deps, def.spec, height);
    cleanups.push(() => toggle.dispose());
    void art(def.spec).then(
      (obj: THREE.Object3D | null) => toggle.setArt(obj),
      () => undefined,
    );
    cleanups.push(ctx.gates.flag(def.flag, (on) => toggle.setVisible(on === def.show)));
    return { def, toggle };
  });

  cleanups.push(watchChoices(ctx));
  cleanups.push(registerBridges(ctx));

  // Water: registered on K7's service as soon as it is there (at setup, on a load, or on a later tick: plugin order is not
  // guaranteed), each volume and route on its own so one refusal costs only itself. Volume sets swap by `activeWhen`, never
  // by re-registering. Keyed on the service instance, so a re-provided service gets everything again. Until then the
  // Deeps' channel catch stands in for the deep push-back.
  const deeps = layoutInterior(DEEPS_DEF, height);
  const water = greyfenWater((d) => (d === DEEPS_DEF ? deeps : layoutInterior(d, height)));
  let bound: { svc: WaterService; undo: Array<() => void>; complete: boolean } | null = null;
  const unbind = () => {
    for (const u of (bound?.undo ?? []).reverse()) {
      try {
        u();
      } catch {
        /* the service may already be gone */
      }
    }
    bound = null;
  };
  const syncWater = (): void => {
    const svc = ctx.services.get('water');
    if (bound && bound.svc === svc) return;
    unbind();
    if (!svc) return;
    const undo: Array<() => void> = [];
    let complete = true;
    const items: Array<[string, () => () => void]> = [
      ...water.volumes.map((v): [string, () => () => void] => [v.id, () => svc.register(v)]),
      ...water.routes.map((r): [string, () => () => void] => [r.id, () => svc.registerRoute(r)]),
    ];
    for (const [id, add] of items) {
      try {
        undo.push(add());
      } catch (err) {
        complete = false;
        console.warn(`greyfen: the water service refused "${id}"`, err);
      }
    }
    bound = { svc, undo, complete };
  };
  syncWater();
  cleanups.push(ctx.systems.add({ id: 'greyfen.water-sync', fixedPhase: 'rules', order: 0, fixedUpdate: syncWater }));
  cleanups.push(ctx.events.on('save.loaded', syncWater));
  cleanups.push(unbind);
  cleanups.push(channelCatch(ctx, deeps));

  // The cast is best effort: a failure here costs the NPCs, not the places.
  try {
    const npcs = ctx.services.get('npcs');
    if (!npcs) throw new Error('the npcs service is missing');
    cleanups.push(npcs.register(layout.npcs, GREYFEN_NPC_DEFS));
  } catch (err) {
    console.warn('greyfen: could not register the Greyfen NPCs', err);
  }

  cleanups.push(
    ctx.services.provide('greyfen', {
      shownToggles: () => toggles.filter((t) => t.toggle.visible).map((t) => t.def.id),
      waterRegistered: () => bound?.complete === true,
    }),
  );
}
