import { describe, expect, it } from 'vitest';
import { BellowsBrain, type BellowsHooks } from './BellowsBrain';
import { COAL, PUNCH, RHYTHM, STEAM, TELEGRAPH_SECONDS, VENT } from './tuning';

const TICK = 1 / 60;

function harness() {
  const log: string[] = [];
  const hooks: BellowsHooks = {
    telegraph: (a, s, lead) => log.push(`telegraph:${a}:${s}:${lead}`),
    cancelTelegraph: (s) => log.push(`cancel:${s}`),
    punch: (s) => log.push(`punch:${s}`),
    jetStart: (s) => log.push(`jetStart:${s}`),
    jetTick: (s) => log.push(`jetTick:${s}`),
    jetEnd: () => log.push('jetEnd'),
    coal: (s, o) => log.push(`coal:${s}:${o}`),
    ventStart: () => log.push('ventStart'),
    ventEnd: () => log.push('ventEnd'),
    sealStart: () => log.push('sealStart'),
    sealEnd: () => log.push('sealEnd'),
  };
  const brain = new BellowsBrain(hooks);
  let dist = 3;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) brain.tick(TICK, { dist });
  };
  return { brain, log, run, setDist: (d: number) => (dist = d) };
}

describe('BellowsBrain.pick', () => {
  it('punches close in, every third attack is a jet, jets at middle range and lobs coal past it', () => {
    expect(BellowsBrain.pick(3, 0)).toBe('punch');
    expect(BellowsBrain.pick(3, 1)).toBe('punch');
    expect(BellowsBrain.pick(3, 2)).toBe('steam');
    expect(BellowsBrain.pick(PUNCH.reach + 0.1, 0)).toBe('steam');
    expect(BellowsBrain.pick(STEAM.range, 0)).toBe('steam');
    expect(BellowsBrain.pick(STEAM.range + 0.1, 0)).toBe('lob');
  });
});

describe('BellowsBrain', () => {
  it('does nothing before start, then telegraphs 1.0 s before the punch lands', () => {
    const h = harness();
    h.run(5);
    expect(h.log).toEqual([]);
    h.brain.start();
    h.run(RHYTHM.first + TICK);
    expect(h.log).toEqual([`telegraph:punch:1:${TELEGRAPH_SECONDS}`]);
    expect(h.brain.state).toBe('telegraph');
    h.run(TELEGRAPH_SECONDS - 2 * TICK);
    expect(h.log).not.toContain('punch:1');
    h.run(3 * TICK);
    expect(h.log).toContain('punch:1');
    expect(h.brain.state).toBe('recover');
  });

  it('the jet shares the 1.0 s telegraph and ticks over its length', () => {
    const h = harness();
    h.setDist(9);
    h.brain.start();
    h.run(RHYTHM.first + TELEGRAPH_SECONDS + STEAM.seconds + 0.05);
    expect(h.log[0]).toBe(`telegraph:steam:1:${TELEGRAPH_SECONDS}`);
    expect(h.log.filter((x) => x === 'jetTick:1')).toHaveLength(Math.floor(STEAM.seconds / STEAM.tickSeconds) + 1);
    expect(h.log).toContain('jetEnd');
  });

  it('attacks faster in later phases', () => {
    const count = (phase: number) => {
      const h = harness();
      h.brain.start();
      if (phase > 1) {
        h.brain.onPhase(phase);
        h.run(10); // the seal and its volleys
      }
      h.log.length = 0;
      h.run(120);
      return h.log.filter((x) => x.startsWith('telegraph:')).length;
    };
    expect(count(2)).toBeGreaterThan(count(1));
    expect(count(3)).toBeGreaterThan(count(2));
  });

  it('a far player draws single lobbed coal shots, no telegraph of the punch or jet', () => {
    const h = harness();
    h.setDist(STEAM.range + 4);
    h.brain.start();
    h.run(10);
    expect(h.log.some((x) => x.startsWith('coal:'))).toBe(true);
    expect(h.log.some((x) => x.startsWith('telegraph:'))).toBe(false);
  });

  it('a break cancels the telegraph and stalls it for the vent; it cannot break again until the vent ends', () => {
    const h = harness();
    h.brain.start();
    h.run(RHYTHM.first + 0.5);
    expect(h.brain.state).toBe('telegraph');
    expect(h.brain.canBreak).toBe(true);
    h.brain.onBreak();
    expect(h.log.slice(-2)).toEqual(['cancel:1', 'ventStart']);
    expect(h.brain.vented).toBe(true);
    expect(h.brain.canBreak).toBe(false);
    h.log.length = 0;
    h.run(VENT.seconds - 0.1);
    expect(h.log).toEqual([]);
    h.run(0.2);
    expect(h.log).toEqual(['ventEnd']);
    expect(h.brain.state).toBe('ready');
  });

  it('a phase change seals it for three volleys of three shots, then it attacks again', () => {
    const h = harness();
    h.brain.start();
    h.brain.onPhase(2);
    expect(h.brain.sealed).toBe(true);
    expect(h.brain.canBreak).toBe(false);
    h.run(COAL.volleyAt[COAL.volleyAt.length - 1] + COAL.flightSeconds + COAL.sealTail + 0.05);
    expect(h.log.filter((x) => x.startsWith('coal:'))).toHaveLength(COAL.volleyAt.length * COAL.perVolley);
    expect(h.log).toContain('sealEnd');
    expect(h.brain.state).toBe('ready');
  });

  it('a phase change during a vent waits for the vent, then seals', () => {
    const h = harness();
    h.brain.start();
    h.run(0.2);
    h.brain.onBreak();
    h.brain.onPhase(2);
    expect(h.brain.vented).toBe(true);
    expect(h.brain.sealPending).toBe(true);
    h.run(VENT.seconds + 0.05);
    expect(h.log.slice(-2)).toEqual(['ventEnd', 'sealStart']);
    expect(h.brain.sealed).toBe(true);
    expect(h.brain.sealPending).toBe(false);
  });

  it('a stale or repeated phase is ignored; dying stops everything', () => {
    const h = harness();
    h.brain.start();
    h.brain.onPhase(2);
    h.run(10);
    h.log.length = 0;
    h.brain.onPhase(2);
    h.brain.onPhase(1);
    expect(h.brain.sealed).toBe(false);
    h.run(0.5);
    h.brain.onDefeated();
    h.log.length = 0;
    h.run(20);
    expect(h.log).toEqual([]);
    expect(h.brain.state).toBe('dying');
    h.brain.onBreak();
    expect(h.brain.state).toBe('dying');
  });

  it('a stop mid-jet ends the jet', () => {
    const h = harness();
    h.setDist(9);
    h.brain.start();
    h.run(RHYTHM.first + TELEGRAPH_SECONDS + 0.2);
    expect(h.brain.state).toBe('jet');
    h.brain.stopAttack();
    expect(h.log.at(-1)).toBe('jetEnd');
  });
});
