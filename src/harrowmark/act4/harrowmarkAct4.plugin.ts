// Plugin `harrowmark-act4` (L2): Harrowmark in Act 4. The ash state and R20's huts (built from flags), and the Act 4 wiring
// that L0's v0.8 hooks take (the kill XP factor, the occupied city). Failing here costs only Act 4's city dressing: the
// `harrowmark` plugin (the city, its gates, the Act 1 to 3 cast) does not depend on it.
import { heightAt } from '../../terrain/heightfield';
import type { CoreContext, GamePlugin } from '../../region/coreTypes';
import { buildAshState } from './ashState';
import { buildR20Huts } from './r20Huts';
import { buildFogWallDef, registerFogWall } from '../../region/fogWall';
import { gateFaceDefs, HARROWMARK_ACT4_XP_FACTOR, HARROWMARK_XP_WHEN } from './occupied';

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
        // Q1: the city's kill XP factor from Act 4's start (L0's conditional factor).
        const xp = ctx.services.get('killXpRegionFactor');
        if (xp) cleanups.push(xp.set('harrowmark', HARROWMARK_ACT4_XP_FACTOR, { when: HARROWMARK_XP_WHEN }));
        else console.warn('harrowmark-act4: no killXpRegionFactor service; Harrowmark kills pay x 1 in Act 4');
        // Q2: the occupied city's faces outside the working gates (closed from story.m38.complete, L0's rules).
        const faces = gateFaceDefs();
        for (const def of faces) {
          cleanups.push(registerFogWall(def));
          if (!rapier) continue;
          const at = ctx.anchors.get(def.anchorId).position;
          const wall = buildFogWallDef({ ...ctx, rapier }, def, { x: at.x, y: at.y, z: at.z }, height);
          cleanups.push(() => wall.dispose());
        }
        cleanups.push(
          ctx.services.provide('harrowmarkAct4', {
            ash: () => ({ active: ash.active, ...ash.counts() }),
            huts: () => huts.look(),
            faces: () => faces.map((f) => f.id),
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
  /** The occupied city's fog faces (registered; built only when physics is up at setup, as in every other plugin). */
  faces(): string[];
}

declare module '../../core/Services' {
  interface GameServices {
    harrowmarkAct4: HarrowmarkAct4Service;
  }
}
