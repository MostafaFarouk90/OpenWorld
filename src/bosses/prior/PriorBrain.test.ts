import { describe, expect, it } from 'vitest';
import { PriorBrain, type PriorHooks, type PriorSense } from './PriorBrain';
import { MOVES, PRIOR, SUMMONS } from './tuning';

const DT = 1 / 60;

function make() {
  const calls: string[] = [];
  const hooks: PriorHooks = {
    telegraph: (m, s, lead) => calls.push(`telegraph:${m.id}:${s}:${lead}`),
    telegraphCancelled: (s) => calls.push(`cancel:${s}`),
    aim: (m) => calls.push(`aim:${m.id}`),
    strike: (m) => calls.push(`strike:${m.id}`),
    teleportOut: () => calls.push('out'),
    teleportIn: (d) => calls.push(`in:${d}`),
    arrived: () => calls.push('arrived'),
    summonStart: (o) => calls.push(`summon:${o ? 'opening' : 'resummon'}`),
    summonRelease: (n) => calls.push(`release:${n}`),
    stagger: () => calls.push('stagger'),
    kneel: () => calls.push('kneel'),
    restorePoise: () => calls.push('poise'),
  };
  const brain = new PriorBrain(hooks);
  const sense: PriorSense = { dist: 20, liveSummons: 0 };
  const run = (seconds: number) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) brain.tick(DT, sense);
  };
  return { brain, calls, sense, run };
}

/** Starts the fight and lets the phase-1 opening finish. */
function started() {
  const s = make();
  s.brain.start();
  s.run(PRIOR.summonCastSeconds + DT);
  s.sense.liveSummons = 2;
  return s;
}

