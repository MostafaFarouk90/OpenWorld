import { bandpass, drive, env, hit, highpass, lowpass, noise, phasor, saw, SR, TAU, render } from '../sfxKit';

/**
 * Synthesized placeholder sounds for the Act 5 sound pass (N8): the Caldera's lava and vents, the rim gong, the Siege Ram
 * and the gate, the siege's horn and stings, dragon breath, the Hammer Hall's floor drop, the Anvil, and Vey and Ulthred.
 * Registered by `act5Sfx.plugin` under these stable keys; a recording registered under the same key replaces one.
 * Deterministic, mono, CC0 (built on `sfxKit`). The loops (`ACT5_LOOP_KEYS`) fold their tail into their head so they
 * repeat without a seam.
 */
export const ACT5_SFX_KEYS = [
  'sfx.lava.loop',
  'sfx.lava.splash',
  'sfx.lava.burn',
  'sfx.lava.thrown',
  'sfx.vent.open',
  'sfx.vent.close',
  'sfx.vent.idle',
  'sfx.vent.crack',
  'sfx.gong.rim',
  'sfx.ram.creak',
  'sfx.ram.hit',
  'sfx.ram.stall',
  'sfx.gate.hit',
  'sfx.gate.crack',
  'sfx.gate.breach',
  'sfx.siege.horn',
  'sfx.siege.clear',
  'sfx.siege.order',
  'sfx.siege.lineBreak',
  'sfx.dragon.breath',
  'sfx.dragon.flyby',
  'sfx.anvil.drop',
  'sfx.anvil.strike',
  'sfx.anvil.hum',
  'sfx.anvil.pulse',
  'sfx.vey.clash',
  'sfx.ulthred.hammer',
  'sfx.ulthred.voice',
] as const;
export type Act5SfxKey = (typeof ACT5_SFX_KEYS)[number];

/** The keys that loop (registered with `loop: true`, played through `attach`). */
export const ACT5_LOOP_KEYS: readonly Act5SfxKey[] = ['sfx.lava.loop', 'sfx.vent.idle', 'sfx.anvil.hum'];
export const isAct5Loop = (key: string): boolean => (ACT5_LOOP_KEYS as readonly string[]).includes(key);

/** Scene cues others play by name, and the longest renders: rendered only when asked for. */
export const ACT5_ON_DEMAND_KEYS: readonly Act5SfxKey[] = ['sfx.anvil.strike', 'sfx.anvil.drop', 'sfx.ulthred.voice', 'sfx.gong.rim'];

/** Volume per key (loops sit under the music; the big cues fill the space). */
export const ACT5_SFX_VOLUME: Readonly<Record<Act5SfxKey, number>> = {
  'sfx.lava.loop': 0.35,
  'sfx.lava.splash': 0.55,
  'sfx.lava.burn': 0.5,
  'sfx.lava.thrown': 0.5,
  'sfx.vent.open': 0.6,
  'sfx.vent.close': 0.5,
  'sfx.vent.idle': 0.3,
  'sfx.vent.crack': 0.45,
  'sfx.gong.rim': 0.75,
  'sfx.ram.creak': 0.45,
  'sfx.ram.hit': 0.7,
  'sfx.ram.stall': 0.55,
  'sfx.gate.hit': 0.6,
  'sfx.gate.crack': 0.6,
  'sfx.gate.breach': 0.75,
  'sfx.siege.horn': 0.65,
  'sfx.siege.clear': 0.5,
  'sfx.siege.order': 0.4,
  'sfx.siege.lineBreak': 0.45,
  'sfx.dragon.breath': 0.65,
  'sfx.dragon.flyby': 0.55,
  'sfx.anvil.drop': 0.8,
  'sfx.anvil.strike': 0.8,
  'sfx.anvil.hum': 0.35,
  'sfx.anvil.pulse': 0.5,
  'sfx.vey.clash': 0.6,
  'sfx.ulthred.hammer': 0.75,
  'sfx.ulthred.voice': 0.6,
};

/** Bronze-gong partials [ratio, gain, decay per second]: a beating pair, then inharmonic overtones, deeper and longer than the Waste's. */
const BRONZE: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.7, 0.35], [1.006, 0.5, 0.4], [2.76, 0.35, 0.8], [5.4, 0.18, 1.6], [8.93, 0.08, 3],
];
/** The Anvil's partials: a great struck block of iron. */
const IRON: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.8, 0.5], [1.003, 0.55, 0.55], [2.32, 0.4, 0.9], [4.19, 0.25, 1.5], [6.7, 0.12, 2.6],
];

function ring(t: number, f: number, partials: ReadonlyArray<readonly [number, number, number]>): number {
  let s = 0;
  for (const [r, g, d] of partials) if (f * r < SR * 0.45) s += Math.sin(TAU * f * r * t) * g * hit(t, d);
  return s;
}

