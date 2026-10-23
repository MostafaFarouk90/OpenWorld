import { bandpass, drive, env, hit, highpass, lowpass, noise, phasor, render, saw, TAU } from '../../audio/sfxKit';

/**
 * Synthesized placeholder wyrm sounds (second pass, on `audio/sfxKit`) (plans/act2-A6a.md 1.7): registered by `wyrm.plugin` as `sfx.wyrm.<key>` until
 * real recordings replace them (a recording is registered under the same key). Deterministic, mono, CC0.
 */
export type WyrmSoundKey = 'screech' | 'inhale' | 'roar' | 'chirp' | 'coo' | 'wingbeat';
export const WYRM_SOUND_KEYS: readonly WyrmSoundKey[] = ['screech', 'inhale', 'roar', 'chirp', 'coo', 'wingbeat'];

/** Volume per key (the wingbeat sits under the music; the roar fills the gallery). */
export const WYRM_SOUND_VOLUME: Readonly<Record<WyrmSoundKey, number>> = {
  screech: 0.7,
  inhale: 0.6,
  roar: 0.9,
  chirp: 0.5,
  coo: 0.35,
  wingbeat: 0.4,
};

export function wyrmSoundSamples(key: WyrmSoundKey): Float32Array<ArrayBuffer> {
  switch (key) {
    case 'screech': {
      // A raptor-like shriek: a falling formant-ish whistle, frequency-jittered, with a 70 Hz rasp on the amplitude.
      const rnd = noise(11);
      const ph = phasor();
      const hp = highpass(2500);
      return render(1.0, (t) => {
        const u = t / 1.0;
        const f = 2100 - 1300 * u * u + 90 * Math.sin(TAU * 9 * t) + 40 * rnd();
        const rasp = 0.55 + 0.45 * Math.sin(TAU * 70 * t + 2 * Math.sin(TAU * 5 * t));
        const tone = saw(ph(f), 5) * rasp;
        return env(t, 1.0, 0.025, 1.4) * (0.55 * tone + 0.5 * hp(rnd()) * rasp);
      });
    }
    case 'inhale': {
      // A drawn breath: a band of noise rising in pitch and swelling, with a throat rumble underneath.
      const rnd = noise(12);
      const band = bandpass(300, 900);
      const rumble = lowpass(140);
      return render(0.9, (t) => {
        const u = t / 0.9;
        const swell = Math.pow(u, 1.6) * (1 - Math.pow(u, 8));
        return swell * (2.6 * band(rnd(), 450 + 1500 * u) + 1.4 * rumble(rnd()));
      });
    }
    case 'roar': {
      // A chest roar: a 70 to 42 Hz saw growled at 26 Hz, driven, with a formant sweep over noise on top.
      const rnd = noise(13);
      const ph = phasor();
      const formant = bandpass(250, 700);
      const low = lowpass(300);
      return render(1.9, (t) => {
        const u = t / 1.9;
        const f = 74 - 32 * u + 4 * Math.sin(TAU * 5 * t);
        const growl = 0.6 + 0.4 * Math.sin(TAU * 26 * t);
        const core = drive(saw(ph(f), 14) * growl * 1.6, 2.2);
        const air = formant(rnd(), 350 + 500 * Math.sin(Math.PI * u)) * 3;
        return env(t, 1.9, 0.12, 1.3) * (0.7 * core + 0.5 * air + 0.8 * low(rnd()));
      });
    }
    case 'chirp': {
      // Two quick rising sine chirps with a little FM.
      const ph = phasor();
      return render(0.22, (t) => {
        const local = t < 0.09 ? t : t - 0.11;
        if (local < 0) return 0;
        const u = local / 0.09;
        const f = 2000 + 1100 * Math.min(1, u) + 120 * Math.sin(TAU * 40 * t);
        return Math.sin(ph(f)) * hit(local, 24) * Math.min(1, local / 0.004) * (t > 0.2 ? 0 : 0.8);
      });
    }
    case 'coo': {
      // A rounded dove-like coo: a falling sine with a soft second harmonic and a slow tremolo.
      const ph = phasor();
      return render(0.6, (t) => {
        const u = t / 0.6;
        const f = 500 - 90 * u + 14 * Math.sin(TAU * 5 * t);
        const p = ph(f);
        const trem = 0.8 + 0.2 * Math.sin(TAU * 6 * t);
        return env(t, 0.6, 0.09, 1.2) * trem * (Math.sin(p) + 0.25 * Math.sin(2 * p));
      });
    }
    case 'wingbeat': {
      // A leathery flap: a pitch-dropping thud, a low air whump and a late cloth snap.
      const rnd = noise(16);
      const ph = phasor();
      const air = lowpass(260);
      const snap = highpass(1800);
      return render(0.4, (t) => {
        const thud = Math.sin(ph(70 - 35 * Math.min(1, t / 0.12))) * hit(t, 18);
        const whump = air(rnd()) * 5 * Math.min(1, t / 0.03) * hit(t, 9);
        const flap = snap(rnd()) * 0.5 * hit(t - 0.1, 30) * (t > 0.1 ? 1 : 0);
        return 0.8 * thud + 0.7 * whump + flap;
      });
    }
  }
}
