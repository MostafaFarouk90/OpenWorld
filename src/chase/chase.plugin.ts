import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { objectivesDone, questLive } from '../stealth/liveness';
import { ChaseDirector, type ChaseTimer } from './ChaseDirector';
import { M10_AFTER_CATCH, M10_CHASE, MIN_CLASS_STAMINA } from './chases';
import { routeFromAnchors, validateRoute } from './route';
import { timerFor } from './solvability';
import { teleporter } from '../stealth/teleporter';
import { CHASE_STRINGS_EN } from './strings.en';
import { loadCourierBody, type CourierBody } from './courierBody';
import type { NpcModelLoader } from '../npcs/types';

/** The `chase` service (game-events-and-flags.md section 6, plus thread 8's timer reader). */
export interface ChaseService {
  active(): boolean;
  /** Polled per frame by the HUD; null when no chase runs. */
  timer(): ChaseTimer | null;
}

declare module '../core/Services' {
  interface GameServices {
    chase: ChaseService;
  }
}

/** The courier's figure: a brown capsule until the hooded Rogue loads (and for good if it cannot). Null headless. */
function courierFigure(ctx: GameContext): THREE.Object3D | null {
  if (!ctx.camera) return null;
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2e }));
  mesh.name = 'npc:courier';
  mesh.position.y = 0.88;
  const root = new THREE.Group();
  root.add(mesh);
  root.visible = false;
  ctx.scene.add(root);
  return root;
}

let cleanup: (() => void) | null = null;
/** The live director, for the test-only helpers in `testing/headless.ts`. */
let current: ChaseDirector | null = null;

/** Test-only: catch the courier now (normal `chase.caught`, hold released). False unless a chase is running. */
export function catchCourierForTest(): boolean {
  return current?.catchNow() ?? false;
}

