import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YSMERYTH_TRIAL_ID } from './act3Tracks';
import { BarClock } from './barClock';
import { MusicDirector } from './MusicDirector';
import { PEAT_AND_PITCH, WING_OVER_RIME, loopSeconds, type TrackDef } from './tracks';

/** The real MusicDirector on the real Act 3 tracks: the boss and trial keys of `bossMixes`. */
function setup(track: TrackDef) {
  const calls: Array<Readonly<Record<string, number>>> = [];
  const driver = { setMix: vi.fn((m: Readonly<Record<string, number>>) => void calls.push(m)) };
  const d = new MusicDirector({ track, driver, random: () => 0.5 });
  d.start(new BarClock(0, loopSeconds(track, 48000), track.bars), 0);
  let now = 0;
  const run = (secs: number): void => {
    const end = now + secs;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 1 / 60);
      d.update(now, () => undefined);
    }
  };
  return { d, calls, run, now: () => now };
}

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('Peat and Pitch: Murkjaw', () => {
  const MURK = PEAT_AND_PITCH.bossMixes!.murkjaw;

  it('boss.started murkjaw plays phase 1 with the hat at 0, and phases 2 and 3 bring it in', () => {
    const t = setup(PEAT_AND_PITCH);
    t.d.bossStarted('murkjaw', 1, 0);
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    expect(t.d.currentMix()).toBe(MURK.phases[0]);
    expect(t.d.currentMix().hat).toBe(0);
    t.d.bossPhase('murkjaw', 2);
    expect(t.d.currentMix().hat).toBe(1);
    t.d.bossPhase('murkjaw', 3);
    expect(t.d.currentMix()).toBe(MURK.phases[2]);
  });

  it('has no hush: the release window leaves the mix alone', () => {
    const t = setup(PEAT_AND_PITCH);
    t.d.bossStarted('murkjaw', 1, 0);
    t.d.bossHush('murkjaw', true);
    expect(t.d.currentMix()).toBe(MURK.phases[0]);
  });
});

describe('Wing over Rime: Skarl and the trial', () => {
  const SKARL = WING_OVER_RIME.bossMixes!['corvin-skarl'];

  it('Skarl hushes on boss.releaseWindow open and returns on close', () => {
    const t = setup(WING_OVER_RIME);
    t.d.bossStarted('corvin-skarl', 1, 0);
    expect(t.d.currentMix()).toBe(SKARL.phases[0]);
    t.d.bossHush('corvin-skarl', true);
    expect(t.d.currentMix()).toBe(SKARL.hush);
    t.d.bossHush('corvin-skarl', false);
    expect(t.d.currentMix()).toBe(SKARL.phases[0]);
  });

  it('the trial key gives the chant at 1 and the harsh boss stem at 0, and back to explore through the ending', () => {
    const t = setup(WING_OVER_RIME);
    t.d.setBoss(true, 0, YSMERYTH_TRIAL_ID);
    t.run(0.1);
    expect(t.d.state).toBe('boss');
    expect(t.d.currentMix().chant).toBe(1);
    expect(t.d.currentMix().boss).toBe(0);
    t.d.setBoss(false, t.now(), YSMERYTH_TRIAL_ID);
    t.run(0.1);
    expect(t.d.state).toBe('ending');
    t.run(WING_OVER_RIME.bpm > 0 ? 8 : 0);
    expect(t.d.state).toBe('explore');
  });

  it('an unknown boss id falls back to mixes.boss, warning once', () => {
    const t = setup(WING_OVER_RIME);
    t.d.bossStarted('someone-else', 1, 0);
    expect(t.d.currentMix()).toBe(WING_OVER_RIME.mixes.boss);
    t.d.currentMix();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
