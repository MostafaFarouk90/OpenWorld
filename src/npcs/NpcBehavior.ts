import { NPC_TUNING } from './tuning';

export interface NpcPost {
  x: number;
  z: number;
  yaw: number;
}

export interface NpcState {
  x: number;
  z: number;
  postYaw: number;
  yaw: number;
}

export interface NpcStepContext {
  player: { x: number; z: number } | null;
  talkingTo: boolean;
}

const TWO_PI = Math.PI * 2;

/** Wraps an angle to (-pi, pi]; non-finite input gives 0. */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  let r = a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
  if (r <= -Math.PI) r += TWO_PI;
  return r;
}

export function createNpcState(post: NpcPost): NpcState {
  const yaw = wrapAngle(post.yaw);
  return { x: post.x, z: post.z, postYaw: yaw, yaw };
}

/** Advances the facing by one fixed step (mutates and returns `state`'s yaw). */
export function stepNpc(state: NpcState, dt: number, ctx: NpcStepContext): { yaw: number } {
  if (!Number.isFinite(dt) || dt <= 0) return { yaw: state.yaw };
  const step = Math.min(dt, NPC_TUNING.maxStepDt);

  let target = state.postYaw;
  let rate: number = NPC_TUNING.idleTurnRate;
  const p = ctx.player;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    const dx = p.x - state.x;
    const dz = p.z - state.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-6 && (ctx.talkingTo || dist <= NPC_TUNING.glanceRadius)) {
      target = Math.atan2(dx, dz);
      if (ctx.talkingTo) rate = NPC_TUNING.talkTurnRate;
    } else if (ctx.talkingTo) {
      rate = NPC_TUNING.talkTurnRate;
    }
  }

  const delta = wrapAngle(target - state.yaw);
  const maxTurn = rate * step;
  state.yaw = Math.abs(delta) <= maxTurn ? wrapAngle(target) : wrapAngle(state.yaw + Math.sign(delta) * maxTurn);
  return { yaw: state.yaw };
}
