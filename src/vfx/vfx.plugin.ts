import { heightAt as terrainHeightAt } from '../terrain/heightfield';
import { HitFeedback } from './HitFeedback';
import type { AvatarLike, GamePlugin, PluginContext } from './ports';
import { VfxServiceImpl } from './VfxServiceImpl';

let active: VfxServiceImpl | null = null;
let offQualityActive: (() => void) | null = null;
const plugin = {
  id: 'vfx',
  dependsOn: ['core'],
  setup(ctx: PluginContext) {
    active?.dispose();
    const ground = terrainHeightAt;
    const vfx = new VfxServiceImpl({
      scene: ctx.scene,
      heightAt: ground,
      actorRoot: (id) => ctx.actors.get(id)?.root ?? null,
    });
    active = vfx;
    const feedback = new HitFeedback({ vfx, clock: ctx.clock, actors: ctx.actors, ground });
    let boundAvatar: AvatarLike | null = null;

    // The quality service sets up first: take its step now and follow it, and route setQuality through it.
    let offQuality: (() => void) | null = null;
    const quality = ctx.services.get('quality');
    if (quality) {
      vfx.applyQuality(quality.step);
      offQuality = quality.subscribe((q) => vfx.applyQuality(q));
      vfx.qualityDelegate = (q) => quality.setStep(q);
    }

    offQualityActive = offQuality;
    ctx.services.provide('vfx', vfx);
    if (vfx.screen.element) ctx.hud.mount('overlay', { id: 'vfx-vignette', element: vfx.screen.element, order: 900 });

    ctx.events.on('damage.dealt', (r) => feedback.onDamage(r));
    ctx.events.on('attack.window', (e) => vfx.trailDriver.onWindow(e));
    ctx.events.on('telegraph', (e) => vfx.telegraph(e.actorId, e.kind, e.leadSeconds));
    ctx.events.on('telegraph.cancelled', (e) => vfx.cancelTelegraph(e.actorId));
    ctx.events.on('actor.despawned', (e) => vfx.forgetActor(e.actorId));
    ctx.events.on('burn.changed', (e) => vfx.screen.setBurn(e.value));
    ctx.events.on('waystone.rekindled', (e) => {
      if (e.cause !== 'player' && e.cause !== 'script') return;
      const f = ctx.player.feet;
      vfx.spawnEffect('waystone-rekindle', { position: { x: f.x, y: f.y, z: f.z } });
    });

    ctx.systems.add({
      id: 'vfx-trails',
      fixedPhase: 'afterCombat',
      order: 100,
      fixedUpdate() {
        const avatar = ctx.player.avatar;
        if (avatar !== boundAvatar) {
          // A respawn or reload replaces the avatar: rebind so the ribbon samples the live markers.
          if (boundAvatar) vfx.trailDriver.detach(ctx.player.actor.id);
          if (avatar) vfx.trailDriver.attachPlayer(ctx.player.actor.id, avatar);
          boundAvatar = avatar;
        }
        vfx.trailDriver.tick(vfx.clock.now);
      },
    });
    ctx.systems.add({
      id: 'vfx-restore',
      renderPhase: 'world',
      order: 100,
      render() {
        vfx.camera.restore(ctx.camera);
      },
    });
    let cameraDt = 0;
    ctx.systems.add({
      id: 'vfx-update',
      renderPhase: 'world',
      order: 101,
      render(_alpha, frameTime) {
        // Effects and trails freeze with the sim; the vignette and shake keep running through hit-stop, not a pause.
        vfx.update(frameTime, ctx.clock.frozen);
        cameraDt = ctx.clock.paused ? 0 : Math.min(Math.max(frameTime, 0), 0.1);
        vfx.screen.update(cameraDt);
      },
    });
    ctx.systems.add({
      id: 'vfx-camera',
      renderPhase: 'afterCamera',
      order: -50,
      render() {
        vfx.camera.apply(ctx.camera, cameraDt);
      },
    });
  },
  dispose() {
    offQualityActive?.();
    offQualityActive = null;
    active?.dispose();
    active = null;
  },
} satisfies GamePlugin;

export default plugin;
