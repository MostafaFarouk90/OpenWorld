import { QUALITY } from '../vfx/tuning';
import type { GamePlugin, PluginContext, PostPass } from '../vfx/ports';
import { QualityManager } from './QualityManager';
import { FrameProbe, Governor } from './FrameProbe';
import { BloomPostPass } from './BloomPass';
import type { QualityService } from './types';

const SYSTEM_ID = 'quality.frame';

let current: { governor: Governor | null } | null = null;
/** Accepts the governor's pending raise offer (for a settings toast or button). */
export function acceptQualityRaise(): boolean {
  return current?.governor?.acceptRaise() ?? false;
}

let teardown: (() => void) | null = null;

const plugin = {
  id: 'quality',
  dependsOn: ['core'],
  setup(ctx: PluginContext) {
    teardown?.();
    const graphics = ctx.services.get('graphics') ?? null;
    let storage: Pick<Storage, 'getItem' | 'setItem'> | null = null;
    try {
      storage = globalThis.localStorage ?? null;
    } catch {
      storage = null;
    }
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    const quality = new QualityManager({ storage, graphics, search });
    const probe = new FrameProbe({ quality });
    const governor = new Governor({ quality, onOfferRaise: (s) => console.info(`[quality] stable: offering raise to ${s}`) });
    current = { governor };

    let pass: BloomPostPass | null = null;
    const syncBloom = (): void => {
      const want = QUALITY[quality.step].bloom;
      if (!want) {
        if (pass) {
          graphics?.setPostPass(null);
          pass.dispose();
          pass = null;
        }
        return;
      }
      const renderer = graphics?.renderer;
      if (pass || !graphics || !renderer || !ctx.camera) return;
      pass = new BloomPostPass(renderer, ctx.scene, ctx.camera);
      graphics.setPostPass(pass as PostPass);
    };

    // The vfx plugin sets up after this one, reads `quality.step` and subscribes to it itself.
    const unsub = quality.subscribe(() => syncBloom());

    quality.applyToGraphics();
    syncBloom();

    const service: QualityService = {
      get step() {
        return quality.step;
      },
      setStep(step) {
        quality.set(step, 'user');
      },
      subscribe: (fn) => quality.subscribe(fn),
    };
    const unprovide = ctx.services.provide('quality', service);

    let frames = 0;
    let seconds = 0;
    const removeSystem = ctx.systems.add({
      id: SYSTEM_ID,
      renderPhase: 'hud',
      order: 150,
      render(_alpha, frameTime) {
        frames++;
        syncBloom();
        // The probe starts after the first frame the loop runs.
        if (frames <= 1) return;
        // The render system receives seconds; the probe and governor work in milliseconds.
        const ms = frameTime * 1000;
        if (Number.isFinite(frameTime) && frameTime > 0) seconds += frameTime;
        if (!probe.done) probe.sample(ms);
        else governor.sample(ms, seconds);
      },
    });

    teardown = () => {
      removeSystem();
      unprovide();
      unsub();
      if (pass) {
        graphics?.setPostPass(null);
        pass.dispose();
        pass = null;
      }
      if (current?.governor === governor) current = null;
      teardown = null;
    };
  },
  dispose() {
    teardown?.();
  },
} satisfies GamePlugin;

export default plugin;
