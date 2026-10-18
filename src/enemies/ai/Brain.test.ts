import { describe, expect, it } from 'vitest';
import { ASH_WRAITH, BLIGHTED_SOLDIER } from '../defs';
import { AI } from '../tuning';
import type { AiState, EnemyDef, MoveDef } from '../types';
import { Brain, type BrainHooks, type BrainOptions, type Senses } from './Brain';

const DT = 1 / 60;

class Spy implements BrainHooks {
  log: string[] = [];
  states: AiState[] = [];
  swing = 0;
  tokens = new Map<string, number>();
  tokenLimit = 2;
  move: MoveDef | null = null;
  stateChanged(_from: AiState, to: AiState) {
    this.states.push(to);
  }
  aggro(t: string) {
    this.log.push(`aggro:${t}`);
  }
  calm() {
    this.log.push('calm');
  }
  startAttack(move: MoveDef) {
    this.log.push(`start:${move.id}`);
    return ++this.swing;
  }
  cancelAttack() {
    this.log.push('cancel');
  }
  telegraph(move: MoveDef, swingId: number, lead: number) {
    this.log.push(`telegraph:${move.id}:${swingId}:${lead}`);
  }
  telegraphCancelled(swingId: number) {
    this.log.push(`tcancel:${swingId}`);
  }
  pickMove(distance: number) {
    return this.move && distance <= this.move.range[1] ? this.move : null;
  }
  markMoveUsed() {}
  acquireToken(t: string) {
    const n = this.tokens.get(t) ?? 0;
    if (n >= this.tokenLimit) return false;
    this.tokens.set(t, n + 1);
    this.log.push('token');
    return true;
  }
  releaseToken() {
    this.log.push('untoken');
  }
  flinch() {
    this.log.push('flinch');
  }
  knockback() {
    this.log.push('knockback');
  }
  yieldStarted(s: number) {
    this.log.push(`yield:${s}`);
  }
  refill() {
    this.log.push('refill');
  }
  alertPack(t: string) {
    this.log.push(`pack:${t}`);
  }
  count(entry: string) {
    return this.log.filter((l) => l === entry).length;
  }
}

function senses(over: Partial<Senses> = {}): Senses {
  return {
    self: { x: 0, z: 0 },
    targetId: 'player',
    targetAlive: true,
    targetPos: { x: 0, z: -5 },
    notices: false,
    sees: true,
    distance: 5,
    facingErrorDeg: 0,
    healthFraction: 1,
    stuckGiveUp: false,
    yieldAllowed: false,
    ...over,
  };
}

function make(def: EnemyDef = ASH_WRAITH, opts: Partial<BrainOptions> = {}) {
  const spy = new Spy();
  spy.move = def.moves[0];
  const brain = new Brain(def, spy, { home: { x: 0, z: 0 }, rise: false, ...opts });
  return { brain, spy };
}

function run(brain: Brain, s: Senses, seconds: number) {
  for (let t = 0; t < Math.round(seconds / DT); t++) brain.step(DT, s);
}

/** Idle, notice, then chase with aggro. */
function engaged(def: EnemyDef = ASH_WRAITH, opts: Partial<BrainOptions> = {}) {
  const m = make(def, opts);
  m.brain.step(DT, senses({ notices: true }));
  run(m.brain, senses({ distance: 5 }), AI.noticeSeconds + DT * 2);
  return m;
}

