import * as THREE from 'three';
import type { ActorId } from '../actors/Actor';
import { PLAYER_ID } from '../actors/teams';
import { PLAYER } from '../config/constants';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { Action } from '../input/actions';
import { IDLE_PLAYER, type PlayerStealthState, playerNoise, stealthModifiers } from './detection';
import { StealthEffects } from './hooks';
import { objectivesDone, questLive } from './liveness';
import type { GuardPerceptionState, PerceptionModifiers, P3 } from './perceptionPort';
import { SECTIONS } from './sections';
import { SneakPose } from './SneakPose';
import { type Eye, StealthDirector } from './StealthDirector';
import { STEALTH_STRINGS_EN } from './strings.en';
import { STEALTH } from './tuning';

export const STEALTH_PERSIST_KEY = 'stealth';
export const STEALTH_PERSIST_VERSION = 1;

/** The `stealth` service (game-events-and-flags.md section 6, plus the readers and hooks of plan section 12). */
export interface StealthService {
  active(): boolean;
  suspicion(observerId: ActorId): number;
  sneaking(): boolean;
  hidden(): boolean;
  /** Thread 8's eye, polled per frame; null outside a live section. */
  eye(): Eye | null;
  /** Metres the player can be heard at while sneaking (the Quiet Soles ring); null when not sneaking. */
  noise(): number | null;
  /** Quiet Soles (thread 15). */
  addNoiseScale(source: string, scale: number): () => void;
  /** Ash Cloud (thread 15). */
  addSightBlocker(b: { x: number; z: number; r: number; seconds: number }): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    stealth: StealthService;
  }
}

/**
 * Thread 5's perception hook as agreed (plan section 12, B3). Read through an untyped lookup until thread 5's PR B
 * lands; then this becomes `ctx.services.get('enemies')?.perception`.
 */
interface PerceptionServiceLike {
  register(p: { modifiers(targetId: ActorId, observer: unknown): PerceptionModifiers | null }): () => void;
  state(actorId: ActorId): GuardPerceptionState | null;
}

function perceptionService(ctx: GameContext): PerceptionServiceLike | null {
  const any = ctx.services as unknown as { get(n: string): unknown };
  const enemies = any.get('enemies') as { perception?: PerceptionServiceLike } | undefined;
  const svc = enemies?.perception;
  return svc && typeof svc.register === 'function' && typeof svc.state === 'function' ? svc : null;
}

const MOVE_KEYS: readonly Action[] = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'dodge'];
/** A capture or load teleport fades and waits for ground; headless it resolves at once. */
function teleporter(ctx: GameContext): (feet: P3, yaw: number) => Promise<unknown> {
  return (feet, yaw) => {
    const w = ctx.services.get('waystones');
    if (w) return w.safeTeleport(feet, yaw);
    ctx.player.teleport(feet, yaw);
    return Promise.resolve();
  };
}

let cleanup: (() => void) | null = null;

