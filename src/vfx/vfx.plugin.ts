import { HitFeedback } from './HitFeedback';
import type { GamePlugin, PluginContext } from './ports';
import { VfxServiceImpl } from './VfxServiceImpl';

/** True while the whole game is paused (not merely in hit-stop). */
function paused(ctx: PluginContext): boolean {
  return ctx.clock.frozen === true && !((ctx.clock.hitStopRemaining ?? 0) > 0);
}

let active: VfxServiceImpl | null = null;

const plugin = {
  id: 'vfx',
  dependsOn: ['core', 'quality'],
  setup(ctx: PluginContext) {
    const vfx = new VfxServiceImpl({
      scene: ctx.scene,
      heightAt: ctx.heightAt,
      actorRoot: (id) => ctx.actors.get(id)?.root ?? null,
    });
    active = vfx;
    const feedback = new HitFeedback({ vfx, clock: ctx.clock, actors: ctx.actors });
    let playerBound = false;

    ctx.services.provide('vfx', vfx);
    if (vfx.screen.element) ctx.hud.mount('center', { id: 'vfx-vignette', element: vfx.screen.element, order: 900 });

    ctx.events.on('damage.dealt', (r) => feedback.onDamage(r));
    ctx.events.on('attack.window', (e) => vfx.trailDriver.onWindow(e));
    ctx.events.on('telegraph', (e) => vfx.telegraph(e.actorId, e.kind, e.leadSeconds));
    ctx.events.on('actor.despawned', (e) => vfx.trailDriver.detach(e.actorId));
    ctx.events.on('burn.changed', (e) => vfx.screen.setBurn(e.value));
    ctx.events.on('waystone.rekindled', (e) => {
      if (e.cause === 'load') return;
      const f = ctx.player.feet;
      vfx.spawnEffect('waystone-rekindle', { position: { x: f.x, y: f.y, z: f.z } });
    });

    ctx.systems.add({
      id: 'vfx-trails',
      fixedPhase: 'afterCombat',
      order: 100,
      fixedUpdate() {
        const avatar = ctx.player.avatar;
        if (avatar && !playerBound) {
          vfx.trailDriver.attachPlayer(ctx.player.actor.id, avatar);
          playerBound = true;
        } else if (!avatar && playerBound) {
          vfx.trailDriver.detach(ctx.player.actor.id);
          playerBound = false;
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
    ctx.systems.add({
      id: 'vfx-update',
      renderPhase: 'world',
      order: 101,
      render(_alpha, frameTime) {
        vfx.update(frameTime, ctx.clock.frozen === true);
        // The vignette and camera shake keep running through hit-stop, but not through a pause.
        const dt = paused(ctx) ? 0 : Math.min(Math.max(frameTime, 0), 0.1);
        vfx.screen.update(dt);
        pendingCameraDt = dt;
      },
    });
    let pendingCameraDt = 0;
    ctx.systems.add({
      id: 'vfx-camera',
      renderPhase: 'afterCamera',
      order: -50,
      render() {
        vfx.camera.apply(ctx.camera, pendingCameraDt);
      },
    });

  },
  dispose() {
    active?.dispose();
    active = null;
  },
} satisfies GamePlugin;

export default plugin;
