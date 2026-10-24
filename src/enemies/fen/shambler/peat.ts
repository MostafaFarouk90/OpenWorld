import type * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import { ENEMY_CLIPS } from '../../clips';
import { firmPointOutside, homePatch, inPatch, type PeatPatchDef } from '../peat';
import { FEN_TUNING } from '../tuning';

const T = FEN_TUNING.shambler;

/** The Drag out hold's interactable id for a shambler (`drag:<slug>`, kind:name with no dots; agreed with K7). */
export function dragInteractableId(slug: string): string {
  return `drag:${slug.replace(/\./g, '-')}`;
}

type Health = { health: number; maxHealth: number; poise: number; maxPoise: number; dead: boolean; restorePoise(n?: number): void };

/** What a test or the plugin can read of one live shambler. */
export interface ShamblerView {
  readonly patch: Readonly<PeatPatchDef>;
  readonly slumped: boolean;
  readonly inPeat: boolean;
  /** The Drag out hold is offered now (alive, staggered, feet in peat, not slumped). */
  readonly dragOffered: boolean;
}

const VIEWS = new Map<string, ShamblerView>();

/** The live shambler with this actor id (tests and the plugin's dev hooks); undefined when gone. */
export function shamblerView(actorId: string): ShamblerView | undefined {
  return VIEWS.get(actorId);
}

/**
 * The `peat` overlay (the Peat Shambler, plans/act3-K6b.md sections 3 and 12). In its peat patch it regenerates health and
 * poise; it may chase `T.leashBeyondPatch` past the patch's edge and no farther. **Pulled out**: a Drag out hold (F,
 * `T.dragHoldSeconds`, `dragInteractableId`) on it while it is staggered in peat moves it to firm ground past the edge, or a
 * poise break lands while its feet are already outside. Either way it slumps for `T.slumpSeconds` with `pulledOut` true, and
 * hold T offers Lay to rest (a free Calm, only while Calm is unlocked and only until a hit lands on it). If the window runs
 * out it rises and walks back toward its peat. Laid to rest, it sinks `T.sinkDepth` over `T.sinkSeconds` and is gone. The
 * hold never touches the movement mode; releasing F, a hit on the player or the shambler leaving the offer state cancels it.
 */
export function makePeatOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const spawn = ctx.feet();
  const patch: PeatPatchDef = homePatch({ x: spawn.x, z: spawn.z });
  const actor = (): Health | undefined => ctx.host.actors.get(ctx.actorId) as unknown as Health | undefined;
  const owner = ctx.body.owner as THREE.Object3D;
  const ownerY = owner.position.y;

  let slumpLeft = 0;
  let struckInSlump = false;
  let sinkTime = 0;

  const alive = (): boolean => {
    const a = actor();
    const s = ctx.brain.state;
    return !!a && !a.dead && s !== 'dead' && s !== 'calmed' && s !== 'released' && s !== 'spared';
  };
  const inPeat = (): boolean => inPatch(patch, ctx.feet());
  const slumped = (): boolean => slumpLeft > 0;
  const dragOffered = (): boolean => alive() && !slumped() && ctx.brain.state === 'stagger' && inPeat();

  const startSlump = (): void => {
    slumpLeft = T.slumpSeconds;
    struckInSlump = false;
    ctx.brain.stunned(T.slumpSeconds);
    ctx.playOneShot(ENEMY_CLIPS.kneel, T.slumpSeconds);
  };

  const drag = (): void => {
    if (!dragOffered()) return;
    const f = ctx.feet();
    const to = firmPointOutside(patch, f, ctx.host.player.feet, T.dragClear);
    const at = { x: to.x, y: ctx.host.heightAt(to.x, to.z), z: to.z };
    // A forced move onto firm ground: lift off the mover, land at the point (the same path a flier's landing takes).
    ctx.fly(true);
    ctx.fly(false, at);
    startSlump();
  };

  const scratch = { x: 0, y: 0, z: 0 };
  const removeDrag = ctx.host.interaction.register({
    id: dragInteractableId(ctx.slug),
    kind: 'release',
    action: 'interact',
    radius: T.dragRadius,
    coneDegrees: 90,
    holdSeconds: T.dragHoldSeconds,
    promptKey: 'enemies.fen.drag',
    name: 'Peat Shambler',
    position(out) {
      const f = ctx.feet();
      scratch.x = f.x;
      scratch.y = f.y;
      scratch.z = f.z;
      return out.set(scratch.x, scratch.y, scratch.z);
    },
    enabled: dragOffered,
    onInteract: drag,
  });

  const view: ShamblerView = {
    patch,
    get slumped() {
      return slumped();
    },
    get inPeat() {
      return inPeat();
    },
    get dragOffered() {
      return dragOffered();
    },
  };
  VIEWS.set(ctx.actorId, view);

  return {
    intent(dt) {
      if (slumpLeft > 0) {
        slumpLeft = Math.max(0, slumpLeft - dt);
        return;
      }
      // Regeneration in the peat (never while slumped, which is outside it anyway).
      if (alive() && inPeat()) {
        const a = actor()!;
        if (a.health < a.maxHealth) a.health = Math.min(a.maxHealth, a.health + a.maxHealth * T.regenPerSecond * dt);
        if (a.poise < a.maxPoise) a.restorePoise(a.maxPoise * T.regenPerSecond * 5 * dt);
      }
    },

    clampVelocity(v, dt) {
      if (slumpLeft > 0) {
        v.x = 0;
        v.z = 0;
        return;
      }
      const f = ctx.feet();
      const limit = patch.radius + T.leashBeyondPatch;
      const nx = f.x + v.x * dt - patch.x;
      const nz = f.z + v.z * dt - patch.z;
      const r = Math.hypot(nx, nz);
      if (r <= limit) return;
      const ux = nx / r;
      const uz = nz / r;
      const out = v.x * ux + v.z * uz;
      if (out > 0) {
        v.x -= out * ux;
        v.z -= out * uz;
      }
    },

    staggered() {
      // A poise break on firm ground is the second way out of the bog.
      if (!inPeat() && !slumped() && alive()) {
        startSlump();
        return true;
      }
      // Already slumped: the slump keeps running (no fresh window).
      return slumped();
    },

    hit() {
      if (slumpLeft > 0) struckInSlump = true;
    },

    mercyOpen() {
      return slumped() && !struckInSlump && alive();
    },

    calmContext() {
      return { pulledOut: slumped() && alive() };
    },

    leave(dt, how) {
      if (how !== 'calmed') return false;
      // Laid to rest: it sinks back into the peat where it lies, then it is gone.
      sinkTime += dt;
      owner.position.y = ownerY - T.sinkDepth * Math.min(1, sinkTime / T.sinkSeconds);
      if (sinkTime >= T.sinkSeconds) ctx.finish();
      return true;
    },

    dispose() {
      removeDrag();
      VIEWS.delete(ctx.actorId);
    },
  };
}