/** Slice 2 thread 18: the M10 courier chase (plans/slice-2-stealth-chase.md section 7). */
export default {
  id: 'chase',
  dependsOn: ['core'],
  setup(ctx) {
    const offs: (() => void)[] = [];
    cleanup = () => {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          console.warn('chase: cleanup failed', err);
        }
      }
    };
    try {
      ctx.strings.register('en', CHASE_STRINGS_EN);
      const quests = () => ctx.services.get('quests');
      let director: ChaseDirector | null = null;
      let routeKey = '';
      offs.push(() => (director?.dispose(), (current = null)));

      /** Builds the director once the route anchors exist (and again if they change); the timer comes from the par time. */
      let sinceCheck = Infinity;
      const ensure = (force = false): ChaseDirector | null => {
        // The route is re-read about once a second (anchors appear when a layout loads), never per tick.
        if (!force && sinceCheck < 60) {
          sinceCheck++;
          return director;
        }
        sinceCheck = 0;
        const nodes = routeFromAnchors((id) => ctx.anchors.find(id), M10_CHASE.routePrefix);
        const key = nodes.map((n) => `${n.id}:${n.position.x},${n.position.y},${n.position.z}`).join('|');
        if (key === routeKey) return director;
        routeKey = key;
        // A rebuilt route ends any running chase cleanly first (hold released, chase.lost emitted).
        director?.abort();
        director?.dispose();
        director = current = null;
        if (nodes.length === 0) return null;
        const problems = validateRoute(nodes);
        const timer = problems.length ? NaN : timerFor(nodes, MIN_CLASS_STAMINA);
        if (!Number.isFinite(timer)) {
          console.warn(`chase: ${M10_CHASE.id} route is not solvable; chase disabled`, problems);
          return null;
        }
        director = current = new ChaseDirector({ ...M10_CHASE, timer }, nodes, {
          find: (id) => ctx.anchors.find(id),
          playerFeet: () => ctx.player.feet,
          live: (def) => questLive(quests(), def.quest),
          // Begins only in plain gameplay: no dialogue or menu open, alive, nobody hostile on the player.
          canStart: () => ctx.input.contexts.top() === 'gameplay' && !ctx.player.actor.dead && !ctx.services.get('waystones')?.hostileAggro,
          suspend: (reason) => ctx.services.get('save')?.suspend(reason) ?? (() => {}),
          teleport: teleporter(ctx),
          emit: {
            started: (chaseId) => ctx.events.emit('chase.started', { chaseId }),
            caught: (chaseId, seconds) => ctx.events.emit('chase.caught', { chaseId, seconds }),
            lost: (chaseId, reason) => ctx.events.emit('chase.lost', { chaseId, reason }),
          },
          warn: (m) => console.warn(m),
        });
        // A load can land between catch and the next objective: the courier waits cornered at the end.
        if (cornered()) director.onLoaded(true);
        return director;
      };

      const figure = courierFigure(ctx);
      let body: CourierBody | null = null;
      let disposedPlugin = false;
      if (figure) {
        const assets = ctx.assets as unknown as Partial<NpcModelLoader> | null;
        const loader = assets && typeof assets.load === 'function' && typeof assets.instantiate === 'function' && typeof assets.animations === 'function' ? (assets as NpcModelLoader) : null;
        void loadCourierBody(loader, (m) => console.warn(m)).then((b) => {
          if (!b) return;
          if (disposedPlugin) { b.dispose(); return; }
          body = b;
          for (const c of [...figure.children]) {
            figure.remove(c);
            const m = c as THREE.Mesh;
            m.geometry?.dispose();
            (m.material as THREE.Material | undefined)?.dispose?.();
          }
          figure.add(b.root);
        });
        offs.push(() => { disposedPlugin = true; body?.dispose(); });
      }
      if (figure)
        offs.push(() => {
          body?.dispose(); // first: its geometry belongs to the loader's cache, the walk below frees only the capsule
          figure.removeFromParent();
          figure.traverse((o) => {
            const m = o as THREE.Mesh;
            m.geometry?.dispose();
            (m.material as THREE.Material | undefined)?.dispose?.();
          });
        });

      const cornered = () => {
        const q = quests();
        return q?.state('m10') === 'active' && objectivesDone(q, 'm10', [M10_CHASE.quest.liveUntil]) && !objectivesDone(q, 'm10', [M10_AFTER_CATCH]);
      };

      ctx.systems.add({
        id: 'chase.run',
        fixedPhase: 'rules',
        order: 560,
        fixedUpdate: (dt) => {
          const d = ensure();
          if (!d) return;
          // Aborts: waystone travel or the player's death mid-run (death has its own listener too).
          if (d.state === 'running' && (ctx.services.get('waystones')?.travelling || ctx.player.actor.dead)) d.abort();
          if (d.state === 'running' && ctx.services.get('waystones')?.hostileAggro) d.onCombat();
          d.fixedUpdate(dt);
        },
      });
      ctx.systems.add({
        id: 'chase.figure',
        renderPhase: 'world',
        order: 70,
        render: (_alpha, frameTime) => {
          if (!figure) return;
          const d = director;
          // Visible while running, on the Again card, at the catch, and cornered until M10 moves on.
          const show = !!d && (d.active() || d.state === 'caught' || (d.courier.cornered && cornered()));
          figure.visible = show;
          if (show && d) {
            figure.position.copy(d.courier.position);
            body?.step(frameTime, d.courier.position.x, d.courier.position.z);
          } else body?.resetTrack();
        },
      });

      offs.push(ctx.events.on('ai.aggro', (e) => e.targetId === PLAYER_ID && director?.onCombat()));
      offs.push(ctx.events.on('damage.dealt', (r) => r.targetId === PLAYER_ID && r.attackerId !== null && r.kind !== 'fall' && director?.onCombat()));
      offs.push(ctx.events.on('actor.died', (e) => e.actorId === PLAYER_ID && director?.abort()));
      offs.push(ctx.events.on('dialogue.started', () => director?.abort()));
      offs.push(ctx.events.on('save.loaded', () => ensure(true)?.onLoaded(cornered())));

      ctx.services.provide('chase', {
        active: () => director?.active() ?? false,
        timer: () => director?.timer() ?? null,
      });
    } catch (err) {
      cleanup?.();
      cleanup = null;
      throw err;
    }
  },
  dispose() {
    cleanup?.();
    cleanup = null;
  },
} satisfies GamePlugin;