/** Slice 2 thread 18: sneak, stealth sections M06 and M09 (plans/slice-2-stealth-chase.md). */
export default {
  id: 'stealth',
  dependsOn: ['core'],
  setup(ctx) {
    const offs: (() => void)[] = [];
    cleanup = () => {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          console.warn('stealth: cleanup failed', err);
        }
      }
    };
    try {
      ctx.strings.register('en', STEALTH_STRINGS_EN);
      const effects = new StealthEffects();
      offs.push(() => effects.clear());
      const player: PlayerStealthState = { ...IDLE_PLAYER };
      const quests = () => ctx.services.get('quests');
      const enemies = () => ctx.services.get('enemies');
      const director = new StealthDirector(SECTIONS, {
        find: (id) => ctx.anchors.find(id),
        interiorAt: (p) => ctx.services.get('interiors')?.interiorAt(p) ?? null,
        playerFeet: () => ctx.player.feet,
        sectionLive: (def) => questLive(quests(), def.quest.id, def.quest.liveUntil),
        exitArmed: (def) => objectivesDone(quests(), def.quest.id, def.quest.exitArmedAfter),
        guards: (def) => def.guardGroups.flatMap((g) => enemies()?.alive(g) ?? []),
        guardState: (id) => perceptionService(ctx)?.state(id) ?? null,
        resetGuards: (def) => {
          const e = enemies();
          for (const g of def.guardGroups) {
            e?.reset(g);
            e?.spawnGroup(g);
          }
        },
        teleport: teleporter(ctx),
        suspend: (reason) => ctx.services.get('save')?.suspend(reason) ?? (() => {}),
        checkpointSave: (reason) => {
          void ctx.services.get('save')?.checkpoint(reason);
        },
        emit: {
          section: (sectionId, phase) => ctx.events.emit('stealth.section', { sectionId, phase }),
          alert: (observerId, sectionId, state) => ctx.events.emit('stealth.alert', { observerId, sectionId, state }),
          noticed: (observerId, sectionId, level) => ctx.events.emit('stealth.noticed', { observerId, sectionId, level }),
          caught: (observerId, sectionId, checkpointId) => ctx.events.emit('stealth.caught', { observerId, sectionId, checkpointId }),
          checkpoint: (sectionId, checkpointId) => ctx.events.emit('stealth.checkpoint', { sectionId, checkpointId }),
        },
        warn: (m) => console.warn(m),
      });
      offs.push(() => director.dispose());

      ctx.persist.register({
        key: STEALTH_PERSIST_KEY,
        version: STEALTH_PERSIST_VERSION,
        serialize: () => director.serialize(),
        load: (data) => director.load(data),
      });

      // Sneak: hold left Alt in gameplay; sprint is locked while sneaking (sneaking wins).
      let sneakMod: (() => void) | null = null;
      let hideMod: (() => void) | null = null;
      offs.push(() => (sneakMod?.(), hideMod?.()));
      const last = new THREE.Vector3().copy(ctx.player.feet);
      let speed = 0;

      // The perception provider: contributes only for the player and only when something applies.
      let unregister: (() => void) | null = null;
      offs.push(() => unregister?.());
      const provider = { modifiers: (targetId: ActorId) => (targetId === PLAYER_ID ? stealthModifiers(player) : null) };

      ctx.systems.add({
        id: 'stealth.player',
        fixedPhase: 'intent',
        order: 50,
        fixedUpdate: (dt) => {
          if (!unregister) {
            const svc = perceptionService(ctx);
            if (svc) unregister = svc.register(provider);
          }
          effects.tick(dt);
          const a = ctx.input.actions;
          const gameplay = ctx.input.contexts.top() === 'gameplay';
          const wantSneak = gameplay && a.down('sneak') && !ctx.player.actor.dead;
          if (wantSneak && !sneakMod) sneakMod = ctx.player.addMoveModifier('stealth.sneak', { speedScale: STEALTH.sneakSpeedScale, lockActions: ['sprint'] });
          else if (!wantSneak && sneakMod) (sneakMod(), (sneakMod = null));
          // Leave cover on a move key, or when the director dropped it (capture, leaving the section).
          if (hideMod && (!director.hidden || MOVE_KEYS.some((k) => a.pressed(k)))) {
            director.unhide();
            hideMod();
            hideMod = null;
          }
          const f = ctx.player.feet;
          speed = dt > 0 ? Math.hypot(f.x - last.x, f.z - last.z) / dt : 0;
          last.copy(f);
          player.sneaking = wantSneak || director.hidden;
          player.hidden = director.hidden;
          player.moving = ctx.player.moving && !director.hidden;
          // Loud is real sprinting, not the Shift key (B3).
          player.loud = speed > PLAYER.walkSpeed + 0.3;
          player.noiseScale = effects.noiseScale();
          player.blockers = effects.blockers();
        },
      });

      ctx.systems.add({
        id: 'stealth.sections',
        fixedPhase: 'rules',
        order: 550,
        fixedUpdate: (dt) => director.fixedUpdate(dt),
      });

      // Hide spots: `hide` interactables by explicit id (never by tag); live only in their section.
      const tmp = new THREE.Vector3();
      const enterHide = (spotId: string) => {
        if (hideMod || !director.hide(spotId)) return;
        const at = director.hideSpotAnchor(spotId);
        if (at) ctx.player.teleport(tmp.set(at.position.x, at.position.y, at.position.z), at.yaw);
        hideMod = ctx.player.addMoveModifier('stealth.hide', { lockMove: true, lockActions: ['sprint', 'attack1', 'attack2', 'attack3', 'attack4', 'surgeLeap'] });
      };
      for (const def of SECTIONS) {
        for (const spot of def.hideSpots) {
          offs.push(
            ctx.interaction.register({
              id: spot.id,
              kind: 'hide',
              position: (out) => {
                const p = ctx.anchors.find(spot.anchor)?.position;
                return p ? out.set(p.x, p.y, p.z) : out.set(NaN, NaN, NaN);
              },
              radius: 1.6,
              coneDegrees: 360,
              promptKey: 'stealth.hide',
              enabled: () => director.section === def && !!ctx.anchors.find(spot.anchor) && !director.hidden,
              onInteract: () => enterHide(spot.id),
            }),
          );
        }
      }

      // Thread 5's ai.spotted maps to stealth.noticed; a player hit on a watch guard is a capture.
      const bus = ctx.events as unknown as { on(type: string, fn: (p: { actorId: ActorId; targetId: ActorId }) => void): () => void };
      offs.push(bus.on('ai.spotted', (p) => p.targetId === PLAYER_ID && director.onSpotted(p.actorId)));
      offs.push(
        ctx.events.on('damage.dealt', (r) => {
          if (r.attackerId === PLAYER_ID && r.kind !== 'status') director.onPlayerHitGuard(r.targetId);
        }),
      );
      offs.push(ctx.events.on('save.loaded', () => director.onLoaded()));

      ctx.services.provide('stealth', {
        active: () => director.section !== null,
        suspicion: (id) => director.suspicion(id),
        sneaking: () => player.sneaking,
        hidden: () => director.hidden,
        eye: () => director.eye(),
        noise: () => playerNoise(player),
        addNoiseScale: (source, scale) => effects.addNoiseScale(source, scale),
        addSightBlocker: (b) => effects.addSightBlocker(b),
      });

      // The procedural sneak pose, rebound whenever the class kit changes (player.avatar).
      let pose: SneakPose | null = null;
      const bind = () => {
        const av = ctx.player.avatar;
        const prev = pose?.blend ?? 0;
        pose = null;
        if (!av) return;
        try {
          pose = new SneakPose({
            hips: av.bone('hips'),
            spine: av.bone('spine'),
            legs: (['l', 'r'] as const).map((s) => ({ upper: av.bone(`upperleg${s}`), lower: av.bone(`lowerleg${s}`), foot: av.bone(`foot${s}`) })),
          });
          pose.setBlend(prev);
        } catch (err) {
          console.warn('stealth: this kit has no sneak bones; no sneak pose', err);
        }
      };
      bind();
      offs.push(ctx.events.on('player.avatar', bind));
      const fwd = new THREE.Vector3();
      ctx.systems.add({
        id: 'stealth.pose',
        fixedPhase: 'animation',
        order: 250,
        fixedUpdate: (dt) => {
          if (!pose) {
            if (ctx.player.avatar) bind();
            if (!pose) return;
          }
          const yaw = ctx.player.facingYaw;
          fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
          pose.apply(player.sneaking && !ctx.player.actor.dead, fwd, dt);
        },
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