describe('Brain: calm states', () => {
  it('rises first when the def rises, then idles', () => {
    const { brain, spy } = make(ASH_WRAITH, { rise: true });
    expect(brain.state).toBe('spawn');
    brain.step(DT, senses({ notices: true }));
    expect(brain.state).toBe('spawn');
    run(brain, senses(), AI.riseSeconds + DT);
    expect(spy.states).toContain('idle');
  });

  it('patrols through every waypoint and loops back to the first', () => {
    const patrol = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ];
    const { brain } = make(ASH_WRAITH, { patrol });
    const goals: string[] = [];
    let pos = { x: 0, z: 0 };
    for (let i = 0; i < 2000; i++) {
      const it = brain.step(DT, senses({ self: pos, targetId: null, targetPos: null, distance: Infinity }));
      expect(brain.state).toBe('patrol');
      if (it.goal) {
        const key = `${it.goal.x},${it.goal.z}`;
        if (goals[goals.length - 1] !== key) goals.push(key);
        pos = { ...it.goal }; // teleport to the goal: arrival is what is tested
      }
    }
    expect(goals.slice(0, 3)).toEqual(['10,0', '0,0', '10,0']);
  });

  it('skips an unreachable waypoint when steering gives up', () => {
    const { brain } = make(ASH_WRAITH, { patrol: [{ x: 10, z: 0 }, { x: -10, z: 0 }] });
    const a = brain.step(DT, senses({ targetId: null, targetPos: null }));
    expect(a.goal).toEqual({ x: 10, z: 0 });
    const b = brain.step(DT, senses({ targetId: null, targetPos: null, stuckGiveUp: true }));
    expect(b.goal).toEqual({ x: -10, z: 0 });
  });

  it('walks home when idle away from home', () => {
    const { brain } = make();
    const it = brain.step(DT, senses({ self: { x: 5, z: 0 }, targetId: null, targetPos: null }));
    expect(it.goal).toEqual({ x: 0, z: 0 });
  });
});

describe('Brain: notice, chase and attack', () => {
  it('notices, turns, then chases with ai.aggro exactly once and alerts the pack', () => {
    const { brain, spy } = engaged();
    expect(brain.state).toBe('chase');
    expect(spy.count('aggro:player')).toBe(1);
    expect(spy.count('pack:player')).toBe(1);
    run(brain, senses({ distance: 5 }), 1);
    expect(spy.count('aggro:player')).toBe(1);
  });

  it('does not notice a dead player, and notices again after a revive', () => {
    const { brain } = make();
    run(brain, senses({ notices: true, targetAlive: false }), 1);
    expect(brain.state).toBe('idle');
    brain.step(DT, senses({ notices: true }));
    expect(brain.state).toBe('notice');
  });

  it('telegraph, attack, recover, chase, with the telegraph payload and the token released', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    expect(brain.state).toBe('telegraph');
    expect(spy.log).toContain(`telegraph:wraith.claw:1:${ASH_WRAITH.moves[0].windup}`);
    brain.windowOpened(1);
    expect(brain.state).toBe('attack');
    brain.attackClipEnded(1, false);
    expect(brain.state).toBe('recover');
    run(brain, senses({ distance: 3 }), ASH_WRAITH.moves[0].recover + DT * 2);
    expect(brain.state).toBe('chase');
    expect(spy.count('untoken')).toBe(1);
    expect(spy.count('tcancel:1')).toBe(0);
  });

  it('ignores window and clip events from an old swing', () => {
    const { brain } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.windowOpened(99);
    expect(brain.state).toBe('telegraph');
    brain.attackClipEnded(99, false);
    expect(brain.state).toBe('telegraph');
  });

  it('only starts a move when facing the target', () => {
    const { brain } = engaged();
    brain.step(DT, senses({ distance: 1, facingErrorDeg: AI.attackFacingDegrees + 5 }));
    expect(brain.state).toBe('chase');
  });

  it('keeps chasing when the move filter leaves nothing in range', () => {
    const { brain, spy } = engaged();
    spy.move = null;
    const it = brain.step(DT, senses({ distance: 1 }));
    expect(brain.state).toBe('chase');
    expect(it.goal).not.toBeNull();
  });

  it('a third attacker circles instead of attacking (two tokens per target)', () => {
    const shared = new Map<string, number>();
    const brains = [0, 1, 2].map(() => {
      const m = engaged();
      m.spy.tokens = shared;
      return m;
    });
    const intents = brains.map((m) => m.brain.step(DT, senses({ distance: 1 })));
    expect(brains.map((m) => m.brain.state)).toEqual(['telegraph', 'telegraph', 'chase']);
    expect(intents[2].goal).not.toBeNull();
  });

  it('a start that fails (missing clip) keeps chasing', () => {
    const { brain, spy } = engaged();
    spy.startAttack = () => -1;
    brain.step(DT, senses({ distance: 1 }));
    expect(brain.state).toBe('chase');
  });
});

