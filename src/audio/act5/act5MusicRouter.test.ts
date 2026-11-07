import { describe, expect, it, vi } from 'vitest';
import { Act5MusicRouter, BUILD_BARS, DROP_BARS, LULL_TIMEOUT_S } from './act5MusicRouter';

function setup() {
  const calls: string[] = [];
  let beatCb: ((b: { beat: number }) => void) | null = null;
  const unbeat = vi.fn(() => {
    beatCb = null;
  });
  const router = new Act5MusicRouter({
    setBoss: (on, id) => void calls.push(`${on ? '+' : '-'}${id}`),
    onBeat: (cb) => {
      beatCb = cb;
      return unbeat;
    },
  });
  /** One bar: beats 0 to 3. */
  const bar = (): void => {
    for (let b = 0; b < 4; b++) beatCb?.({ beat: b });
  };
  return { router, calls, bar, unbeat, hasBeat: () => beatCb !== null };
}

describe('the siege mix is keyed on the siege events, not the movement mode', () => {
  it('a wave starts the siege mix, its clear moves to the lull (started before the old one is released), the next wave back', () => {
    const { router, calls } = setup();
    router.waveStarted();
    router.waveCleared();
    router.waveStarted();
    expect(calls).toEqual(['+siege', '+siege.lull', '-siege', '+siege', '-siege.lull']);
  });

  it('works with no siege movement mode at all (R27 tunnel)', () => {
    const { router, calls } = setup();
    router.waveStarted();
    expect(calls).toEqual(['+siege']);
  });

  it('the siege mode starts the mix when no wave event has, and leaving it ends the music', () => {
    const { router, calls } = setup();
    router.modeChanged({ mode: 'siege', previous: 'walk' });
    router.modeChanged({ mode: 'walk', previous: 'siege' });
    expect(calls).toEqual(['+siege', '-siege']);
    // and a load re-derives it from the mode afterwards
    router.saveLoaded(true);
    expect(calls.at(-1)).toBe('+siege');
  });

  it('the mode does not override a wave event that already runs the lull', () => {
    const { router, calls } = setup();
    router.waveStarted();
    router.waveCleared();
    router.modeChanged({ mode: 'siege', previous: 'walk' });
    expect(calls).toEqual(['+siege', '+siege.lull', '-siege']);
  });

  it('a scene pushed over the siege (scene 5 outranks siege 4) pauses nothing: neither entering nor leaving it changes the mix', () => {
    const { router, calls } = setup();
    router.waveStarted();
    router.waveCleared();
    router.modeChanged({ mode: 'scene', previous: 'siege' });
    router.modeChanged({ mode: 'siege', previous: 'scene' });
    expect(calls).toEqual(['+siege', '+siege.lull', '-siege']);
  });

  it('leaving the siege mode ends only a mix the mode itself pushed', () => {
    const { router, calls } = setup();
    router.waveStarted();
    router.modeChanged({ mode: 'walk', previous: 'siege' });
    expect(calls).toEqual(['+siege']);
  });

  it('a lull with no new wave hands the music back after the timeout; a mode-driven mix does not time out', () => {
    const a = setup();
    a.router.waveStarted();
    a.router.waveCleared();
    a.router.tick(LULL_TIMEOUT_S - 1);
    expect(a.calls.at(-1)).toBe('-siege');
    a.router.tick(2);
    expect(a.calls.at(-1)).toBe('-siege.lull');
    const b = setup();
    b.router.modeChanged({ mode: 'siege', previous: 'walk' });
    b.router.tick(LULL_TIMEOUT_S * 2);
    expect(b.calls).toEqual(['+siege']);
  });

  it('a load forgets the mixes without releasing them (the director forgot its bosses); the next wave starts clean', () => {
    const { router, calls } = setup();
    router.waveStarted();
    router.saveLoaded(false);
    router.waveStarted();
    expect(calls).toEqual(['+siege', '+siege']);
    router.saveLoaded(true);
    expect(calls.at(-1)).toBe('+siege');
  });

  it('the same wave event twice does not start the mix twice', () => {
    const { router, calls } = setup();
    router.waveStarted();
    router.waveStarted();
    expect(calls).toEqual(['+siege']);
  });
});

describe('Ulthred phase 3 drops to the bass and the heartbeat, then builds back in one bar', () => {
  it('steps on bar lines: drop, hold two bars, build for one bar, then the plain phase 3 mix is the lead', () => {
    const { router, calls, bar } = setup();
    router.bossPhase({ bossId: 'ulthred', phase: 3 });
    expect(calls).toEqual([]); // waits for the next bar line
    router.tick(0.01);
    // beat 2 does nothing; beat 0 of the next bar starts the drop
    const beats = (n: number): void => {
      for (let i = 0; i < n; i++) bar();
    };
    bar();
    expect(calls).toEqual(['+ulthred.3.drop']);
    beats(DROP_BARS - 1);
    expect(calls).toEqual(['+ulthred.3.drop']);
    bar();
    expect(calls).toEqual(['+ulthred.3.drop', '+ulthred.3.build', '-ulthred.3.drop']);
    beats(BUILD_BARS);
    expect(calls.at(-1)).toBe('-ulthred.3.build');
  });

  it('a phase 3 that arrives mid-bar still steps once the clock is running (the wait resets on every beat)', () => {
    const { router, calls, bar } = setup();
    router.bossPhase({ bossId: 'ulthred', phase: 3 });
    for (let t = 0; t < 4; t++) {
      router.tick(0.6);
      bar(); // beats arrive every 0.6 s, but ticks between them would have expired a bar-line-only wait
    }
    expect(calls).toContain('+ulthred.3.drop');
  });

  it('other phases and other bosses do nothing', () => {
    const { router, calls, hasBeat } = setup();
    router.bossPhase({ bossId: 'ulthred', phase: 2 });
    router.bossPhase({ bossId: 'vey', phase: 3 });
    expect(calls).toEqual([]);
    expect(hasBeat()).toBe(false);
  });

  it('without a beat (audio locked) the drop is skipped and nothing is left running', () => {
    const { router, calls, unbeat } = setup();
    router.bossPhase({ bossId: 'ulthred', phase: 3 });
    router.tick(5);
    expect(calls).toEqual([]);
    expect(unbeat).toHaveBeenCalled();
  });

  it('the fight ending mid-drop releases the stepping mixes and stops listening', () => {
    const { router, calls, bar, unbeat } = setup();
    router.bossPhase({ bossId: 'ulthred', phase: 3 });
    bar();
    router.bossOver('vey');
    expect(calls).toEqual(['+ulthred.3.drop']);
    router.bossOver('ulthred');
    expect(calls).toEqual(['+ulthred.3.drop', '-ulthred.3.drop']);
    expect(unbeat).toHaveBeenCalled();
    bar();
    expect(calls).toHaveLength(2);
  });

  it('a load mid-drop clears the stepping without releasing into a director that forgot it', () => {
    const { router, calls, bar } = setup();
    router.bossPhase({ bossId: 'ulthred', phase: 3 });
    bar();
    router.saveLoaded(false);
    bar();
    expect(calls).toEqual(['+ulthred.3.drop']);
  });

  it('a throwing music service never throws out of the router', () => {
    const router = new Act5MusicRouter({
      setBoss: () => {
        throw new Error('no audio');
      },
      onBeat: () => () => {},
    });
    expect(() => {
      router.waveStarted();
      router.waveCleared();
      router.dispose();
    }).not.toThrow();
  });
});
