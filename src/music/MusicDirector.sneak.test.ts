import { describe, expect, it, vi } from 'vitest';
import { BarClock } from './barClock';
import { musicConfig } from './musicConfig';
import { MusicDirector } from './MusicDirector';
import { BARLEY_AND_BRAZIER as TRACK, loopSeconds } from './tracks';

const LOOP = loopSeconds(TRACK, 48000);

function setup() {
  const calls: Array<Readonly<Record<string, number>>> = [];
  const driver = { setMix: vi.fn((m: Readonly<Record<string, number>>) => void calls.push(m)) };
  const d = new MusicDirector({ track: TRACK, driver, random: () => 0.5 });
  d.start(new BarClock(0, LOOP, 16), 0);
  let now = 0;
  const run = (secs: number, near = false): void => {
    const end = now + secs;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 1 / 60);
      d.update(now, () => (near ? 5 : undefined), near ? { hostileNear: true } : {});
    }
  };
  return { d, calls, run, now: () => now };
}

describe('stealth state', () => {
  it('a section entered plays the stealth mix, ended returns to explore', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.run(0.1);
    expect(t.d.state).toBe('stealth');
    expect(t.calls.at(-1)).toBe(TRACK.mixes.stealth);
    t.d.stealthEnded('s1', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore');
  });

  it('cleared and exited both end it, through the same call; an unknown section is a no-op', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.d.stealthEnded('other', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('stealth');
    t.d.stealthEnded('s1', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore');
  });

  it('alert overlays: the loudest guard wins, calm removes, and the mix follows', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.run(0.1);
    t.d.stealthAlert('g1', 'suspicious');
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.stealthAlert!.suspicious);
    t.d.stealthAlert('g2', 'alerted');
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.stealthAlert!.alerted);
    t.d.stealthAlert('g2', 'calm');
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.stealthAlert!.suspicious);
    t.d.stealthAlert('g1', 'calm');
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.mixes.stealth);
  });

  it('a catch resets the overlay but keeps the section live', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.d.stealthAlert('g1', 'alerted');
    t.run(0.1);
    t.d.stealthCaught();
    t.run(0.1);
    expect(t.d.state).toBe('stealth');
    expect(t.calls.at(-1)).toBe(TRACK.mixes.stealth);
  });

  it('alerts outside a section are ignored; ending the section clears them', () => {
    const t = setup();
    t.d.stealthAlert('g1', 'alerted');
    t.run(0.1);
    expect(t.d.state).toBe('explore');
    t.d.stealthEntered('s1');
    t.d.stealthAlert('g1', 'alerted');
    t.d.stealthEnded('s1', t.now());
    t.d.stealthEntered('s2');
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.mixes.stealth);
  });

  it('combat takes over, then the state returns to stealth, not explore', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.run(0.1);
    t.d.onAggro('g1');
    t.run(0.5, true);
    expect(t.d.state).toBe('combat');
    t.d.onCalm('g1', t.now());
    t.run(8);
    expect(t.d.state).toBe('stealth');
  });

  it('a boss ending with a section live: no ending, back to stealth; boss resolved plays the ending first', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.d.bossStarted('ashen-prior', 1, t.now());
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    t.d.bossEnded('ashen-prior', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('stealth');
    t.d.bossStarted('ashen-prior', 1, t.now());
    t.d.bossResolved('ashen-prior', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    t.run(musicConfig.endingSeconds + 0.5);
    expect(t.d.state).toBe('stealth');
  });

  it('blocks discover requests and the silence timer while sneaking', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.d.requestDiscover();
    t.run(LOOP * 3);
    expect(t.d.state).toBe('stealth'); // no silence after two loops, no discover phrase
    t.d.stealthEnded('s1', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore'); // the silence timer starts only now
  });

  it('a dialogue duck wins over stealth and returns to it', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.run(0.1);
    t.d.duck('dialogue:a', true);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.mixes.talk);
    t.d.duck('dialogue:a', false);
    t.run(0.1);
    expect(t.calls.at(-1)).toBe(TRACK.mixes.stealth);
  });

  it('reset (save.loaded) clears sections and overlays; deriveStealth marks one live and the real id replaces it', () => {
    const t = setup();
    t.d.stealthEntered('s1');
    t.d.stealthAlert('g', 'alerted');
    t.d.reset(t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore');
    t.d.deriveStealth(true);
    t.run(0.1);
    expect(t.d.state).toBe('stealth');
    t.d.stealthEntered('s1'); // thread 18 re-emits entered after its load teleport
    t.d.stealthEnded('s1', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore'); // one stealth state, not two
  });

  it('deriveStealth(false) and deriveChase(false) change nothing', () => {
    const t = setup();
    t.d.deriveStealth(false);
    t.d.deriveChase(false);
    t.run(0.1);
    expect(t.d.state).toBe('explore');
  });
});

