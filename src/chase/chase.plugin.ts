import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { objectivesDone, questLive } from '../stealth/liveness';
import { ChaseDirector, type ChaseTimer } from './ChaseDirector';
import { M10_AFTER_CATCH, M10_CHASE, MIN_CLASS_STAMINA } from './chases';
import { routeFromAnchors, validateRoute } from './route';
import { timerFor } from './solvability';
import { CHASE_STRINGS_EN } from './strings.en';

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

/** Greybox courier (a brown capsule) until the asset swap brings the Rogue model. Null headless. */
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
      offs.push(() => director?.dispose());

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
        director?.dispose();
        director = null;
        if (nodes.length === 0) return null;
        const problems = validateRoute(nodes);
        const timer = problems.length ? NaN : timerFor(nodes, MIN_CLASS_STAMINA);
        if (!Number.isFinite(timer)) {
          console.warn(`chase: ${M10_CHASE.id} route is not solvable; chase disabled`, problems);
          return null;
        }
        director = new ChaseDirector({ ...M10_CHASE, timer }, nodes, {
          find: (id) => ctx.anchors.find(id),
          playerFeet: () => ctx.player.feet,
          live: (def) => questLive(quests(), def.quest.id, def.quest.liveUntil),
          suspend: (reason) => ctx.services.get('save')?.suspend(reason) ?? (() => {}),
          teleport: (feet, yaw) => {
            const w = ctx.services.get('waystones');
            if (w) return w.safeTeleport(feet, yaw);
            ctx.player.teleport(feet, yaw);
            return Promise.resolve();
          },
          emit: {
            started: (chaseId) => ctx.events.emit('chase.started', { chaseId }),
            caught: (chaseId, seconds) => ctx.events.emit('chase.caught', { chaseId, seconds }),
            lost: (chaseId, reason) => ctx.events.emit('chase.lost', { chaseId, reason }),
          },
          warn: (m) => console.warn(m),
        });
        return director;
      };

      const figure = courierFigure(ctx);
      if (figure) offs.push(() => (figure.removeFromParent(), figure.traverse((o) => (o as THREE.Mesh).geometry?.dispose())));

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
        render: () => {
          if (!figure) return;
          const d = director;
          const show = !!d && (d.active() || (d.courier.cornered && cornered()));
          figure.visible = show;
          if (show && d) figure.position.copy(d.courier.position);
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
