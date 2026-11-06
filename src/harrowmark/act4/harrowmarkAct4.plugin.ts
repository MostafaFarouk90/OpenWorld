// Plugin `harrowmark-act4` (L2): Harrowmark in Act 4. The ash state and R20's huts (built from flags), and the Act 4 wiring
// that L0's v0.8 hooks take (the kill XP factor, the occupied city). Failing here costs only Act 4's city dressing: the
// `harrowmark` plugin (the city, its gates, the Act 1 to 3 cast) does not depend on it.
import { heightAt } from '../../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../../region/coreTypes';
import { buildAshState } from './ashState';
import { buildR20Huts } from './r20Huts';

export interface HarrowmarkAct4Options {
  heightAt?: (x: number, z: number) => number;
}

export function createHarrowmarkAct4Plugin(opts: HarrowmarkAct4Options = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const cleanups: (() => void)[] = [];
  const teardown = () => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('harrowmark-act4: teardown step failed', err);
      }
    }
  };
  return {
    id: 'harrowmark-act4',
    dependsOn: ['core', 'harrowmark'],
    setup(ctx: CoreContext) {
      try {
        const rapier = ctx.physics.rapier ?? null;
        const ash = buildAshState(ctx, rapier, height);
        cleanups.push(() => ash.dispose());
        const huts = buildR20Huts(ctx, rapier, height);
        cleanups.push(() => huts.dispose());
        cleanups.push(
          ctx.services.provide('harrowmarkAct4', {
            ash: () => ({ active: ash.active, ...ash.counts() }),
            huts: () => huts.look(),
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

export default createHarrowmarkAct4Plugin();

/** Published as the 'harrowmarkAct4' service (debug, tests, the real-game check). */
export interface HarrowmarkAct4Service {
  ash(): { active: boolean; checkpoints: number; rails: number; posters: number; soot: number };
  huts(): import('./r20Huts').HutLook;
}

declare module '../../core/Services' {
  interface GameServices {
    harrowmarkAct4: HarrowmarkAct4Service;
  }
}
