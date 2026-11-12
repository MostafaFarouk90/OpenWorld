import * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId } from '../../ports';
import type { MoveDef } from '../../types';
import { HUSK_KNIGHT } from '../tuning';
import { HUSK_EMBER_HURTBOX } from './def';

/** What the plugin's rules and tests read of one Husk Knight. */
export interface HuskKnightView {
  /** The chest ember glows now: a hit on the chest breaks the poise. */
  exposed: boolean;
  /** Its one rise is still to come (false once it has risen, and while it lies in its heap). */
  riseLeft: boolean;
  /** Lying in its ash heap after the first death. */
  heaped: boolean;
  /** Seconds left in the heap. */
  heapLeft: number;
  /** Times it has risen (0 or 1). */
  rises: number;
  /** The lethal-hit floor ran: lie down in the heap on the next tick. */
  collapse(): void;
}
const VIEWS = new Map<ActorId, HuskKnightView>();
export function huskKnightView(actorId: ActorId): HuskKnightView | null {
  return VIEWS.get(actorId) ?? null;
}

const EMBER_MOVES = new Set(['huskknight.raise', 'huskknight.rush']);

interface HeapClips {
  /** The fall into the heap, the lying hold, and the rise. */
  down: string;
  lie: string;
  up: string;
}
const CLIPS: HeapClips = { down: 'Lie_Down', lie: 'Lie_Idle', up: 'Lie_StandUp' };

/**
 * The `husk-knight` overlay (plans/act4-L5.md section 3): swaps the embedded one-handed sword for the two-handed one (look),
 * lights the chest ember while it raises the greatsword or the shield and for `HUSK_KNIGHT.emberAfterRush` after the rush
 * (the waste plugin's modifier breaks its poise on a chest hit then), lets the combo's second blow follow only the raise,
 * and runs the one rise: the plugin's lethal-hit floor leaves it at 1 HP and calls `collapse()`, it lies in its heap for
 * `heapSeconds` (Release is offered there), then rises at half health. The second death is final.
 */
export function makeHuskKnightOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const root = ctx.body.root;
  const sword1 = root.getObjectByName('1H_Sword');
  const sword2 = root.getObjectByName('2H_Sword');
  if (sword2) {
    sword2.visible = true;
    if (sword1) {
      // Hide the one-handed blade's meshes only: its hilt and tip markers still drive the tracer.
      sword1.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.visible = false;
      });
    }
  }
  // The ember: a small glowing sphere on the chest bone (no light: the glow pool is kept for the world's fires).
  const chest = root.getObjectByName('chest') ?? root.getObjectByName('spine') ?? root;
  const emberMat = new THREE.MeshBasicMaterial({ color: HUSK_KNIGHT.emberColor, transparent: true, opacity: 0.15, depthWrite: false });
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), emberMat);
  ember.name = 'husk-ember';
  ember.position.set(0, 0.25, -0.18);
  chest.add(ember);

  let exposedFor = 0;
  let raising: string | null = null;
  let sinceRaise = Infinity;
  let riseLeft = true;
  let rises = 0;
  let pendingCollapse = false;
  let heapLeft = 0;
  let rising = 0;
  let clock = 0;

  const view: HuskKnightView = {
    get exposed() {
      return raising !== null || exposedFor > 0;
    },
    get riseLeft() {
      return riseLeft;
    },
    get heaped() {
      return heapLeft > 0 || pendingCollapse;
    },
    get heapLeft() {
      return heapLeft;
    },
    get rises() {
      return rises;
    },
    collapse() {
      if (!riseLeft) return;
      riseLeft = false;
      pendingCollapse = true;
    },
  };
  VIEWS.set(ctx.actorId, view);

  const startHeap = (): void => {
    pendingCollapse = false;
    heapLeft = HUSK_KNIGHT.heapSeconds;
    raising = null;
    exposedFor = 0;
    // Down in the heap: a stun-mode stagger holds the brain (no swing, no chase) for the heap's length.
    ctx.brain.stunned(HUSK_KNIGHT.heapSeconds);
    ctx.playOneShot(CLIPS.down, HUSK_KNIGHT.heapSeconds);
  };

  const endHeap = (): void => {
    heapLeft = 0;
    rises++;
    const actor = ctx.host.actors.get(ctx.actorId) as { maxHealth?: number; health?: number } | undefined;
    const max = actor?.maxHealth ?? 0;
    const now = actor?.health ?? 0;
    const want = Math.round(max * HUSK_KNIGHT.riseHealth);
    if (want > now) ctx.host.damage.heal(ctx.actorId, want - now);
    rising = 1.2;
    ctx.playOneShot(CLIPS.up, rising);
  };

  return {
    animate(dt) {
      clock += dt;
      if (pendingCollapse) startHeap();
      if (heapLeft > 0) {
        heapLeft -= dt;
        if (heapLeft <= 0) endHeap();
      }
      if (rising > 0) rising = Math.max(0, rising - dt);
      if (raising === null && exposedFor > 0) exposedFor = Math.max(0, exposedFor - dt);
      if (raising === null) sinceRaise += dt;
      const lit = view.exposed ? 1 : 0;
      emberMat.opacity = 0.15 + 0.85 * lit;
      ember.scale.setScalar(1 + 0.35 * lit * (0.6 + 0.4 * Math.sin(clock * 9)));
    },

    telegraphed(move: MoveDef) {
      if (EMBER_MOVES.has(move.id)) raising = move.id;
    },

    stateChanged(from, to) {
      // The raise's ember holds through the wind-up and the blow; the rush's for a moment after it, too.
      if ((from === 'attack' || from === 'telegraph') && to !== 'telegraph' && to !== 'attack' && raising) {
        if (raising === 'huskknight.rush') exposedFor = HUSK_KNIGHT.emberAfterRush;
        if (raising === 'huskknight.raise') sinceRaise = 0;
        raising = null;
      }
      if (to === 'stagger' || to === 'dead') raising = null;
    },

    allowMove(move: MoveDef) {
      if (heapLeft > 0 || pendingCollapse) return false;
      // The combo's second blow follows the raise only.
      if (move.id === 'huskknight.sweep') return sinceRaise <= HUSK_KNIGHT.comboWindow;
      return true;
    },

    // A poise break in the heap must not swap the heap's stun for a short stagger (it would chase while lying down).
    staggered() {
      return heapLeft > 0 || pendingCollapse;
    },

    // Release stays offered while it lies in its heap (it counts as staggered).
    mercyOpen(open) {
      if (heapLeft > 0) return ctx.brain.state === 'stagger';
      return open;
    },

    loco() {
      return heapLeft > 0 ? CLIPS.lie : null;
    },

    dispose() {
      VIEWS.delete(ctx.actorId);
      ember.removeFromParent();
      ember.geometry.dispose();
      emberMat.dispose();
    },
  };
}