describe('PriorBrain', () => {
  it('starts with the shielded phase-1 opening at the centre, then glides', () => {
    const s = make();
    expect(s.brain.state).toBe('idle');
    s.brain.start();
    expect(s.brain.state).toBe('summon');
    expect(s.calls).toEqual(['summon:opening']);
    s.run(PRIOR.summonCastSeconds - 0.1);
    expect(s.calls).not.toContain('release:2');
    s.run(0.2);
    expect(s.calls).toContain(`release:${SUMMONS.openingCount[0]}`);
    expect(s.brain.state).toBe('glide');
    s.brain.start(); // a second start is ignored
    expect(s.brain.wavesStarted).toBe(1);
  });

  it('ignores bad dt and does nothing before start', () => {
    const s = make();
    s.brain.tick(NaN, s.sense);
    s.brain.tick(-1, s.sense);
    s.run(30);
    expect(s.brain.state).toBe('idle');
    expect(s.calls).toEqual([]);
  });

  it('glides toward a distant player and stops inside the glide stop distance', () => {
    const s = started();
    s.sense.dist = 20;
    s.run(DT);
    expect(s.brain.moving).toBe(true);
    s.sense.dist = PRIOR.glideStopDistance - 0.1;
    s.calls.length = 0;
    // inside censer range the censer starts instead of moving
    s.run(DT);
    expect(s.brain.moving).toBe(false);
  });

  it('censer: 0.9 s red telegraph, strike, recover, cooldown', () => {
    const s = started();
    s.calls.length = 0;
    s.sense.dist = 3;
    s.run(DT);
    expect(s.brain.state).toBe('windup');
    expect(s.calls[0]).toBe(`telegraph:censer:1:${MOVES.censer.windup}`);
    expect(MOVES.censer.windup).toBe(0.9);
    expect(MOVES.censer.telegraph).toBe('dodge');
    s.run(0.85);
    expect(s.calls).not.toContain('strike:censer');
    s.run(0.1);
    expect(s.calls).toContain('strike:censer');
    expect(s.brain.state).toBe('recover');
    s.run(MOVES.censer.recover + DT);
    expect(s.brain.state).toBe('glide');
    // still on cooldown: no second telegraph right away
    s.calls.length = 0;
    s.run(0.5);
    expect(s.calls.filter((c) => c.startsWith('telegraph'))).toEqual([]);
  });

  it('chain: blockable telegraph, aims 0.15 s before the lash, only between 5 and 14 m', () => {
    const s = started();
    s.calls.length = 0;
    s.sense.dist = 15;
    s.run(0.2);
    expect(s.calls.filter((c) => c.startsWith('telegraph'))).toEqual([]);
    s.sense.dist = 8;
    s.run(DT);
    expect(s.calls[0]).toBe(`telegraph:chain:1:${MOVES.chain.windup}`);
    s.run(MOVES.chain.windup - 0.2);
    expect(s.calls).not.toContain('aim:chain');
    s.run(0.1);
    expect(s.calls).toContain('aim:chain');
    expect(s.calls).not.toContain('strike:chain');
    s.run(0.1);
    expect(s.calls.indexOf('aim:chain')).toBeLessThan(s.calls.indexOf('strike:chain'));
  });

  it('phase 2 cooldowns are shorter', () => {
    const a = started();
    const b = started();
    b.brain.onPhase(2);
    // let b's opening wave finish
    b.run(PRIOR.teleportOutSeconds + PRIOR.hiddenSeconds + PRIOR.teleportInSeconds + PRIOR.summonCastSeconds + 0.1);
    for (const s of [a, b]) {
      s.calls.length = 0;
      s.sense.dist = 3;
      s.run(MOVES.censer.windup + MOVES.censer.recover + MOVES.censer.cooldown * PRIOR.phase2Cooldown + 0.1);
    }
    expect(b.calls.filter((c) => c === 'strike:censer').length).toBe(2);
    expect(a.calls.filter((c) => c === 'strike:censer').length).toBe(1);
  });

  it('a break cancels a wind-up with telegraph.cancelled, staggers 1.2 s, restores poise, then teleports to a pillar', () => {
    const s = started();
    s.calls.length = 0;
    s.sense.dist = 3;
    s.run(0.3);
    s.brain.onBreak();
    expect(s.calls).toEqual(['telegraph:censer:1:0.9', 'cancel:1', 'stagger']);
    expect(s.brain.state).toBe('broken');
    s.run(PRIOR.breakSeconds - 0.05);
    expect(s.calls).not.toContain('poise');
    s.run(0.1);
    expect(s.calls.slice(-2)).toEqual(['poise', 'out']);
    expect(s.brain.present).toBe(false);
    s.sense.dist = 20;
    s.run(PRIOR.teleportOutSeconds + PRIOR.hiddenSeconds + 0.02);
    expect(s.calls).toContain('in:pillar');
    s.run(PRIOR.teleportInSeconds);
    expect(s.brain.state).toBe('glide');
    expect(s.brain.present).toBe(true);
  });

  it('a break during recover does not emit telegraph.cancelled', () => {
    const s = started();
    s.sense.dist = 3;
    s.run(MOVES.censer.windup + 0.05);
    expect(s.brain.state).toBe('recover');
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual(['stagger']);
  });

  it('breaks are ignored while he is away or kneeling', () => {
    const s = started();
    s.brain.onBreak();
    s.run(PRIOR.breakSeconds + 0.05);
    expect(s.brain.state).toBe('teleportOut');
    s.calls.length = 0;
    s.brain.onBreak();
    // ignored, but his poise is refilled so it never stays empty
    expect(s.calls).toEqual(['poise']);
    expect(s.brain.state).toBe('teleportOut');
    s.brain.onReleaseWindow(true);
    expect(s.brain.state).toBe('kneel');
    s.calls.length = 0;
    s.brain.onBreak();
    expect(s.calls).toEqual([]);
  });

  it('phase 2 queues an opening: no shield on the crossing hit, then centre and a shielded cast of 3', () => {
    const s = started();
    s.calls.length = 0;
    // the registry delivers boss.phase first, then the break of the same hit
    s.brain.onPhase(2);
    expect(s.calls).toEqual([]);
    s.brain.onBreak();
    expect(s.calls).toEqual(['stagger']);
    s.run(PRIOR.breakSeconds + 0.05);
    s.run(PRIOR.teleportOutSeconds + PRIOR.hiddenSeconds + 0.05);
    expect(s.calls).toContain('in:centre');
    s.run(PRIOR.teleportInSeconds);
    expect(s.calls).toContain('summon:opening');
    s.run(PRIOR.summonCastSeconds + 0.05);
    expect(s.calls).toContain(`release:${SUMMONS.openingCount[1]}`);
    expect(s.brain.phase).toBe(2);
    expect(s.brain.wavesStarted).toBe(2);
  });

  it('a phase change while gliding teleports to the centre at once; a repeated or lower phase is ignored', () => {
    const s = started();
    s.calls.length = 0;
    s.brain.onPhase(2);
    s.brain.onPhase(2);
    s.brain.onPhase(1);
    s.run(DT);
    expect(s.calls).toEqual(['out']);
    s.run(3.5);
    expect(s.calls.filter((c) => c === 'summon:opening').length).toBe(1);
  });

  it('re-summons once per phase, unshielded, 25 s after the last wave and only with fewer than 2 live summons', () => {
    const s = started();
    s.sense.dist = 20;
    s.sense.liveSummons = 2;
    s.calls.length = 0;
    s.run(SUMMONS.resummonAfter + 1);
    expect(s.calls).not.toContain('summon:resummon');
    s.sense.liveSummons = 1;
    s.run(DT);
    expect(s.calls).toContain('out');
    s.run(1.2);
    expect(s.calls).toContain('summon:resummon');
    s.run(PRIOR.summonCastSeconds + 0.05);
    expect(s.calls).toContain(`release:${SUMMONS.resummonCount}`);
    // no second re-summon in phase 1, however long
    s.sense.liveSummons = 0;
    s.calls.length = 0;
    s.run(120);
    expect(s.calls).not.toContain('summon:resummon');
    expect(s.brain.wavesStarted).toBe(2);
  });

  it('caps the whole fight at four waves: two openings and one re-summon per phase', () => {
    const s = started();
    s.sense.dist = 20;
    s.sense.liveSummons = 0;
    s.run(60);
    s.brain.onPhase(2);
    s.run(200);
    expect(s.brain.wavesStarted).toBe(4);
    s.brain.onPhase(3); // no third opening exists
    s.run(100);
    expect(s.brain.wavesStarted).toBe(4);
  });

  it('a break during an unshielded re-summon spends the wave', () => {
    const s = started();
    s.sense.dist = 20;
    s.sense.liveSummons = 0;
    for (let i = 0; i < 60 * 40 && s.brain.state !== 'summon'; i++) s.brain.tick(DT, s.sense);
    expect(s.brain.state).toBe('summon');
    s.calls.length = 0;
    s.brain.onBreak();
    s.run(5);
    expect(s.calls).not.toContain(`release:${SUMMONS.resummonCount}`);
    expect(s.calls).not.toContain('summon:resummon');
  });

  it('teleports away after 10 s of the player camping in censer range', () => {
    const s = started();
    s.sense.dist = 4;
    s.calls.length = 0;
    s.run(PRIOR.campSeconds - 0.2);
    expect(s.calls).not.toContain('out');
    s.run(1.5);
    expect(s.calls).toContain('out');
  });

  it('the camp timer resets when the player steps out of range', () => {
    const s = started();
    s.calls.length = 0;
    s.sense.dist = 4;
    s.run(6);
    s.sense.dist = 20;
    s.run(0.1);
    s.sense.dist = 4;
    s.run(6);
    expect(s.calls).not.toContain('out');
  });

  it('kneels for the release window and fights on when it closes unused', () => {
    const s = started();
    s.sense.dist = 3;
    s.run(0.2);
    s.calls.length = 0;
    s.brain.onBreak();
    s.brain.onReleaseWindow(true);
    expect(s.calls).toEqual(['cancel:1', 'stagger', 'kneel']);
    s.brain.onReleaseWindow(true);
    expect(s.calls.filter((c) => c === 'kneel').length).toBe(1);
    s.run(10); // the window length is the registry's; the brain just waits
    expect(s.brain.state).toBe('kneel');
    s.brain.onReleaseWindow(false);
    expect(s.calls.slice(-2)).toEqual(['poise', 'out']);
    s.run(2);
    expect(['glide', 'windup', 'recover']).toContain(s.brain.state);
  });

  it('a window closing while not kneeling changes nothing', () => {
    const s = started();
    s.calls.length = 0;
    s.brain.onReleaseWindow(false);
    expect(s.calls).toEqual([]);
    expect(s.brain.state).toBe('glide');
  });

  it('outcomes are terminal: released and dying ignore everything after', () => {
    const r = started();
    r.sense.dist = 3;
    r.run(0.2);
    r.calls.length = 0;
    r.brain.onOutcome('released');
    expect(r.calls).toEqual(['cancel:1']);
    expect(r.brain.state).toBe('released');
    r.brain.onBreak();
    r.brain.onPhase(2);
    r.brain.onReleaseWindow(true);
    r.brain.onOutcome('defeated');
    r.run(30);
    expect(r.calls).toEqual(['cancel:1']);
    expect(r.brain.state).toBe('released');

    const d = started();
    d.brain.onOutcome('defeated');
    expect(d.brain.state).toBe('dying');
  });

  it('the arrival hook fires when the fade-in ends, not when it starts', () => {
    const s = started();
    s.brain.onBreak();
    s.run(PRIOR.breakSeconds + PRIOR.teleportOutSeconds + PRIOR.hiddenSeconds + 0.05);
    expect(s.calls).toContain('in:pillar');
    expect(s.calls).not.toContain('arrived');
    expect(s.brain.state).toBe('teleportIn');
    s.run(PRIOR.teleportInSeconds);
    expect(s.calls.at(-1) === 'arrived' || s.calls.includes('arrived')).toBe(true);
    expect(s.brain.present).toBe(true);
  });

  it('a break during the shielded phase-2 opening cast re-casts it unshielded after the stagger, without counting a wave', () => {
    const s = started();
    s.sense.dist = 20;
    s.brain.onPhase(2);
    s.run(PRIOR.teleportOutSeconds + PRIOR.hiddenSeconds + PRIOR.teleportInSeconds + 0.1);
    expect(s.brain.state).toBe('summon');
    expect(s.brain.wavesStarted).toBe(2);
    s.calls.length = 0;
    s.brain.onBreak(); // the Surge dropped the shield mid-cast, then a break
    s.run(PRIOR.breakSeconds + PRIOR.teleportOutSeconds + PRIOR.hiddenSeconds + PRIOR.teleportInSeconds + 0.2);
    expect(s.calls).toContain('in:centre');
    expect(s.calls).toContain('summon:resummon');
    expect(s.calls).not.toContain('summon:opening');
    s.run(PRIOR.summonCastSeconds + 0.1);
    expect(s.calls).toContain(`release:${SUMMONS.openingCount[1]}`);
    expect(s.brain.wavesStarted).toBe(2);
  });
});