describe('chase state', () => {
  it('starts on chase.started and a win plays the 4 s ending, then explore', () => {
    const t = setup();
    t.d.chaseStarted('c1');
    t.run(0.1);
    expect(t.d.state).toBe('chase');
    expect(t.calls.at(-1)).toBe(TRACK.mixes.chase);
    t.d.chaseCaught('c1', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    t.run(musicConfig.mercyEndingSeconds + 0.5);
    expect(t.d.state).toBe('explore');
  });

  it('a lost chase holds the mix across the Again card, then drops with no ending', () => {
    const t = setup();
    t.d.chaseStarted('c1');
    t.run(0.1);
    t.d.chaseLost('c1', 'timer', t.now());
    t.run(musicConfig.chaseRestartHoldSeconds - 0.3);
    expect(t.d.state).toBe('chase');
    t.run(0.6);
    expect(t.d.state).toBe('explore');
  });

  it('lost then restarted inside the hold never leaves the chase mix (no dip, no extra setMix)', () => {
    const t = setup();
    t.d.chaseStarted('c1');
    t.run(0.1);
    const n = t.calls.length;
    t.d.chaseLost('c1', 'distance', t.now());
    t.run(2);
    t.d.chaseStarted('c2');
    t.run(5);
    expect(t.d.state).toBe('chase');
    expect(t.calls.length).toBe(n);
  });

  it('lost because of combat drops the chase at once and combat plays', () => {
    const t = setup();
    t.d.chaseStarted('c1');
    t.d.onAggro('g1');
    t.run(0.5, true);
    expect(t.d.state).toBe('combat');
    t.d.chaseLost('c1', 'combat', t.now());
    t.d.onCalm('g1', t.now());
    t.run(8);
    expect(t.d.state).toBe('explore');
  });

  it('events for a different chase id are ignored; a derived chase accepts the real ids', () => {
    const t = setup();
    t.d.chaseStarted('c1');
    t.d.chaseCaught('zzz', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('chase');
    t.d.reset(t.now());
    t.d.deriveChase(true);
    t.run(0.1);
    expect(t.d.state).toBe('chase');
    t.d.chaseCaught('real', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
  });

  it('priority: ending beats chase and stealth; chase beats stealth; boss beats all', () => {
    const t = setup();
    t.d.stealthEntered('s');
    t.d.chaseStarted('c');
    t.run(0.1);
    expect(t.d.state).toBe('chase');
    t.d.bossStarted('b', 1, t.now());
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    t.d.setBoss(false, t.now(), 'b');
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    t.run(7);
    expect(t.d.state).toBe('chase');
    t.d.chaseCaught('c', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    t.run(5);
    expect(t.d.state).toBe('stealth');
  });
});

describe('track switch', () => {
  it('switchTrack changes the mixes, keeps combat/boss state and drops phrases', () => {
    const t = setup();
    const other = { ...TRACK, id: 'other', mixes: { ...TRACK.mixes, explore: { ...TRACK.mixes.explore, hat: 0.9 } } };
    t.d.requestDiscover();
    t.run(0.1);
    t.d.bossStarted('x', 1, t.now());
    t.d.switchTrack(other, new BarClock(t.now() + 1, LOOP, 16), t.now());
    expect(t.d.trackId).toBe('other');
    expect(t.d.state).toBe('boss');
    t.d.bossEnded('x', t.now());
    t.run(0.1);
    expect(t.d.state).toBe('explore');
    expect(t.calls.at(-1)).toBe(other.mixes.explore);
  });
});
