import { describe, expect, it } from 'vitest';
import { KNIGHT } from '../config/constants';
import type { LocomotionState } from './knightClips';
import { gateMovement, isGrounded, movementState, nextState, type LocomotionInput, type StateTiming } from './locomotionState';

const ALL: LocomotionState[] = ['idle', 'walk', 'run', 'jumpStart', 'airborne', 'land', 'attack'];

const timing = (t: Partial<StateTiming> = {}): StateTiming => ({ timeInState: 0, airTime: 0, clipDone: false, ...t });
const ground = (horizontalSpeed = 0, verticalSpeed = 0): LocomotionInput => ({ grounded: true, horizontalSpeed, verticalSpeed });
const air = (verticalSpeed = 0, horizontalSpeed = 0): LocomotionInput => ({ grounded: false, horizontalSpeed, verticalSpeed });

const { walkEnterSpeed: WE, walkExitSpeed: WX, runEnterSpeed: RE, runExitSpeed: RX, jumpDetectSpeed: JD, airborneDelay: AD } = KNIGHT;

describe('movementState', () => {
  it('stays idle at zero and at or below walkEnterSpeed', () => {
    expect(movementState('idle', 0)).toBe('idle');
    expect(movementState('idle', WE)).toBe('idle');
    expect(movementState('idle', WE - 0.01)).toBe('idle');
  });

  it('goes idle -> walk only above walkEnterSpeed', () => {
    expect(movementState('idle', WE + 0.001)).toBe('walk');
    expect(movementState('idle', 4.5)).toBe('walk');
  });

  it('keeps walking between exit and enter speed (hysteresis, no flicker)', () => {
    for (const s of [WX, (WX + WE) / 2, WE]) {
      expect(movementState('walk', s)).toBe('walk');
      expect(movementState('idle', s)).toBe('idle');
    }
  });

  it('walk drops to idle below walkExitSpeed', () => {
    expect(movementState('walk', WX - 0.001)).toBe('idle');
    expect(movementState('walk', 0)).toBe('idle');
  });

  it('idle goes straight to run when fast enough', () => {
    expect(movementState('idle', RE + 0.1)).toBe('run');
  });

  it('walk -> run only above runEnterSpeed', () => {
    expect(movementState('walk', RE)).toBe('walk');
    expect(movementState('walk', RE + 0.001)).toBe('run');
  });

  it('run stays run down to runExitSpeed and drops to walk below it', () => {
    expect(movementState('run', RX)).toBe('run');
    expect(movementState('run', (RX + RE) / 2)).toBe('run');
    expect(movementState('run', RX - 0.001)).toBe('walk');
    expect(movementState('run', WX)).toBe('walk');
    expect(movementState('run', WX - 0.001)).toBe('idle');
  });

  it('other states use the idle thresholds', () => {
    for (const s of ['land', 'attack', 'jumpStart', 'airborne'] as const) {
      expect(movementState(s, WX)).toBe('idle');
      expect(movementState(s, WE + 0.01)).toBe('walk');
    }
  });

  it('does not flicker over a speed sweep around each threshold', () => {
    let s: LocomotionState = 'idle';
    let changes = 0;
    for (let i = 0; i < 200; i++) {
      const speed = (WX + WE) / 2 + (i % 2 ? 0.05 : -0.05);
      const n = movementState(s, speed);
      if (n !== s) changes++;
      s = n;
    }
    expect(changes).toBe(0);
  });
});

describe('nextState grounded', () => {
  it('idle/walk/run follow movementState', () => {
    for (const from of ['idle', 'walk', 'run'] as const) {
      for (const speed of [0, WX, (WX + WE) / 2, WE + 0.1, RX, RE, RE + 1]) {
        expect(nextState(from, ground(speed), timing())).toBe(movementState(from, speed));
      }
    }
  });

  it('airborne -> land on touchdown', () => {
    expect(nextState('airborne', ground(), timing())).toBe('land');
    expect(nextState('airborne', ground(8), timing())).toBe('land');
  });

  it('jumpStart stays while grounded within the airborne delay, then lands', () => {
    expect(nextState('jumpStart', ground(), timing({ timeInState: 0 }))).toBe('jumpStart');
    expect(nextState('jumpStart', ground(), timing({ timeInState: AD }))).toBe('jumpStart');
    expect(nextState('jumpStart', ground(), timing({ timeInState: AD + 0.001 }))).toBe('land');
  });

  it('land stays while still and the clip is not done', () => {
    expect(nextState('land', ground(0), timing())).toBe('land');
    expect(nextState('land', ground(WE), timing())).toBe('land');
  });

  it('land is cut short by movement', () => {
    expect(nextState('land', ground(WE + 0.1), timing())).toBe('walk');
    expect(nextState('land', ground(RE + 0.1), timing())).toBe('run');
  });

  it('land goes to idle/walk/run when the clip is done', () => {
    expect(nextState('land', ground(0), timing({ clipDone: true }))).toBe('idle');
    expect(nextState('land', ground(WE + 0.1), timing({ clipDone: true }))).toBe('walk');
    expect(nextState('land', ground(RE + 0.1), timing({ clipDone: true }))).toBe('run');
  });

  it('attack stays until the clip is done, even while moving', () => {
    expect(nextState('attack', ground(0), timing())).toBe('attack');
    expect(nextState('attack', ground(RE + 1), timing())).toBe('attack');
  });

  it('attack ends into idle/walk/run by speed', () => {
    expect(nextState('attack', ground(0), timing({ clipDone: true }))).toBe('idle');
    expect(nextState('attack', ground(WE + 0.1), timing({ clipDone: true }))).toBe('walk');
    expect(nextState('attack', ground(RE + 0.1), timing({ clipDone: true }))).toBe('run');
  });
});