describe('Brain: interruptions', () => {
  it('target dies mid-chase: calm, return, no further telegraph', () => {
    const { brain, spy } = engaged();
    brain.targetGone('player');
    expect(brain.state).toBe('return');
    expect(spy.count('calm')).toBe(1);
    run(brain, senses({ distance: 1, targetAlive: false }), 1);
    expect(spy.log.filter((l) => l.startsWith('telegraph')).length).toBe(0);
  });

  it('target dies mid-telegraph: telegraph.cancelled once, calm once', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.targetGone('player');
    expect(spy.count('tcancel:1')).toBe(1);
    expect(spy.count('cancel')).toBe(1);
    expect(spy.count('calm')).toBe(1);
  });

  it('a dead target seen through the senses is dropped as well', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ targetAlive: false }));
    expect(brain.state).toBe('return');
    expect(spy.count('calm')).toBe(1);
  });

  it('stagger during the telegraph: no attack, cancelled once, token freed', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.staggered('player');
    expect(brain.state).toBe('stagger');
    expect(spy.count('tcancel:1')).toBe(1);
    expect(spy.count('untoken')).toBe(1);
    brain.windowOpened(1);
    expect(brain.state).toBe('stagger');
  });

  it('stagger inside the active window cancels the clip but sends no telegraph.cancelled', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.windowOpened(1);
    brain.staggered('player');
    expect(spy.count('cancel')).toBe(1);
    expect(spy.count('tcancel:1')).toBe(0);
  });

  it('stagger lasts the break time, then chases again', () => {
    const { brain } = engaged();
    brain.staggered('player');
    run(brain, senses(), AI.breakStaggerSeconds - 0.1);
    expect(brain.state).toBe('stagger');
    run(brain, senses(), 0.2);
    expect(brain.state).toBe('chase');
  });

  it('a light hit during the telegraph flinches and cancels it', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.hit('player', 5, 'hit');
    expect(brain.state).toBe('chase');
    expect(spy.count('flinch')).toBe(1);
    expect(spy.count('tcancel:1')).toBe(1);
    // flinching: no new swing for the flinch time
    brain.step(DT, senses({ distance: 1 }));
    expect(brain.state).toBe('chase');
    run(brain, senses({ distance: 1 }), AI.flinchSeconds);
    expect(brain.state).toBe('telegraph');
  });

  it('a light hit inside the active window does not interrupt the swing', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.windowOpened(1);
    brain.hit('player', 5, 'hit');
    expect(brain.state).toBe('attack');
    expect(spy.count('flinch')).toBe(0);
  });

  it('a heavy hit staggers with knockback', () => {
    const { brain, spy } = engaged();
    brain.hit('player', AI.heavyPoise, 'hit');
    expect(brain.state).toBe('stagger');
    expect(spy.count('knockback')).toBe(1);
  });

  it('blocked, parried or immune results cause no reaction', () => {
    const { brain, spy } = engaged();
    for (const o of ['blocked', 'parried', 'immune']) brain.hit('player', 50, o);
    expect(brain.state).toBe('chase');
    expect(spy.count('flinch') + spy.count('knockback')).toBe(0);
  });

  it('a hit from behind while idle aggroes at once', () => {
    const { brain, spy } = make();
    brain.hit('player', 1, 'hit');
    expect(brain.state).toBe('chase');
    expect(spy.count('aggro:player')).toBe(1);
  });

  it('death in every state goes to dead once with calm once', () => {
    const states: Array<(b: Brain) => void> = [
      () => {},
      (b) => b.step(DT, senses({ distance: 1 })),
      (b) => {
        b.step(DT, senses({ distance: 1 }));
        b.windowOpened(1);
      },
      (b) => b.staggered('player'),
    ];
    for (const prep of states) {
      const { brain, spy } = engaged();
      prep(brain);
      brain.died();
      brain.died();
      expect(brain.state).toBe('dead');
      expect(spy.count('calm')).toBe(1);
      expect(spy.states.filter((s) => s === 'dead').length).toBe(1);
      // events after death are ignored
      brain.hit('player', 50, 'hit');
      brain.staggered('player');
      brain.alert('player');
      expect(brain.state).toBe('dead');
    }
  });

  it('death during the telegraph sends telegraph.cancelled once', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.died();
    expect(spy.count('tcancel:1')).toBe(1);
  });
});

