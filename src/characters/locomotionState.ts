import { KNIGHT } from '../config/constants';
import { GROUNDED_STATES, type LocomotionState } from './knightClips';

/** What the character controller did this tick. */
export interface LocomotionInput {
  grounded: boolean;
  /** Actual horizontal speed over the last tick, in m/s. */
  horizontalSpeed: number;
  /** Actual vertical speed over the last tick, in m/s (positive = up). */
  verticalSpeed: number;
}

export interface StateTiming {
  /** Seconds since the current state was entered. */
  timeInState: number;
  /** Seconds the character has been off the ground (0 while grounded). */
  airTime: number;
  /** The current state's clip has played to its end at least once. */
  clipDone: boolean;
}

/** The grounded movement state for a speed, with hysteresis around the current state. */
export function movementState(current: LocomotionState, speed: number): 'idle' | 'walk' | 'run' {
  const moving = current === 'walk' || current === 'run' ? speed >= KNIGHT.walkExitSpeed : speed > KNIGHT.walkEnterSpeed;
  if (!moving) return 'idle';
  const running = current === 'run' ? speed >= KNIGHT.runExitSpeed : speed > KNIGHT.runEnterSpeed;
  return running ? 'run' : 'walk';
}

/**
 * The locomotion state for the next tick. Attacks are entered by AnimationController.playAttack,
 * never here; this only decides when an attack ends (clip done) or is interrupted (left the ground).
 */
export function nextState(state: LocomotionState, input: LocomotionInput, timing: StateTiming): LocomotionState {
  if (!input.grounded) {
    if (state === 'airborne') return 'airborne';
    if (state === 'jumpStart') return timing.clipDone || input.verticalSpeed <= 0 ? 'airborne' : 'jumpStart';
    if (input.verticalSpeed > KNIGHT.jumpDetectSpeed) return 'jumpStart';
    // Brief ground losses (slope crests, steps) do not count as falling.
    return timing.airTime >= KNIGHT.airborneDelay ? 'airborne' : state;
  }

  switch (state) {
    case 'airborne':
      return 'land';
    case 'jumpStart':
      // Grounded right after the jump tick means the jump has not left the ground yet.
      return timing.timeInState > KNIGHT.airborneDelay ? 'land' : 'jumpStart';
    case 'land': {
      if (timing.clipDone) return movementState('idle', input.horizontalSpeed);
      // Moving away cuts the landing short.
      const move = movementState('idle', input.horizontalSpeed);
      return move === 'idle' ? 'land' : move;
    }
    case 'attack':
      return timing.clipDone ? movementState('idle', input.horizontalSpeed) : 'attack';
    default:
      return movementState(state, input.horizontalSpeed);
  }
}

export interface MoveRequest {
  moveX: number;
  moveZ: number;
  jump: boolean;
}

/**
 * Applies the attack movement rule: while an attack plays (or is about to), horizontal movement is
 * zero and jump input is ignored, so the in-place clip reads correctly. Gravity still applies, so
 * leaving the ground interrupts the attack.
 */
export function gateMovement(movementLocked: boolean, request: MoveRequest): MoveRequest {
  if (!movementLocked) return request;
  return { moveX: 0, moveZ: 0, jump: false };
}

export function isGrounded(state: LocomotionState): boolean {
  return GROUNDED_STATES.has(state);
}