describe('nextState ungrounded', () => {
  const GROUNDED_FROM = ['idle', 'walk', 'run', 'land', 'attack'] as const;

  it('rising faster than jumpDetectSpeed starts a jump', () => {
    for (const from of GROUNDED_FROM) {
      expect(nextState(from, air(JD + 0.01), timing())).toBe('jumpStart');
      expect(nextState(from, air(6.5), timing({ airTime: 1 / 60 }))).toBe('jumpStart');
    }
  });

  it('rising exactly at jumpDetectSpeed does not count as a jump', () => {
    for (const from of GROUNDED_FROM) expect(nextState(from, air(JD), timing())).toBe(from);
  });

  it('brief ground loss with small or negative vertical speed keeps the state', () => {
    for (const from of GROUNDED_FROM) {
      for (const v of [0, -0.5, -3, JD - 0.1]) {
        expect(nextState(from, air(v), timing({ airTime: 0 }))).toBe(from);
        expect(nextState(from, air(v), timing({ airTime: AD - 0.001 }))).toBe(from);
      }
    }
  });

  it('becomes airborne once airTime reaches airborneDelay (ledge, interrupted attack)', () => {
    for (const from of GROUNDED_FROM) {
      expect(nextState(from, air(-1), timing({ airTime: AD }))).toBe('airborne');
      expect(nextState(from, air(-9), timing({ airTime: 1 }))).toBe('airborne');
    }
  });

  it('a jump while landing goes to jumpStart', () => {
    expect(nextState('land', air(6.5), timing({ timeInState: 0.05, airTime: 1 / 60 }))).toBe('jumpStart');
  });

  it('jumpStart -> airborne when the clip is done or vertical speed is not positive', () => {
    expect(nextState('jumpStart', air(5), timing({ clipDone: true }))).toBe('airborne');
    expect(nextState('jumpStart', air(0), timing())).toBe('airborne');
    expect(nextState('jumpStart', air(-2), timing())).toBe('airborne');
  });

  it('jumpStart stays while still rising and the clip is running', () => {
    expect(nextState('jumpStart', air(0.01), timing())).toBe('jumpStart');
    expect(nextState('jumpStart', air(6.5), timing({ airTime: 1 }))).toBe('jumpStart');
  });

  it('airborne stays airborne regardless of speed or timing', () => {
    for (const v of [10, 0, -30]) {
      expect(nextState('airborne', air(v), timing())).toBe('airborne');
      expect(nextState('airborne', air(v), timing({ clipDone: true, airTime: 5 }))).toBe('airborne');
    }
  });
});

describe('gateMovement', () => {
  it('passes the request through unchanged when unlocked', () => {
    const req = { moveX: 0.3, moveZ: -1, jump: true };
    const out = gateMovement(false, req);
    expect(out).toEqual({ moveX: 0.3, moveZ: -1, jump: true });
    expect(out).toBe(req);
    expect(gateMovement(false, { moveX: 0, moveZ: 0, jump: false })).toEqual({ moveX: 0, moveZ: 0, jump: false });
  });

  it('zeroes movement and blocks jump when locked', () => {
    expect(gateMovement(true, { moveX: 1, moveZ: -1, jump: true })).toEqual({ moveX: 0, moveZ: 0, jump: false });
    expect(gateMovement(true, { moveX: 0.5, moveZ: 0, jump: false })).toEqual({ moveX: 0, moveZ: 0, jump: false });
  });

  it('does not mutate the request', () => {
    const req = { moveX: 1, moveZ: 1, jump: true };
    gateMovement(true, req);
    expect(req).toEqual({ moveX: 1, moveZ: 1, jump: true });
  });
});

describe('isGrounded', () => {
  it.each(ALL)('%s', (s) => {
    expect(isGrounded(s)).toBe(['idle', 'walk', 'run', 'land'].includes(s));
  });
});