describe('Brain: leash', () => {
  const away = { x: 0, z: -10 };
  it('returns home when the target is beyond the leash radius, then refills', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ self: away, targetPos: { x: 0, z: -AI.leashRadius - 1 }, distance: AI.leashRadius }));
    brain.step(DT, senses({ self: away, targetPos: { x: 0, z: -AI.leashRadius - 1 }, distance: AI.leashRadius }));
    expect(brain.state).toBe('return');
    expect(spy.count('calm')).toBe(1);
    brain.step(DT, senses({ self: { x: 0, z: 0.2 } }));
    expect(spy.count('refill')).toBe(1);
    expect(brain.state).toBe('idle');
  });

  it('returns after losing sight for 5 s', () => {
    const { brain } = engaged();
    run(brain, senses({ self: away, sees: false, distance: 10 }), AI.lostSightSeconds + 0.1);
    expect(brain.state).toBe('return');
  });

  it('a leash mid-swing lets the swing finish, then returns', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.windowOpened(1);
    brain.step(DT, senses({ targetPos: { x: 0, z: -40 }, distance: 1 }));
    expect(brain.state).toBe('attack');
    brain.attackClipEnded(1, false);
    run(brain, senses({ self: away, targetPos: { x: 0, z: -40 } }), ASH_WRAITH.moves[0].recover + 0.05);
    expect(brain.state).toBe('return');
    expect(spy.count('tcancel:1')).toBe(0);
  });

  it('a leash during the telegraph cancels it', () => {
    const { brain, spy } = engaged();
    brain.step(DT, senses({ distance: 1 }));
    brain.step(DT, senses({ targetPos: { x: 0, z: -40 }, distance: 1 }));
    expect(brain.state).toBe('return');
    expect(spy.count('tcancel:1')).toBe(1);
  });

  it('with leash off it keeps chasing far from home and does not give up when stuck', () => {
    const { brain } = engaged(ASH_WRAITH, { leash: false });
    run(brain, senses({ targetPos: { x: 0, z: -80 }, distance: 80, sees: false, stuckGiveUp: true }), 6);
    expect(brain.state).toBe('chase');
  });

  it('gives up when steering is stuck (leashed)', () => {
    const { brain } = engaged();
    brain.step(DT, senses({ stuckGiveUp: true }));
    expect(brain.state).toBe('return');
  });

  it('being hit on the way home re-engages', () => {
    const { brain, spy } = engaged();
    brain.targetGone('player');
    brain.hit('player', 1, 'hit');
    expect(brain.state).toBe('chase');
    expect(spy.count('aggro:player')).toBe(2);
  });
});

