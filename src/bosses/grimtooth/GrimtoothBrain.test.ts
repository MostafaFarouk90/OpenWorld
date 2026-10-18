import { describe, expect, it } from 'vitest';
import { GrimtoothBrain, type GrimtoothHooks, type GrimtoothSense } from './GrimtoothBrain';
import { GRIMTOOTH, HOWLS, MOVES, POUNCE } from './tuning';

const DT = 1 / 60;

function make(rng: () => number = () => 0) {
  const calls: string[] = [];
  const hooks: GrimtoothHooks = {
    telegraph: (m, s, lead) => calls.push(`telegraph:${m.id}:${s}:${lead}`),
    telegraphCancelled: (s) => calls.push(`cancel:${s}`),
    aim: (m, s) => calls.push(`aim:${m.id}:${s}`),
    leapStart: (s) => calls.push(`leapStart:${s}`),
    leapTick: (s, t) => calls.push(`leapTick:${s}:${t.toFixed(2)}`),
    leapEnd: (s, i) => calls.push(`leapEnd:${s}:${i}`),
    strike: (m, s) => calls.push(`strike:${m.id}:${s}`),
    backstep: () => calls.push('backstep'),
    howlStart: () => calls.push('howlStart'),
    howlRelease: (n) => calls.push(`howlRelease:${n}`),
    stagger: () => calls.push('stagger'),
    window: () => calls.push('window'),
    restorePoise: () => calls.push('poise'),
  };
  const brain = new GrimtoothBrain(hooks, rng);
  const sense: GrimtoothSense = { dist: 5, liveSummons: 0 };
  const run = (seconds: number) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) brain.tick(DT, sense);
  };
  const count = (c: string) => calls.filter((x) => x === c).length;
  return { brain, calls, sense, run, count };
}

/** Starts the fight and runs one (minimum) circle plus a hair, with the player at the given distance. */
function atDecision(dist: number) {
  const s = make();
  s.sense.dist = dist;
  s.brain.start();
  s.run(GRIMTOOTH.circleSecondsMin - 0.05);
  s.calls.length = 0;
  return s;
}

/** Ticks until the state matches (bounded). */
function until(s: ReturnType<typeof make>, state: string, max = 30) {
  for (let i = 0; i < max * 60 && s.brain.state !== state; i++) s.brain.tick(DT, s.sense);
  expect(s.brain.state).toBe(state);
}