/** Every sound is scaled to this peak after rendering; loudness per key is `ACT5_SFX_VOLUME`. */
export const ACT5_SFX_PEAK = 0.85;

function normalise(x: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < x.length; i++) x[i] *= ACT5_SFX_PEAK / max;
  return x;
}

/** A seamless loop of `seconds`: renders `seconds + fold` and fades the extra tail into the head (no edge fade). */
function loopRender(seconds: number, fn: (t: number) => number, fold = 0.5): Float32Array<ArrayBuffer> {
  const n = Math.round(seconds * SR);
  const f = Math.round(fold * SR);
  const src = new Float32Array(n + f);
  for (let i = 0; i < n + f; i++) src[i] = fn(i / SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i < f ? i / f : 1;
    out[i] = i < f ? src[i] * a + src[i + n] * (1 - a) : src[i];
  }
  return out;
}

export function act5SfxSamples(key: Act5SfxKey): Float32Array<ArrayBuffer> {
  return normalise(raw(key));
}

function raw(key: Act5SfxKey): Float32Array<ArrayBuffer> {
  switch (key) {
    case 'sfx.lava.loop': {
      // A slow molten bubbling over a low rumble: soft band noise bursts, sparse "blup"s with a falling pitch.
      const rnd = noise(601);
      const rum = lowpass(70);
      const bub = bandpass(200, 900);
      const times = [0.4, 1.3, 2.1, 2.6, 3.7, 4.4, 5.2];
      return loopRender(6, (t) => {
        let blup = 0;
        for (const at of times) if (t >= at && t < at + 0.35) blup += Math.sin(TAU * (180 - 90 * (t - at) / 0.35) * (t - at)) * hit(t - at, 14) * 0.7;
        return rum(rnd()) * 7 * (0.8 + 0.2 * Math.sin(TAU * 0.3 * t)) + bub(rnd(), 400 + 300 * Math.sin(TAU * 0.5 * t)) * 0.9 + blup;
      }, 0.6);
    }
    case 'sfx.lava.splash': {
      const rnd = noise(602);
      const band = bandpass(300, 3500);
      return render(1.2, (t) => drive(band(rnd(), 900) * 3 * hit(t, 7) + Math.sin(TAU * (120 - 60 * Math.min(1, t * 4)) * t) * hit(t, 10) * 0.6, 1.4));
    }
    case 'sfx.lava.burn': {
      // Skin on hot rock: a crackling hiss that rises and cuts.
      const rnd = noise(603);
      const hp = highpass(2500);
      return render(1.0, (t) => hp(rnd()) * 0.9 * env(t, 1.0, 0.03, 1.2) * (0.5 + 0.5 * (rnd() > 0.6 ? 1 : 0)));
    }
    case 'sfx.lava.thrown': {
      // Thrown clear of the lava: a hiss and a short whoosh.
      const rnd = noise(604);
      const band = bandpass(400, 4000);
      return render(1.0, (t) => band(rnd(), 500 + 2200 * Math.min(1, t * 3)) * 3 * Math.sin(Math.PI * Math.min(1, t)) ** 1.5);
    }
    case 'sfx.vent.open': {
      // The crust cooling: a rising roar of steam.
      const rnd = noise(605);
      const band = bandpass(500, 5000);
      const rum = lowpass(130);
      return render(2.2, (t) => drive(band(rnd(), 800 + 2000 * Math.min(1, t / 1.2)) * 3.2 * env(t, 2.2, 0.6, 1.2) + rum(rnd()) * 5 * hit(t, 2.5), 1.2));
    }
    case 'sfx.vent.close': {
      // Steam cut off: a falling hiss and a stony tick.
      const rnd = noise(606);
      const hp = highpass(2500);
      return render(1.0, (t) => hp(rnd()) * 1.1 * hit(t, 9) + Math.sin(TAU * 90 * t) * hit(t, 30) * 0.7);
    }
    case 'sfx.vent.idle': {
      const rnd = noise(607);
      const band = bandpass(1200, 6000);
      return loopRender(4, (t) => band(rnd(), 2600 + 700 * Math.sin(TAU * 0.5 * t)) * 2.2 * (0.7 + 0.3 * Math.sin(TAU * 0.75 * t)), 0.5);
    }
    case 'sfx.vent.crack': {
      // The crust about to melt: three sharp stony cracks.
      const rnd = noise(608);
      const hp = highpass(1800);
      return render(0.9, (t) => hp(rnd()) * (hit(t, 60) + 0.7 * hit(t - 0.18, 60) + 0.9 * hit(t - 0.4, 50)) * 1.4);
    }
    case 'sfx.gong.rim': {
      // R29's gong, the siege signal: a deep bronze, a beating tail, a soft mallet.
      const rnd = noise(609);
      const mallet = lowpass(700);
      return render(7.0, (t) => (ring(t, 82.4 * (1 - 0.005 * (1 - hit(t, 1.2))), BRONZE) * (0.78 + 0.22 * Math.sin(TAU * 0.8 * t)) + mallet(rnd()) * hit(t, 55) * 0.5) * Math.min(1, t / 0.006));
    }
    case 'sfx.ram.creak': {
      // Timber under strain: a slow bending resonance.
      const rnd = noise(610);
      const reso = bandpass(120, 600);
      return render(1.4, (t) => reso(rnd(), 180 + 90 * Math.sin(TAU * 1.7 * t)) * 2.8 * Math.sin(Math.PI * Math.min(1, t / 1.4)) ** 2 + Math.sin(TAU * 62 * t) * 0.15 * Math.sin(Math.PI * Math.min(1, t / 1.4)));
    }
    case 'sfx.ram.hit': {
      // The ram head on the gate: a huge wooden boom and a crack.
      const rnd = noise(611);
      const lp = lowpass(250);
      const hp = highpass(2000);
      return render(1.6, (t) => drive(Math.sin(TAU * (55 - 15 * Math.min(1, t * 6)) * t) * hit(t, 4) * 1.2 + lp(rnd()) * 5 * hit(t, 8) + hp(rnd()) * hit(t, 80) * 0.7, 1.5));
    }
    case 'sfx.ram.stall': {
      // The ram stopped dead: a groan and a dull knock.
      const rnd = noise(612);
      const reso = bandpass(100, 500);
      return render(1.2, (t) => reso(rnd(), 140 - 60 * Math.min(1, t)) * 3 * env(t, 1.2, 0.05, 1.5) + Math.sin(TAU * 70 * t) * hit(t, 18) * 0.7);
    }
    case 'sfx.gate.hit': {
      const rnd = noise(613);
      const lp = lowpass(500);
      return render(0.9, (t) => drive(lp(rnd()) * 6 * hit(t, 11) + Math.sin(TAU * (90 - 30 * Math.min(1, t * 8)) * t) * hit(t, 9), 1.4));
    }
    case 'sfx.gate.crack': {
      // Iron-bound timber splitting: a long rending crack with a metal ring.
      const rnd = noise(614);
      const hp = highpass(1500);
      return render(1.3, (t) => hp(rnd()) * (hit(t, 25) * 0.9 + 0.5 * hit(t - 0.12, 20) * (rnd() > 0 ? 1 : 0.4)) + ring(t, 440, [[1, 0.2, 5], [2.76, 0.1, 7]]) * 0.5);
    }
    case 'sfx.gate.breach': {
      // The gate gives: a smash, a long tumbling rumble and falling iron.
      const rnd = noise(615);
      const lp = lowpass(300);
      const hp = highpass(2500);
      return render(3.0, (t) => drive(lp(rnd()) * 8 * (hit(t, 2.2) * 0.8 + 0.25 * Math.sin(TAU * 6 * t) * hit(t, 3)) + Math.sin(TAU * 48 * t) * hit(t, 3) + hp(rnd()) * (hit(t, 30) + 0.4 * hit(t - 0.5, 20) + 0.3 * hit(t - 0.9, 25)), 1.6) * 0.8);
    }
    case 'sfx.siege.horn': {
      // A war-horn call, two notes, rising a fifth.
      const ph = phasor();
      const lp = lowpass(1800);
      return render(2.4, (t) => {
        const hz = t < 1 ? 98 : 147;
        const e = t < 1 ? env(t, 1.0, 0.12, 0.6) : env(t - 1, 1.4, 0.1, 1.2);
        return lp(saw(ph(hz * (1 + 0.004 * Math.sin(TAU * 5 * t))), 10)) * e * 0.8;
      });
    }
    case 'sfx.siege.clear': {
      // A short rising stab: the wave is broken.
      const ph = phasor();
      const lp = lowpass(2400);
      return render(1.0, (t) => lp(saw(ph(196 * (1 + 0.5 * Math.min(1, t * 5))), 8)) * env(t, 1.0, 0.01, 2) * 0.7);
    }
    case 'sfx.siege.order': {
      // A bell tick: the order is given.
      return render(0.8, (t) => ring(t, 660, [[1, 0.7, 6], [2.76, 0.3, 9]]));
    }
    case 'sfx.siege.lineBreak': {
      // A shield line breaking: a clash of wood and iron, then a scatter.
      const rnd = noise(616);
      const hp = highpass(1200);
      return render(1.0, (t) => hp(rnd()) * (hit(t, 35) + 0.6 * hit(t - 0.08, 30) + 0.4 * hit(t - 0.2, 28)) + ring(t, 330, [[1, 0.3, 8], [2.76, 0.2, 10]]));
    }
    case 'sfx.dragon.breath': {
      // A rush of fire: a deep roar swelling and a crackle riding it.
      const rnd = noise(617);
      const band = bandpass(120, 2200);
      const crack = highpass(3000);
      return render(3.0, (t) => drive(band(rnd(), 300 + 700 * Math.sin(Math.PI * Math.min(1, t / 3))) * 4.5 * env(t, 3.0, 0.5, 0.9) + crack(rnd()) * (rnd() > 0.85 ? 1 : 0) * 0.5 * env(t, 3, 0.5, 0.9), 1.3));
    }
    case 'sfx.dragon.flyby': {
      // A great wing-beat pass: slow thumps and an air rush that swells and fades.
      const rnd = noise(618);
      const band = bandpass(80, 1500);
      return render(3.2, (t) => band(rnd(), 300 + 500 * Math.sin(Math.PI * Math.min(1, t / 3.2))) * 3 * Math.sin(Math.PI * Math.min(1, t / 3.2)) ** 2 + Math.sin(TAU * 45 * t) * (hit(t % 0.9, 8) * Math.sin(Math.PI * Math.min(1, t / 3.2))) * 0.8);
    }
    case 'sfx.anvil.drop': {
      // The Hammer Hall's floor falls: stone grinding, a long fall, a heavy settle.
      const rnd = noise(619);
      const lp = lowpass(220);
      const band = bandpass(100, 1200);
      return render(5.5, (t) => {
        const grind = band(rnd(), 200 + 150 * Math.sin(TAU * 0.8 * t)) * 3.5 * env(t, 3.2, 0.4, 0.8);
        const settle = t > 3.2 ? lp(rnd()) * 8 * hit(t - 3.2, 3) + Math.sin(TAU * 40 * (t - 3.2)) * hit(t - 3.2, 2.2) : 0;
        return drive(grind + settle + lp(rnd()) * 3 * env(t, 3.2, 0.3, 1), 1.3);
      });
    }
    case 'sfx.anvil.strike': {
      // The Anvil struck: a huge ring on iron with a long beating tail.
      const rnd = noise(620);
      const lp = lowpass(900);
      return render(8.0, (t) => (ring(t, 110, IRON) * (0.8 + 0.2 * Math.sin(TAU * 1.1 * t)) + lp(rnd()) * hit(t, 40) * 0.8) * Math.min(1, t / 0.004));
    }
    case 'sfx.anvil.hum': {
      // The Anvil's steady tone in its room.
      return loopRender(4, (t) => (Math.sin(TAU * 55 * t) * 0.8 + Math.sin(TAU * 110.5 * t) * 0.45 + Math.sin(TAU * 165 * t) * 0.18) * (0.85 + 0.15 * Math.sin(TAU * 0.5 * t)), 0.5);
    }
    case 'sfx.anvil.pulse': {
      // A soft heartbeat pulse of the Anvil.
      return render(1.2, (t) => Math.sin(TAU * (50 + 30 * hit(t, 30)) * t) * (hit(t, 7) + 0.6 * hit(t - 0.28, 8)));
    }
    case 'sfx.vey.clash': {
      // Vey's blade on a shield: a hard bright steel clash.
      const rnd = noise(621);
      const hp = highpass(2000);
      return render(1.0, (t) => hp(rnd()) * hit(t, 40) * 0.9 + ring(t, 880, [[1, 0.35, 7], [2.32, 0.25, 9], [4.19, 0.15, 12]]));
    }
    case 'sfx.ulthred.hammer': {
      // Ulthred's hammer blow: iron on stone, a boom you feel.
      const rnd = noise(622);
      const lp = lowpass(300);
      return render(2.4, (t) => drive(ring(t, 73.4, IRON) * hit(t, 1.2) * 0.9 + lp(rnd()) * 7 * hit(t, 9) + Math.sin(TAU * (50 - 20 * Math.min(1, t * 5)) * t) * hit(t, 5), 1.4));
    }
    case 'sfx.ulthred.voice': {
      // The voice in the walls: a low formant swell, as if the stone were speaking.
      const rnd = noise(623);
      const f1 = bandpass(300, 700);
      const f2 = bandpass(800, 1300);
      const ph = phasor();
      return render(4.0, (t) => {
        const e = env(t, 4.0, 1.2, 0.9);
        const src = saw(ph(62 * (1 - 0.1 * t / 4)), 14) * 0.5 + rnd() * 0.2;
        return (f1(src, 450 + 120 * Math.sin(TAU * 0.4 * t)) * 2.2 + f2(src, 1000) * 0.9) * e;
      });
    }
  }
}
