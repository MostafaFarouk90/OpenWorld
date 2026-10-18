// Plugin `crowds` (slice 2 thread 17b): ambient townsfolk on Harrowmark's lanes and in idle groups. Not actors: nothing
// can target, hit or perceive them, and they never touch physics. Failing here costs only the crowd, never the city.
//
// Lifetime: the meshes (about 100 KB) stay in the scene for the whole session and are hidden while the crowd sleeps
// (player inside an interior, or far from every lane); there is no region-exit disposal. `dispose` removes the system,
// the service, the gate watchers and the save listener, and frees both instanced meshes, their geometry and materials.
import type { CoreContext, GamePlugin } from '../region/coreTypes';
import { CROWD_LANES, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { watchSouthGate, type GateState } from '../harrowmark/gate';
import { heightAt } from '../terrain/heightfield';
import type { QualityStep } from '../vfx/tuning';
import { CROWD_CLUSTERS, resolveClusters, type ClusterSpec } from './clusters';
import { CrowdSim, type PlayerPos } from './CrowdSim';
import { CrowdView } from './CrowdView';
import { densityFor, type Density } from './density';
import { anchorObstacles, buildLane, structureObstacles, type Lane } from './lanes';
import type { CrowdLane } from '../harrowmark/harrowmark.layout';
import type { StructureSpec } from '../region/layoutTypes';
import type { CrowdStats, CrowdsService } from './types';
import './types';

export interface CrowdsPluginOptions {
  lanes?: CrowdLane[];
  structures?: readonly StructureSpec[];
  clusters?: ClusterSpec[];
  heightAt?: (x: number, z: number) => number;
  seed?: number;
  now?: () => number;
}

/** Services from threads that may not have merged (stealth and chase are thread 18's, PR #47): read loosely, per frame. */
type LooseServices = { get(name: string): unknown };
interface ActiveReader {
  active?(): boolean;
}

/** Render `world` band 0..99 is enemies and NPCs; the crowd runs its whole frame there (no fixed-step system). */
export const CROWDS_RENDER_ORDER = 40;
/** Longest frame the crowd simulates in one step (a hitch never teleports a walker across a keep-out). */
const MAX_DT = 0.1;

export function createCrowdsPlugin(opts: CrowdsPluginOptions = {}): GamePlugin {
  const cleanups: Array<() => void> = [];
  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('crowds: teardown step failed', err);
      }
    }
  };

  return {
    id: 'crowds',
    dependsOn: ['core', 'region', 'harrowmark'],
    setup(ctx: CoreContext) {
      try {
        const height = opts.heightAt ?? heightAt;
        const now = opts.now ?? (() => performance.now());
        const find = (tag: string) => ctx.anchors.withTag(tag);
        const findAnchor = (id: string) => ctx.anchors.find(id);
        const obstacles = [...anchorObstacles(find), ...structureObstacles(opts.structures ?? HARROWMARK_LAYOUT.structures)];
        const lanes: Lane[] = (opts.lanes ?? CROWD_LANES).map((def) => buildLane(def, findAnchor, obstacles, height));
        for (const l of lanes) {
          if (l.blocked.length) console.warn(`crowds: lane ${l.id} has no clear path at ${l.blocked.length} samples (from ${l.blocked[0]} m); it carries no walkers until thread 17 moves it`);
        }
        const clusters = resolveClusters(opts.clusters ?? CROWD_CLUSTERS, findAnchor, height);
        const sim = new CrowdSim({ lanes, clusters, seed: opts.seed });
        const view = new CrowdView(sim.capacity + sim.idle.length);
        view.group.visible = false;
        ctx.scene.add(view.group);
        cleanups.push(() => view.dispose());

        const services = ctx.services as unknown as LooseServices;
        const isActive = (name: string): boolean => {
          const s = services.get(name) as ActiveReader | undefined;
          try {
            return typeof s?.active === 'function' ? !!s.active() : false;
          } catch {
            return false;
          }
        };
        let gate: GateState = 'closed';
        let enabled = true;
        let asleep = true;
        let compiled = false;
        let reseedPending = true;
        let time = 0;
        let msFrame = 0;
        let msFrameAvg = 0;
        let lastKey = '';
        const player = { x: 0, y: 0, z: 0 };

        const readPlayer = (): PlayerPos | null => {
          const f = ctx.player?.feet;
          if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.z)) return null;
          player.x = f.x;
          player.y = Number.isFinite(f.y) ? f.y : 0;
          player.z = f.z;
          return player;
        };
        const currentDensity = (): Density => {
          const quality = ((services.get('quality') as { step?: QualityStep } | undefined)?.step ?? 'high') as QualityStep;
          return densityFor({ gate, stealthActive: isActive('stealth'), chaseActive: isActive('chase'), quality });
        };
        const applyDensity = (): void => {
          const d = currentDensity();
          const key = `${d.scale}|${d.guarded}|${d.lod0Range}`;
          if (key === lastKey) return;
          lastKey = key;
          sim.setDensity(d);
          view.lod0Range = d.lod0Range;
        };

        // Thread 6's M06 flags through ctx.gates (the same derivation and init guard as the South Gate).
        const gateWatch = watchSouthGate(ctx.gates, (s) => {
          gate = s;
          applyDensity();
        });
        cleanups.push(() => gateWatch.dispose());
        cleanups.push(
          ctx.events.on('save.loaded', () => {
            reseedPending = true;
          }),
        );

        const frame = (frameTime: number): void => {
          const t0 = now();
          const p = readPlayer();
          const interiors = services.get('interiors') as { current?: string | null; transitioning?: boolean } | undefined;
          const sleep = !enabled || !!interiors?.current || !!interiors?.transitioning || sim.farFrom(p);
          if (sleep) {
            if (!asleep) view.group.visible = false;
            asleep = true;
            msFrame = 0;
            return;
          }
          applyDensity();
          if (reseedPending) {
            reseedPending = false;
            sim.reseed(p);
          } else if (asleep) {
            sim.clearPlayer(p);
          }
          if (asleep) {
            asleep = false;
            view.group.visible = true;
            if (!compiled) {
              compiled = true;
              const renderer = (services.get('graphics') as { renderer?: { compile?: (s: unknown, c: unknown) => unknown } } | undefined)?.renderer;
              try {
                if (renderer?.compile && ctx.camera) renderer.compile(ctx.scene, ctx.camera);
              } catch (err) {
                console.warn('crowds: shader warm-up failed', err);
              }
            }
          }
          const dt = Math.min(Math.max(frameTime, 0), MAX_DT);
          if (!ctx.clock?.frozen) {
            time += dt;
            sim.update(dt, p);
          }
          const cam = ctx.camera?.position;
          view.write(sim, cam ?? p ?? player, time);
          msFrame = now() - t0;
          msFrameAvg += (msFrame - msFrameAvg) / 120;
        };

        cleanups.push(
          ctx.systems.add({
            id: 'crowds',
            renderPhase: 'world',
            order: CROWDS_RENDER_ORDER,
            render: (_alpha, frameTime) => frame(frameTime),
          }),
        );

        const stats = (): CrowdStats => ({
          walkers: sim.walkers.reduce((n, w) => n + (w.active ? 1 : 0), 0),
          idle: sim.idle.reduce((n, m) => n + (m.active ? 1 : 0), 0),
          drawn: { lod0: asleep ? 0 : view.stats.lod0, lod1: asleep ? 0 : view.stats.lod1 },
          drawCalls: asleep ? 0 : view.drawCalls,
          asleep,
          enabled,
          msFrame,
          msFrameAvg,
        });
        const service: CrowdsService & { sim: CrowdSim; view: CrowdView } = {
          stats,
          density: () => sim.currentDensity,
          setEnabled(on) {
            enabled = on;
          },
          sim,
          view,
        };
        cleanups.push(ctx.services.provide('crowds', service));
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createCrowdsPlugin();