describe('GrimtoothBrain', () => {
  it('does nothing before start and ignores bad dt', () => {
    const s = make();
    s.brain.tick(NaN, s.sense);
    s.brain.tick(-1, s.sense);
    s.run(30);
    expect(s.brain.state).toBe('idle');
    expect(s.brain.moving).toBe('none');
    expect(s.calls).toEqual([]);
    s.brain.start();
    expect(s.brain.state).toBe('circle');
    expect(s.brain.moving).toBe('circle');
    s.brain.start(); // ignored
    expect(s.brain.state).toBe('circle');
  });

  it('circle lasts a duration drawn from rng between the min and max', () => {
    for (const [r, secs] of [
      [0, GRIMTOOTH.circleSecondsMin],
      [1, GRIMTOOTH.circleSecondsMax],
    ] as const) {
      const s = make(() => r);
      s.sense.dist = 20;
      s.brain.start();
      s.run(secs - 0.05);
      expect(s.brain.state).toBe('circle');
      s.run(0.1);
      expect(s.brain.state).toBe('close');
      expect(s.brain.moving).toBe('close');
    }
  });

  it('pounce in range: crouch telegraph, aim once at the lock time, take-off, leap ticks, landing, recover', () => {
    const s = atDecision(5);
    s.run(0.1);
    expect(s.brain.state).toBe('crouch');
    expect(s.calls).toEqual([`telegraph:pounce:1:${MOVES.pounce.windup}`]);
    s.run(MOVES.pounce.windup - POUNCE.aimLockBefore - 0.1);
    expect(s.calls).not.toContain('aim:pounce:1');
    s.run(0.15);
    expect(s.count('aim:pounce:1')).toBe(1);
    expect(s.calls).not.toContain('leapStart:1');
    s.run(POUNCE.aimLockBefore + DT);
    expect(s.count('aim:pounce:1')).toBe(1);
    expect(s.calls.indexOf('aim:pounce:1')).toBeLessThan(s.calls.indexOf('leapStart:1'));
    expect(s.brain.state).toBe('leap');
    s.calls.length = 0;
    s.run(POUNCE.airSeconds + DT);
    const ticks = s.calls.filter((c) => c.startsWith('leapTick'));
    expect(ticks.length).toBeGreaterThan(10);
    const ts = ticks.map((c) => Number(c.split(':')[2]));
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(ts.at(-1)).toBe(1);
    expect(s.calls.at(-1)).toBe('leapEnd:1:false');
    expect(s.calls.indexOf('leapEnd:1:false')).toBe(s.calls.length - 1);
    expect(s.brain.state).toBe('recover');
    s.run(MOVES.pounce.recover + DT);
    expect(s.brain.state).toBe('circle');
  });

  it('pounce range is inclusive at both ends', () => {
    for (const d of MOVES.pounce.range) {
      const s = atDecision(d);
      s.run(0.1);
      expect(s.brain.state).toBe('crouch');
    }
  });

  it('bite in range (inside pounce range): telegraph, strike at the end of the windup, recover', () => {
    const s = atDecision(1.5);
    s.run(0.1);
    expect(s.brain.state).toBe('bite');
    expect(s.calls).toEqual([`telegraph:bite:1:${MOVES.bite.windup}`]);
    s.run(MOVES.bite.windup - 0.1);
    expect(s.calls).not.toContain('strike:bite:1');
    s.run(0.1);
    expect(s.calls).toContain('strike:bite:1');
    expect(s.brain.state).toBe('recover');
    s.run(MOVES.bite.recover + DT);
    expect(s.brain.state).toBe('circle');
  });

  it('far beyond pounce range: closes first, then bites once inside bite range', () => {
    const s = atDecision(15);
    s.run(0.1);
    expect(s.brain.state).toBe('close');
    expect(s.calls).toEqual([]);
    s.run(1);
    expect(s.brain.state).toBe('close');
    s.sense.dist = MOVES.pounce.range[1] - 0.5;
    s.run(DT);
    expect(s.brain.state).toBe('crouch'); // close also pounces once in range
    const t = make();
    t.sense.dist = 15;
    t.brain.start();
    until(t, 'close');
    t.sense.dist = MOVES.bite.range[1];
    t.run(DT);
    expect(t.brain.state).toBe('bite');
  });

  it('a gap between bite and pounce range keeps closing', () => {
    const s = atDecision((MOVES.bite.range[1] + MOVES.pounce.range[0]) / 2);
    s.run(0.2);
    expect(s.brain.state).toBe('close');
    expect(s.calls).toEqual([]);
  });

  it('cooldowns are respected: no second bite or pounce until they expire', () => {
    const s = make();
    s.sense.dist = 1.5;
    s.brain.start();
    until(s, 'bite');
    until(s, 'recover');
    until(s, 'circle');
    // bite cooldown (1.6) outlasts recover (0.7) + the 1.5 s circle? 0.7 + 1.5 = 2.2 > 1.6, so force a short check instead
    const s2 = make();
    s2.sense.dist = 1.5;
    s2.brain.start();
    s2.run(GRIMTOOTH.circleSecondsMin + 0.05);
    s2.run(MOVES.bite.windup + 0.05);
    expect(s2.brain.state).toBe('recover');
    s2.brain.onBreak(); // cooldown keeps ticking through the stagger
    s2.run(GRIMTOOTH.breakSeconds + 0.05);
    expect(s2.brain.state).toBe('circle');
    expect(s2.count('strike:bite:1')).toBe(1);
    // pounce: after it, in a 4 s cooldown a circle that ends early falls through to close
    const p = make();
    p.sense.dist = 5;
    p.brain.start();
    until(p, 'leap');
    until(p, 'circle');
    p.run(GRIMTOOTH.circleSecondsMin + 0.05);
    // recover 1.1 + circle 1.5 = 2.6 < 4 s cooldown: closes instead of a second pounce
    expect(p.brain.state).toBe('close');
    expect(p.count('leapStart:1')).toBe(1);
    expect(p.calls.filter((c) => c.startsWith('telegraph:pounce')).length).toBe(1);
    p.run(MOVES.pounce.cooldown);
    expect(p.calls.filter((c) => c.startsWith('telegraph:pounce')).length).toBe(2);
  });

  it('a break during the crouch cancels the telegraph, staggers, then restores poise after breakSeconds', () => {
    const s = atDecision(5);
    s.run(0.3);
    expect(s.brain.state).toBe('crouch');
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['cancel:1', 'stagger']);
    expect(s.brain.state).toBe('broken');
    expect(s.brain.moving).toBe('none');
    s.run(GRIMTOOTH.breakSeconds - 0.05);
    expect(s.calls).not.toContain('poise');
    s.run(0.1);
    expect(s.calls).toEqual(['cancel:1', 'stagger', 'poise']);
    expect(s.brain.state).toBe('circle');
    expect(s.calls).not.toContain('leapStart:1');
  });

  it('a break during a bite windup cancels it too', () => {
    const s = atDecision(1);
    s.run(0.2);
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['cancel:1', 'stagger']);
  });

  it('a break mid-leap ends the leap interrupted, with no landing', () => {
    const s = atDecision(5);
    until(s, 'leap');
    s.run(0.1);
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['leapEnd:1:true', 'stagger']);
    s.run(1);
    expect(s.calls.filter((c) => c.startsWith('leapTick'))).toEqual([]);
    expect(s.calls).not.toContain('leapEnd:1:false');
  });

  it('a break during recover staggers without a cancel hook', () => {
    const s = atDecision(1);
    until(s, 'recover');
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['stagger']);
  });

  it('a break during the backstep staggers without a cancel hook', () => {
    const s = make();
    s.sense.dist = 2.4;
    s.brain.start();
    until(s, 'backstep', GRIMTOOTH.campSeconds + 2);
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['stagger']);
  });

  it('camping backstep fires after campSeconds with no move started, and ends in circle', () => {
    // Keep bite and pounce on cooldown out of reach: stay at 2.4 m (inside campDistance 2.5, outside bite range 2.2).
    const s = make();
    s.sense.dist = 2.4;
    s.brain.start();
    s.run(GRIMTOOTH.campSeconds - 0.2);
    expect(s.calls).not.toContain('backstep');
    expect(s.brain.state).toBe('close');
    expect(s.brain.moving).toBe('close');
    s.run(0.3);
    expect(s.calls).toEqual(['backstep']);
    expect(s.brain.state).toBe('backstep');
    expect(s.brain.moving).toBe('backstep');
    s.run(GRIMTOOTH.backstepSeconds + DT);
    expect(s.brain.state).toBe('circle');
    expect(s.count('backstep')).toBe(1);
  });

  it('the camp timer resets when the player steps away', () => {
    const s = make();
    s.sense.dist = 2.4;
    s.brain.start();
    s.run(GRIMTOOTH.campSeconds - 1);
    s.sense.dist = GRIMTOOTH.campDistance; // exactly at the distance is not camping
    s.run(DT * 3);
    s.sense.dist = 2.4;
    s.run(GRIMTOOTH.campSeconds - 1);
    expect(s.calls).not.toContain('backstep');
    s.run(1.2);
    expect(s.calls).toContain('backstep');
  });

  it('a player hugging him at 1.5 m gets a backstep even though he keeps biting (bites do not reset the camp timer)', () => {
    const s = make();
    s.sense.dist = 1.5;
    s.brain.start();
    s.run(GRIMTOOTH.campSeconds - 0.5);
    expect(s.calls.filter((c) => c.startsWith('strike:bite')).length).toBeGreaterThan(1);
    expect(s.calls).not.toContain('backstep');
    s.run(1.5);
    expect(s.count('backstep')).toBe(1);
  });

  it('a backstep that comes due mid-bite cancels the bite telegraph first', () => {
    const s = make();
    s.sense.dist = 1.5;
    s.brain.start();
    let guard = 0;
    while (!s.calls.includes('backstep') && guard++ < 2000) s.run(DT);
    const i = s.calls.indexOf('backstep');
    // Every telegraph before the backstep was either struck or cancelled.
    const before = s.calls.slice(0, i);
    const telegraphs = before.filter((c) => c.startsWith('telegraph:')).length;
    const ends = before.filter((c) => c.startsWith('strike') || c.startsWith('cancel') || c.startsWith('leapStart')).length;
    expect(ends).toBe(telegraphs);
  });

  it('phase 2 howl releases 2 hounds; there is no howl in phase 1', () => {
    const s = make();
    s.brain.start();
    s.run(30);
    expect(s.calls).not.toContain('howlStart');
    s.brain.onPhase(2);
    expect(s.brain.phase).toBe(2);
    until(s, 'howl');
    expect(s.calls.at(-1)).toBe('howlStart');
    s.calls.length = 0;
    s.run(GRIMTOOTH.howlSeconds - 0.1);
    expect(s.calls).not.toContain('howlRelease:2');
    s.run(0.2);
    expect(s.calls).toEqual([`howlRelease:${HOWLS.counts[0]}`]);
    expect(HOWLS.counts[0]).toBe(2);
    expect(s.brain.state).toBe('circle');
    expect(s.brain.wavesStarted).toBe(1);
  });

  it('phase 3 howl releases 3 hounds after the phase-2 one', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    s.run(10);
    s.brain.onPhase(3);
    s.run(10);
    expect(s.calls.filter((c) => c.startsWith('howlRelease'))).toEqual(['howlRelease:2', 'howlRelease:3']);
    expect(s.brain.wavesStarted).toBe(2);
  });

  it('a double phase-cross plays one howl, the later count', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    s.brain.onPhase(3);
    s.run(30);
    expect(s.calls.filter((c) => c === 'howlStart').length).toBe(1);
    expect(s.calls.filter((c) => c.startsWith('howlRelease'))).toEqual([`howlRelease:${HOWLS.counts[1]}`]);
    expect(s.brain.wavesStarted).toBe(1);
  });

  it('repeated or lower phases and phases beyond the last wave queue nothing', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(1);
    s.brain.onPhase(4);
    s.run(30);
    expect(s.calls.filter((c) => c.startsWith('howl'))).toEqual([]);
  });

  it('the howl waits while summons live, then starts when they die', () => {
    const s = make();
    s.sense.liveSummons = 2;
    s.brain.start();
    s.brain.onPhase(2);
    s.run(20);
    expect(s.calls).not.toContain('howlStart');
    s.sense.liveSummons = 1;
    s.run(5);
    expect(s.calls).not.toContain('howlStart');
    s.sense.liveSummons = 0;
    s.run(10);
    expect(s.calls).toContain('howlStart');
  });

  it('a pending howl can also start at the end of recover', () => {
    const s = atDecision(1);
    until(s, 'recover');
    s.brain.onPhase(2);
    s.run(MOVES.bite.recover + DT);
    expect(s.brain.state).toBe('howl');
    expect(s.calls).toContain('howlStart');
  });

  it('a pending howl takes priority over a move when the circle ends', () => {
    const s = atDecision(5);
    s.brain.onPhase(2);
    s.run(0.1);
    expect(s.brain.state).toBe('howl');
    expect(s.calls).toEqual(['howlStart']);
  });

  it('an interrupted howl is re-cast once without being counted again; a second interruption spends it', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    until(s, 'howl');
    s.run(0.5);
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['stagger']);
    expect(s.brain.wavesStarted).toBe(1);
    until(s, 'howl');
    expect(s.brain.wavesStarted).toBe(1);
    expect(s.calls).toEqual(['stagger', 'poise', 'howlStart']);
    s.run(0.5);
    s.brain.onBreak(); // retries used up (HOWLS.retries = 1)
    s.run(30);
    expect(s.count('howlStart')).toBe(1); // calls were cleared before the first break: only the re-cast, never a third
    expect(s.calls.filter((c) => c.startsWith('howlRelease'))).toEqual([]);
    expect(s.brain.wavesStarted).toBe(1);
  });

  it('a re-cast howl that completes releases its hounds once', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    until(s, 'howl');
    s.brain.onBreak();
    s.run(30);
    expect(s.calls.filter((c) => c.startsWith('howlRelease'))).toEqual(['howlRelease:2']);
    expect(s.brain.wavesStarted).toBe(1);
  });

  it('wavesStarted never exceeds the number of howl waves', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    s.run(10);
    s.brain.onPhase(3);
    s.run(10);
    s.brain.onPhase(3);
    s.brain.onPhase(4);
    s.brain.onPhase(2);
    s.run(60);
    expect(s.brain.wavesStarted).toBe(HOWLS.counts.length);
    expect(s.count('howlStart')).toBe(HOWLS.counts.length);
  });

  it('the window drops a pending howl for good and a later phase-3 howl never starts', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    s.sense.liveSummons = 1; // keep it pending
    s.run(5);
    s.brain.onBreak();
    s.brain.onReleaseWindow(true);
    s.sense.liveSummons = 0;
    s.brain.onPhase(3); // arrives after the window opened
    s.run(10);
    s.brain.onReleaseWindow(false);
    s.run(30);
    expect(s.calls).not.toContain('howlStart');
    expect(s.brain.wavesStarted).toBe(0);
    expect(s.brain.phase).toBe(3);
  });

  it('a phase-3 event on the same tick as the window (before it) is also dropped', () => {
    const s = make();
    s.brain.start();
    s.run(0.2);
    s.brain.onPhase(3);
    s.brain.onBreak();
    s.brain.onReleaseWindow(true);
    s.brain.onReleaseWindow(false);
    s.run(30);
    expect(s.calls).not.toContain('howlStart');
  });

  it('a window opening mid-howl cancels it without a retry', () => {
    const s = make();
    s.brain.start();
    s.brain.onPhase(2);
    until(s, 'howl');
    s.calls.length = 0;
    s.brain.onReleaseWindow(true);
    expect(s.calls).toEqual(['window']);
    s.brain.onReleaseWindow(false);
    s.run(30);
    expect(s.calls).not.toContain('howlStart');
    expect(s.calls).not.toContain('howlRelease:2');
  });

  it('window: cancels the running action, stays open indefinitely, closes to circle, and reopens', () => {
    const s = atDecision(5);
    s.run(0.3);
    s.calls.length = 0;
    s.brain.onReleaseWindow(true);
    expect(s.calls).toEqual(['cancel:1', 'window']); // no stagger
    expect(s.brain.state).toBe('window');
    expect(s.brain.moving).toBe('none');
    s.brain.onReleaseWindow(true); // repeated open: no second hook
    expect(s.count('window')).toBe(1);
    s.run(60);
    expect(s.brain.state).toBe('window');
    s.brain.onReleaseWindow(false);
    expect(s.calls.slice(-1)).toEqual(['poise']);
    expect(s.brain.state).toBe('circle');
    s.brain.onReleaseWindow(false); // closing while not in the window changes nothing
    expect(s.count('poise')).toBe(1);
    s.run(0.5);
    s.brain.onReleaseWindow(true);
    expect(s.brain.state).toBe('window');
    expect(s.count('window')).toBe(2);
    s.brain.onReleaseWindow(false);
    expect(s.brain.state).toBe('circle');
  });

  it('a window opening mid-leap ends the leap interrupted', () => {
    const s = atDecision(5);
    until(s, 'leap');
    s.calls.length = 0;
    s.brain.onReleaseWindow(true);
    expect(s.calls).toEqual(['leapEnd:1:true', 'window']);
  });

  it('a window can open right after the last break while he is staggered', () => {
    const s = make();
    s.brain.start();
    s.run(0.2);
    s.brain.onBreak();
    s.brain.onReleaseWindow(true);
    expect(s.brain.state).toBe('window');
    s.run(5);
    expect(s.brain.state).toBe('window');
  });

  it('ignored breaks restore poise in idle, broken and window', () => {
    const s = make();
    s.brain.onBreak();
    expect(s.calls).toEqual(['poise']);
    s.brain.start();
    s.brain.onBreak();
    s.calls.length = 0;
    s.brain.onBreak(); // already broken
    expect(s.calls).toEqual(['poise']);
    expect(s.brain.state).toBe('broken');
    s.brain.onReleaseWindow(true);
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['poise']);
    expect(s.brain.state).toBe('window');
  });

  it('outcomes are terminal: calmed and dying cancel the action and ignore everything after', () => {
    const r = atDecision(5);
    r.run(0.3);
    r.calls.length = 0;
    r.brain.onOutcome('released');
    expect(r.calls).toEqual(['cancel:1']);
    expect(r.brain.state).toBe('calmed');
    r.brain.onBreak();
    r.brain.onPhase(2);
    r.brain.onReleaseWindow(true);
    r.brain.onReleaseWindow(false);
    r.brain.onOutcome('defeated');
    r.run(30);
    expect(r.calls).toEqual(['cancel:1']);
    expect(r.brain.state).toBe('calmed');
    expect(r.brain.moving).toBe('none');

    const d = atDecision(5);
    until(d, 'leap');
    d.calls.length = 0;
    d.brain.onOutcome('defeated');
    expect(d.calls).toEqual(['leapEnd:1:true']);
    expect(d.brain.state).toBe('dying');
    d.run(5);
    expect(d.calls).toEqual(['leapEnd:1:true']);
  });
});