/** The chest hurtbox's name (a hit there while exposed breaks the poise). */
export const HUSK_EMBER_BONE = HUSK_EMBER_HURTBOX;

/**
 * The ember rule as a damage modifier body (the waste plugin registers it): a player's or an ally's landed hit on the chest
 * while the ember is exposed breaks the poise at once.
 */
export function huskEmberRule(req: { outcome?: string; kind: string; bone?: string; poise: number }, target: { id: string; poise: number }): boolean {
  if (req.outcome !== 'hit' || req.kind === 'status' || req.kind === 'script') return false;
  if (req.bone !== HUSK_EMBER_HURTBOX) return false;
  const view = huskKnightView(target.id);
  if (!view || !view.exposed || view.heaped) return false;
  req.poise = Math.max(req.poise ?? 0, target.poise);
  return true;
}

/**
 * The rise rule (the waste plugin registers it late, after every multiplier): a hit that would kill a Husk Knight whose rise
 * is still to come leaves it at 1 HP and lays it in its heap; while it lies there it takes no health damage. Any kind of hit
 * counts (a burn tick too), so nothing kills it through the heap.
 */
export function huskRiseRule(req: { outcome?: string; amount: number; poise?: number }, target: { id: string; health: number }): boolean {
  if (req.outcome !== 'hit') return false;
  const view = huskKnightView(target.id);
  if (!view) return false;
  if (view.heaped) {
    req.amount = 0;
    if ('poise' in req) (req as { poise?: number }).poise = 0;
    return true;
  }
  if (!view.riseLeft || !(target.health > 0) || req.amount < target.health) return false;
  req.amount = Math.max(0, target.health - 1);
  view.collapse();
  return true;
}

/**
 * The rise as a lethal handler (the waste plugin registers it beside the modifier): a raw kill (`damage.kill`, which skips
 * every modifier) of a Husk Knight whose rise is still to come lays it in its heap at 1 HP instead, and a heaped knight is
 * never killed. True when it saved the knight.
 */
export function huskRiseLethal(target: { id: string; health: number; maxHealth: number }): boolean {
  const view = huskKnightView(target.id);
  if (!view) return false;
  if (view.heaped) {
    target.health = Math.min(1, target.maxHealth);
    return true;
  }
  if (!view.riseLeft) return false;
  target.health = Math.min(1, target.maxHealth);
  view.collapse();
  return true;
}