describe('Brain: pack and spawn aggro', () => {
  it('an alert puts an idle pack mate into notice, then chase', () => {
    const { brain, spy } = make();
    brain.alert('player');
    expect(brain.state).toBe('notice');
    run(brain, senses(), AI.noticeSeconds + DT * 2);
    expect(brain.state).toBe('chase');
    expect(spy.count('aggro:player')).toBe(1);
  });

  it('aggro on spawn chases as soon as the rise ends', () => {
    const { brain } = make(ASH_WRAITH, { rise: true, aggroOnSpawn: 'player' });
    run(brain, senses(), AI.riseSeconds + DT * 3);
    expect(brain.state).toBe('chase');
  });
});

describe('Brain: yield and mercy states', () => {
  const soldier = () => engaged(BLIGHTED_SOLDIER);

  it('a poise break under 50% health yields only while Spare is unlocked', () => {
    const a = soldier();
    a.brain.setCondition(0.4, false);
    a.brain.staggered('player');
    expect(a.brain.state).toBe('stagger');

    const b = soldier();
    b.brain.setCondition(0.4, true);
    b.brain.staggered('player');
    expect(b.brain.state).toBe('yield');
    expect(b.spy.count(`yield:${AI.yieldSeconds}`)).toBe(1);
    expect(b.brain.mercyOpen).toBe(true);
  });

  it('above 50% health it staggers even with Spare unlocked', () => {
    const { brain } = soldier();
    brain.setCondition(0.6, true);
    brain.staggered('player');
    expect(brain.state).toBe('stagger');
    expect(brain.mercyOpen).toBe(false);
  });

  it('a wraith never yields; its stagger is mercy-open', () => {
    const { brain } = engaged();
    brain.setCondition(0.1, true);
    brain.staggered('player');
    expect(brain.state).toBe('stagger');
    expect(brain.mercyOpen).toBe(true);
  });

  it('yield times out back into the fight', () => {
    const { brain } = soldier();
    brain.setCondition(0.4, true);
    brain.staggered('player');
    run(brain, senses(), AI.yieldSeconds + 0.05);
    expect(brain.state).toBe('chase');
  });

  it('a hit during the yield ends it', () => {
    const { brain } = soldier();
    brain.setCondition(0.4, true);
    brain.staggered('player');
    brain.hit('player', 1, 'hit');
    expect(brain.state).toBe('chase');
  });

  it('released and spared are final; mercy on an already-mercied enemy is ignored', () => {
    const { brain, spy } = engaged();
    brain.staggered('player');
    brain.released();
    brain.released();
    brain.spared();
    expect(brain.state).toBe('released');
    expect(spy.count('calm')).toBe(1);
    expect(brain.mercyOpen).toBe(false);
  });

  it('a revoked spare turns hostile and chases the striker', () => {
    const { brain, spy } = soldier();
    brain.setCondition(0.4, true);
    brain.staggered('player');
    brain.spared();
    expect(brain.state).toBe('spared');
    brain.revoked('player');
    expect(brain.state).toBe('chase');
    expect(spy.count('aggro:player')).toBe(2);
  });

  it('revoked on an enemy that is not spared does nothing', () => {
    const { brain } = engaged();
    brain.revoked('player');
    expect(brain.state).toBe('chase');
  });
});

describe('Brain: flee', () => {
  it('flees below fleeAtHealth with a def that has it', () => {
    const def: EnemyDef = { ...ASH_WRAITH, fleeAtHealth: 0.15 };
    const { brain } = engaged(def);
    const it = brain.step(DT, senses({ healthFraction: 0.1 }));
    expect(brain.state).toBe('flee');
    expect(it.goal!.z).toBeGreaterThan(0); // away from the target at z = -5
  });

  it('never flees without fleeAtHealth', () => {
    const { brain } = engaged();
    brain.step(DT, senses({ healthFraction: 0.01 }));
    expect(brain.state).not.toBe('flee');
  });
});

describe('Brain: robustness', () => {
  it('a zero, negative or NaN dt changes nothing', () => {
    const { brain } = engaged();
    for (const dt of [0, -1, NaN]) brain.step(dt, senses({ distance: 1 }));
    expect(brain.state).toBe('chase');
  });
});
