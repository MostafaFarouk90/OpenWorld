import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import { registerItems, getItem } from '../inventory/items';
import '../hud/ports';
import { showToast } from '../waystones/toast';
import { FOX_FIRE, FoxFire } from './foxFire';
import { KINDLING_DELL_STRINGS_EN } from './kindlingDell.strings.en';
import './foxFire.service';

/** A3 owns the hollow: its bed anchor and entry trigger. Nothing happens until both exist. */
export const DELL = {
  bedAnchor: 'cinderreach.dell.bed',
  trigger: 'trg.cinderreach.dell',
  foundFlag: 'world.kindling-dell.found',
  brushGivenFlag: 'world.kindling-dell.brushGiven',
  brushItem: 'kindling-brush',
  radius: 2.2,
  light: { color: 0xffc680, intensity: 1.4, distance: 7, offset: { x: 0.8, y: 2.2, z: 0.3 } },
} as const;

if (!getItem(DELL.brushItem)) {
  registerItems([
    {
      id: DELL.brushItem,
      nameKey: `item.${DELL.brushItem}.name`,
      descKey: `item.${DELL.brushItem}.desc`,
      kind: 'quest',
      stackMax: 1,
    },
  ]);
}

/**
 * The Kindling Dell (design 7.9, A9): the first visit finds the hollow and leaves the Kindling Brush; the warm ash bed
 * grants Fox-Fire (30 min, refreshes, never stacks). Fox-Fire's light is created once and only its intensity moves.
 */
const kindlingDellPlugin: GamePlugin = {
  id: 'kindling-dell',
  dependsOn: ['core', 'inventory'],
  setup(ctx) {
    ctx.strings.register('en', KINDLING_DELL_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const setFlag = (k: string, v: boolean) => {
      if (ctx.state.getBool(k) !== v) ctx.state.setFlag(k, v);
    };
    const fox = new FoxFire({
      setActiveFlag: (on) => setFlag(FOX_FIRE.flag, on),
      emitApplied: (seconds) => emit('buff.applied', { id: FOX_FIRE.buffId, nameKey: FOX_FIRE.nameKey, seconds }),
      emitRemoved: () => emit('buff.removed', { id: FOX_FIRE.buffId }),
    });
    ctx.persist.register({
      key: FoxFire.key,
      version: FoxFire.version,
      serialize: () => fox.serialize(),
      load: (data) => {
        loaded = true;
        fox.load(data);
      },
    });
    let loaded = false;
    ctx.events.on('save.loaded', () => {
      // A save with no entry must not keep the previous session's buff.
      if (!loaded) fox.load(null);
      loaded = false;
      fox.announce();
    });
    ctx.services.provide('foxFire', {
      active: () => fox.active(),
      secondsLeft: () => fox.secondsLeft(),
      radius: FOX_FIRE.radius,
      apply: () => fox.apply(),
    });

    const light = new THREE.PointLight(DELL.light.color, 0, DELL.light.distance);
    ctx.scene.add(light);
    const o = DELL.light.offset;

    let off: (() => void) | null = null;
    const syncBed = () => {
      if (off) return;
      const bed = ctx.anchors.find(DELL.bedAnchor);
      if (!bed) return;
      const p = bed.position;
      off = ctx.interaction.register({
        id: 'use:kindling-bed',
        kind: 'use',
        position: (out: THREE.Vector3) => out.set(p.x, p.y, p.z),
        radius: DELL.radius,
        coneDegrees: 360,
        promptKey: 'kindlingDell.bed.prompt',
        enabled: () => ctx.state.getBool(DELL.foundFlag),
        onInteract: () => {
          fox.apply();
          showToast(ctx.hud, ctx.strings.t('kindlingDell.bed.toast'));
        },
      });
    };

    let first = true;
    ctx.systems.add({
      id: 'kindling-dell.tick',
      fixedPhase: 'rules',
      order: 112,
      fixedUpdate(dt) {
        if (first) {
          first = false;
          setFlag(FOX_FIRE.flag, fox.active());
        }
        syncBed();
        fox.update(dt);
        if (!ctx.state.getBool(DELL.foundFlag) && ctx.triggers.isInside(DELL.trigger)) {
          ctx.state.setFlag(DELL.foundFlag, true);
          emit('discover', { placeId: 'kindling-dell', kind: 'poi' });
          showToast(ctx.hud, ctx.strings.t('kindlingDell.found'));
        }
        // The brush is granted once; the flag, not the item count, stops a regrant after a drop.
        if (ctx.state.getBool(DELL.foundFlag) && !ctx.state.getBool(DELL.brushGivenFlag)) {
          const inv = ctx.services.get('inventory');
          if (inv && (inv.count(DELL.brushItem) > 0 || inv.add(DELL.brushItem, 1) > 0)) {
            ctx.state.setFlag(DELL.brushGivenFlag, true);
            showToast(ctx.hud, ctx.strings.t('kindlingDell.brush'));
          }
        }
        // Follow light: always in the scene, off means intensity 0.
        const f = ctx.player.feet;
        light.position.set(f.x + o.x, f.y + o.y, f.z + o.z);
        light.intensity = fox.active() ? DELL.light.intensity : 0;
      },
      dispose() {
        off?.();
        light.removeFromParent();
        light.dispose();
      },
    });
  },
};

export default kindlingDellPlugin;
