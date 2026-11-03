import { bandpass, drive, env, hit, highpass, lowpass, noise, phasor, render, saw, SR, TAU } from './sfxKit';

/**
 * Synthesized placeholder sounds for the Act 3 sound pass (K14): the Greyfen and Dragonspine enemies, wading and diving,
 * the glide, the ferry, Hathren, Ysmeryth, the great wings and Skarl's drake chain. Registered by `act3Sfx.plugin` under
 * these stable keys; a recording registered under the same key replaces one. Deterministic, mono, CC0 (built on `sfxKit`).
 * The three loops (`LOOP_KEYS`) fold their tail into their head so they repeat without a seam.
 */
export const ACT3_SFX_KEYS = [
  'sfx.leech.lunge',
  'sfx.leech.bite',
  'sfx.leech.squelch',
  'sfx.shambler.smash',
  'sfx.shambler.mud',
  'sfx.shambler.collapse',
  'sfx.hawk.shriek',
  'sfx.hawk.cry',
  'sfx.hawk.wing',
  'sfx.ogre.slam',
  'sfx.ogre.throw',
  'sfx.ogre.roar',
  'sfx.water.enter',
  'sfx.water.wade',
  'sfx.water.leave',
  'sfx.dive.in',
  'sfx.dive.out',
  'sfx.dive.breath-warn',
  'sfx.glide.wind',
  'sfx.glide.land',
  'sfx.ferry.board',
  'sfx.ferry.pole',
  'sfx.ferry.bell',
  'sfx.wyrm.hathren.splash',
  'sfx.wyrm.hathren.thrash',
  'sfx.wyrm.hathren.spray',
  'sfx.wyrm.hathren.roar',
  'sfx.wyrm.hathren.song',
  'sfx.wyrm.hathren.dive',
  'sfx.ysmeryth.roar',
  'sfx.ysmeryth.sweep',
  'sfx.ysmeryth.slam',
  'sfx.ysmeryth.breath',
  'sfx.ysmeryth.call',
  'sfx.dragon.wingbeat',
  'sfx.drake.chain',
  'sfx.drake.freed',
] as const;
export type Act3SfxKey = (typeof ACT3_SFX_KEYS)[number];

/** The keys that loop (registered with `loop: true`, played through `attach`). */
export const ACT3_LOOP_KEYS: readonly Act3SfxKey[] = ['sfx.glide.wind', 'sfx.ferry.pole', 'sfx.dragon.wingbeat'];
export const isAct3Loop = (key: string): boolean => (ACT3_LOOP_KEYS as readonly string[]).includes(key);

/** Volume per key (loops sit under the music; the dragons fill the space). */
export const ACT3_SFX_VOLUME: Readonly<Record<Act3SfxKey, number>> = {
  'sfx.leech.lunge': 0.6,
  'sfx.leech.bite': 0.55,
  'sfx.leech.squelch': 0.5,
  'sfx.shambler.smash': 0.9,
  'sfx.shambler.mud': 0.65,
  'sfx.shambler.collapse': 0.85,
  'sfx.hawk.shriek': 0.75,
  'sfx.hawk.cry': 0.55,
  'sfx.hawk.wing': 0.45,
  'sfx.ogre.slam': 0.95,
  'sfx.ogre.throw': 0.7,
  'sfx.ogre.roar': 0.85,
  'sfx.water.enter': 0.6,
  'sfx.water.wade': 0.35,
  'sfx.water.leave': 0.5,
  'sfx.dive.in': 0.65,
  'sfx.dive.out': 0.6,
  'sfx.dive.breath-warn': 0.55,
  'sfx.glide.wind': 0.4,
  'sfx.glide.land': 0.6,
  'sfx.ferry.board': 0.6,
  'sfx.ferry.pole': 0.35,
  'sfx.ferry.bell': 0.6,
  'sfx.wyrm.hathren.splash': 0.9,
  'sfx.wyrm.hathren.thrash': 0.9,
  'sfx.wyrm.hathren.spray': 0.7,
  'sfx.wyrm.hathren.roar': 0.95,
  'sfx.wyrm.hathren.song': 0.6,
  'sfx.wyrm.hathren.dive': 0.85,
  'sfx.ysmeryth.roar': 1,
  'sfx.ysmeryth.sweep': 0.85,
  'sfx.ysmeryth.slam': 1,
  'sfx.ysmeryth.breath': 0.9,
  'sfx.ysmeryth.call': 0.75,
  'sfx.dragon.wingbeat': 0.55,
  'sfx.drake.chain': 0.6,
  'sfx.drake.freed': 0.75,
};

function ring(t: number, f: number, partials: ReadonlyArray<readonly [number, number, number]>): number {
  let s = 0;
  for (const [r, g, d] of partials) s += Math.sin(TAU * f * r * t) * g * hit(t, d);
  return s;
}

/** Sparse bursts: the gain of a train of short decaying hits at the given times (seconds). */
function bursts(t: number, times: readonly number[], rate: number): number {
  let g = 0;
  for (const at of times) if (t >= at) g = Math.max(g, hit(t - at, rate));
  return g;
}

/**
 * A seamless loop of `seconds`: renders `seconds + fold` and fades the extra tail into the head, so the last sample runs on
 * into the first. No edge fade (the seam is already continuous), clamped to [-1, 1].
 */
function loopRender(seconds: number, fn: (t: number) => number, fold = 0.5): Float32Array<ArrayBuffer> {
  const n = Math.round(seconds * SR);
  const f = Math.round(fold * SR);
  const src = new Float32Array(n + f);
  for (let i = 0; i < n + f; i++) src[i] = fn(i / SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i < f ? i / f : 1;
    const v = i < f ? src[i] * a + src[i + n] * (1 - a) : src[i];
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

export function act3SfxSamples(key: Act3SfxKey): Float32Array<ArrayBuffer> {
  switch (key) {
    case 'sfx.leech.lunge': {
      // A wet hiss swelling as the coil tightens, then a slap of water.
      const rnd = noise(301);
      const hiss = bandpass(1500, 4500);
      const wet = lowpass(600);
      return render(0.8, (t) => {
        const swell = t < 0.5 ? Math.pow(t / 0.5, 1.5) : 0;
        const slap = t >= 0.5 ? wet(rnd(), 1500) * 5 * hit(t - 0.5, 14) : 0;
        return hiss(rnd(), 1800 + 2200 * Math.min(1, t / 0.5)) * 4 * swell * 0.7 + slap * 0.7;
      });
    }
    case 'sfx.leech.bite': {
      const rnd = noise(302);
      const ph = phasor();
      const smack = lowpass(2200);
      return render(0.35, (t) => smack(rnd()) * 4 * hit(t, 40) * 0.7 + Math.sin(ph(220 - 120 * Math.min(1, t / 0.15))) * 0.4 * hit(t, 18));
    }
    case 'sfx.leech.squelch': {
      const rnd = noise(303);
      const ph = phasor();
      const wet = lowpass(700);
      return render(0.7, (t) => {
        const f = 260 - 170 * Math.min(1, t / 0.5) + 50 * Math.sin(TAU * 21 * t);
        return Math.sin(ph(f)) * 0.5 * env(t, 0.7, 0.02, 1.6) * (0.6 + 0.4 * Math.sin(TAU * 17 * t)) + wet(rnd()) * 1.6 * hit(t, 7);
      });
    }
    case 'sfx.shambler.smash': {
      const rnd = noise(304);
      const ph = phasor();
      const rum = lowpass(170);
      const clod = bandpass(300, 1400);
      return render(1.0, (t) => {
        const thud = Math.sin(ph(52 - 22 * Math.min(1, t / 0.3))) * hit(t, 6);
        return drive(thud * 1.4 + rum(rnd()) * 5 * hit(t, 6), 1.5) * 0.75 + clod(rnd()) * 3 * bursts(t, [0.02, 0.1, 0.22], 26) * 0.5;
      });
    }
    case 'sfx.shambler.mud': {
      // A glob of peat thrown: a bubbling blorp that rises, then a wet splat.
      const rnd = noise(305);
      const ph = phasor();
      const wet = lowpass(900);
      return render(0.8, (t) => {
        const blorp = t < 0.4 ? Math.sin(ph(110 + 280 * (t / 0.4) ** 1.5 + 40 * Math.sin(TAU * 24 * t))) * 0.5 * Math.min(1, t / 0.04) : 0;
        const splat = t >= 0.4 ? wet(rnd(), 1600) * 5 * hit(t - 0.4, 12) : 0;
        return blorp * (0.6 + 0.4 * Math.sin(TAU * 19 * t)) + splat * 0.7 + wet(rnd()) * 0.4 * hit(t, 5);
      });
    }
    case 'sfx.shambler.collapse': {
      // The peat body slumping: a falling groan, slides of sodden earth, a last heavy settle.
      const rnd = noise(306);
      const ph = phasor();
      const rum = lowpass(220);
      const wet = bandpass(250, 1100);
      return render(1.9, (t) => {
        const groan = Math.sin(ph(95 - 55 * Math.min(1, t / 1.4))) * 0.45 * env(t, 1.9, 0.1, 1.2);
        const slide = wet(rnd(), 500 + 300 * Math.sin(TAU * 3 * t)) * 2.5 * (0.5 + 0.5 * Math.sin(TAU * 7 * t)) ** 2 * env(t, 1.9, 0.05, 1.5);
        const settle = Math.sin(TAU * 40 * (t - 1.2)) * hit(t - 1.2, 9) * (t >= 1.2 ? 1 : 0);
        return drive(groan + slide * 0.6 + rum(rnd()) * 2 * env(t, 1.9, 0.1, 1.4), 1.4) * 0.7 + settle * 0.6;
      });
    }
    case 'sfx.hawk.shriek': {
      // A hunting scream, higher and thinner than the wyrm's, falling as the bird commits.
      const rnd = noise(307);
      const ph = phasor();
      const hp = highpass(3000);
      return render(0.9, (t) => {
        const u = t / 0.9;
        const f = 3300 - 1500 * u * u + 120 * Math.sin(TAU * 11 * t) + 50 * rnd();
        const rasp = 0.6 + 0.4 * Math.sin(TAU * 85 * t + 2 * Math.sin(TAU * 6 * t));
        return env(t, 0.9, 0.02, 1.3) * (0.5 * saw(ph(f), 4) * rasp + 0.4 * hp(rnd()) * rasp);
      });
    }
    case 'sfx.hawk.cry': {
      const ph = phasor();
      return render(0.5, (t) => {
        const local = t < 0.2 ? t : t - 0.26;
        if (local < 0 || local > 0.2) return 0;
        const f = 2700 - 900 * (local / 0.2) + 90 * Math.sin(TAU * 30 * t);
        return Math.sin(ph(f)) * hit(local, 12) * Math.min(1, local / 0.005) * 0.7;
      });
    }
    case 'sfx.hawk.wing': {
      const rnd = noise(309);
      const air = bandpass(500, 2400);
      return render(0.35, (t) => air(rnd(), 900) * 4 * (hit(t, 20) * 0.7 + hit(t - 0.14, 20) * (t > 0.14 ? 0.5 : 0)) * 0.6);
    }
    case 'sfx.ogre.slam': {
      const rnd = noise(310);
      const ph = phasor();
      const rum = lowpass(130);
      const crack = bandpass(700, 2800);
      return render(1.2, (t) => {
        const thud = Math.sin(ph(42 - 17 * Math.min(1, t / 0.35))) * hit(t, 4.5);
        return drive(thud * 1.5 + rum(rnd()) * 6 * hit(t, 4.5), 1.7) * 0.8 + crack(rnd()) * 3 * hit(t, 38) * 0.55;
      });
    }
    case 'sfx.ogre.throw': {
      // A grunt of effort, then the whoosh of the hurled boulder.
      const rnd = noise(311);
      const ph = phasor();
      const air = bandpass(300, 1500);
      return render(0.8, (t) => {
        const grunt = t < 0.3 ? saw(ph(95 - 20 * (t / 0.3)), 8) * 0.5 * Math.sin(Math.PI * (t / 0.3)) : 0;
        const whoosh = t >= 0.3 ? air(rnd(), 450 + 800 * ((t - 0.3) / 0.5)) * 4 * hit(t - 0.3, 6) : 0;
        return drive(grunt, 1.6) * 0.7 + whoosh * 0.6;
      });
    }
    case 'sfx.ogre.roar': {
      const rnd = noise(312);
      const ph = phasor();
      const formant = bandpass(200, 650);
      return render(1.7, (t) => {
        const u = t / 1.7;
        const f = 88 - 32 * u + 5 * Math.sin(TAU * 6 * t);
        const growl = 0.55 + 0.45 * Math.sin(TAU * 22 * t);
        const core = drive(saw(ph(f), 12) * growl * 1.5, 2);
        return env(t, 1.7, 0.1, 1.3) * (0.7 * core + 0.4 * formant(rnd(), 320 + 380 * Math.sin(Math.PI * u)) * 3);
      });
    }
    case 'sfx.water.enter': {
      const rnd = noise(313);
      const ph = phasor();
      const wash = bandpass(400, 2600);
      return render(0.7, (t) => wash(rnd(), 900 + 600 * hit(t, 8)) * 4 * hit(t, 7) * 0.7 + Math.sin(ph(420 - 250 * Math.min(1, t / 0.2))) * 0.25 * hit(t - 0.04, 14) * (t > 0.04 ? 1 : 0));
    }
    case 'sfx.water.wade': {
      // One slosh: a short low wash with a dull bubble.
      const rnd = noise(314);
      const ph = phasor();
      const wash = bandpass(250, 1600);
      return render(0.35, (t) => wash(rnd(), 700) * 3.5 * Math.min(1, t / 0.02) * hit(t, 11) * 0.7 + Math.sin(ph(300 + 200 * (t / 0.35))) * 0.15 * hit(t, 12));
    }
    case 'sfx.water.leave': {
      // Water streaming off, and a few drips.
      const rnd = noise(315);
      const ph = phasor();
      const wash = bandpass(600, 3200);
      return render(0.6, (t) => {
        const drip = Math.sin(ph(900 + 500 * hit(t % 0.17, 30))) * hit(t % 0.17, 35) * 0.3 * (t > 0.2 ? 1 : 0) * hit(t, 3);
        return wash(rnd(), 1500) * 3.5 * env(t, 0.6, 0.04, 2) * 0.6 + drip;
      });
    }
    case 'sfx.dive.in': {
      // A plunge: the splash, then the muffled low gloop of going under.
      const rnd = noise(316);
      const ph = phasor();
      const wash = bandpass(300, 2400);
      const mud = lowpass(300);
      return render(0.95, (t) => {
        const splash = wash(rnd(), 1100) * 4 * hit(t, 8) * 0.7;
        const gloop = Math.sin(ph(220 - 140 * Math.min(1, t / 0.6))) * 0.4 * env(t, 0.95, 0.05, 1.4);
        return splash + gloop + mud(rnd()) * 1.2 * Math.min(1, t / 0.2) * hit(t, 3.5);
      });
    }
    case 'sfx.dive.out': {
      // Surfacing: a splash and a sharp, ragged gasp of air.
      const rnd = noise(317);
      const wash = bandpass(300, 2400);
      const gasp = bandpass(800, 3500);
      return render(0.9, (t) => {
        const splash = wash(rnd(), 1000) * 4 * hit(t, 9) * 0.6;
        const g = t > 0.15 ? gasp(rnd(), 1500 + 900 * Math.min(1, (t - 0.15) / 0.4)) * 4.5 * Math.sin(Math.PI * Math.min(1, (t - 0.15) / 0.55)) * (t < 0.7 ? 1 : 0) : 0;
        return splash + g * 0.6;
      });
    }
    case 'sfx.dive.breath-warn': {
      // A bubbling heartbeat: two low thumps with a trickle of bubbles.
      const rnd = noise(318);
      const ph = phasor();
      const bub = bandpass(500, 2200);
      return render(0.8, (t) => {
        const beat = (at: number, g: number) => Math.sin(ph(70 - 25 * Math.min(1, Math.max(0, t - at) / 0.1))) * hit(t - at, 16) * g * (t >= at ? 1 : 0);
        const b = beat(0, 1) + beat(0.28, 0.75);
        const bubbles = bub(rnd(), 900 + 800 * ((t * 11) % 1)) * 2.5 * bursts(t, [0.12, 0.36, 0.5], 18) * 0.5;
        return drive(b * 1.2, 1.3) * 0.7 + bubbles;
      });
    }
    case 'sfx.glide.wind': {
      // Air over cloth and feather: a band of noise that gusts slowly, with a thin whistle.
      const rnd = noise(319);
      const wind = bandpass(250, 3000);
      const ph = phasor();
      return loopRender(3.2, (t) => {
        const gust = 0.65 + 0.35 * Math.sin(TAU * 0.5 * t + 1) * Math.sin(TAU * 0.31 * t);
        return wind(rnd(), 800 + 500 * gust) * 3 * gust * 0.55 + Math.sin(ph(1400 + 120 * Math.sin(TAU * 0.4 * t))) * 0.025 * gust;
      });
    }
    case 'sfx.glide.land': {
      const rnd = noise(320);
      const ph = phasor();
      const cloth = bandpass(600, 2600);
      return render(0.55, (t) => Math.sin(ph(85 - 35 * Math.min(1, t / 0.12))) * hit(t, 14) * 0.9 + cloth(rnd()) * 3 * hit(t - 0.03, 12) * (t > 0.03 ? 1 : 0) * 0.5);
    }
    case 'sfx.ferry.board': {
      // Boots on planking, then a rope creaking under the weight.
      const rnd = noise(321);
      const ph = phasor();
      const wood = bandpass(200, 900);
      return render(0.95, (t) => {
        const knock = ring(t, 150, [[1, 0.6, 22], [2.4, 0.3, 30]]) + wood(rnd()) * 3 * hit(t, 40) * 0.4;
        const knock2 = ring(t - 0.18, 135, [[1, 0.5, 22], [2.4, 0.25, 30]]) * (t > 0.18 ? 1 : 0);
        const creak = t > 0.3 ? saw(ph(180 + 40 * Math.sin(TAU * 4 * t)), 5) * 0.1 * Math.sin(Math.PI * Math.min(1, (t - 0.3) / 0.6)) * (0.6 + 0.4 * Math.sin(TAU * 21 * t)) : 0;
        return knock * 0.7 + knock2 * 0.6 + creak;
      });
    }
    case 'sfx.ferry.pole': {
      // Poling through the fen: every two seconds the pole drives, a slow wash, a drip, a creak.
      const rnd = noise(322);
      const wash = bandpass(200, 1500);
      const ph = phasor();
      const lap = lowpass(500);
      return loopRender(4, (t) => {
        const u = t % 2;
        const push = wash(rnd(), 500 + 400 * Math.min(1, u / 0.5)) * 3 * Math.sin(Math.PI * Math.min(1, u / 1.1)) * (u < 1.1 ? 1 : 0);
        const creak = Math.sin(ph(210 + 30 * Math.sin(TAU * 0.5 * t))) * 0.05 * Math.sin(Math.PI * Math.min(1, u / 1.6)) * (u < 1.6 ? 1 : 0);
        return push * 0.5 + creak + lap(rnd()) * 0.35;
      });
    }
    case 'sfx.ferry.bell': {
      return render(2.4, (t) => ring(t, 392, [[1, 1, 1.7], [2.01, 0.5, 2.6], [2.76, 0.3, 3.8], [4.1, 0.15, 5.5]]) * 0.45);
    }
    case 'sfx.wyrm.hathren.splash': {
      // A vast body breaking the surface: a wall of water and a deep boom.
      const rnd = noise(323);
      const ph = phasor();
      const wash = bandpass(200, 2800);
      const rum = lowpass(140);
      return render(1.5, (t) => {
        const sheet = wash(rnd(), 900 + 700 * hit(t, 4)) * 5 * Math.min(1, t / 0.05) * hit(t, 3.2) * 0.6;
        return sheet + Math.sin(ph(50 - 22 * Math.min(1, t / 0.3))) * hit(t, 4.5) * 0.9 + rum(rnd()) * 3 * hit(t, 3) * 0.6;
      });
    }
    case 'sfx.wyrm.hathren.thrash': {
      const rnd = noise(324);
      const wash = bandpass(200, 2200);
      const ph = phasor();
      return render(1.3, (t) => {
        const slaps = bursts(t, [0, 0.3, 0.55, 0.85], 9);
        return wash(rnd(), 800) * 4.5 * slaps * 0.6 + Math.sin(ph(60 - 15 * ((t * 3.3) % 1))) * 0.5 * slaps * env(t, 1.3, 0.02, 0.8);
      });
    }
    case 'sfx.wyrm.hathren.spray': {
      // A jet of pressurised water and mist.
      const rnd = noise(325);
      const jet = bandpass(1800, 7500);
      const low = bandpass(300, 1200);
      return render(1.4, (t) => (jet(rnd()) * 4 + low(rnd()) * 2) * env(t, 1.4, 0.12, 1.2) * (0.75 + 0.25 * Math.sin(TAU * 30 * t)) * 0.7);
    }
    case 'sfx.wyrm.hathren.roar': {
      const rnd = noise(326);
      const ph = phasor();
      const wet = lowpass(500);
      const formant = bandpass(150, 600);
      return render(2.3, (t) => {
        const u = t / 2.3;
        const f = 58 - 22 * u + 3 * Math.sin(TAU * 4 * t);
        const gurgle = 0.55 + 0.45 * Math.sin(TAU * 17 * t);
        return env(t, 2.3, 0.2, 1.2) * (0.7 * drive(saw(ph(f), 14) * gurgle * 1.6, 2.2) + 0.5 * formant(rnd(), 250 + 250 * Math.sin(Math.PI * u)) * 3 + 0.6 * wet(rnd()));
      });
    }
    case 'sfx.wyrm.hathren.song': {
      // Her quiet song: a long, low, gliding tone with a slow vibrato and a second voice a fifth above.
      const a = phasor();
      const b = phasor();
      return render(3.4, (t) => {
        const u = t / 3.4;
        const f = 146 * (1 + 0.5 * Math.sin(Math.PI * u) * 0.3 + 0.01 * Math.sin(TAU * 4.5 * t));
        return env(t, 3.4, 0.9, 1.1) * (Math.sin(a(f)) * 0.5 + Math.sin(b(f * 1.5)) * 0.18);
      });
    }
    case 'sfx.wyrm.hathren.dive': {
      // Going under: a long, heavy surge of water falling away into a low gloop.
      const rnd = noise(328);
      const ph = phasor();
      const wash = bandpass(150, 1800);
      return render(1.7, (t) => wash(rnd(), 1100 - 700 * Math.min(1, t / 1.5)) * 4 * Math.sin(Math.PI * Math.min(1, t / 1.2)) * hit(t, 1.5) * 0.7 + Math.sin(ph(110 - 60 * Math.min(1, t / 1.5))) * 0.4 * env(t, 1.7, 0.1, 1.3));
    }
    case 'sfx.ysmeryth.roar': {
      const rnd = noise(329);
      const ph = phasor();
      const formant = bandpass(100, 500);
      const low = lowpass(200);
      return render(3.0, (t) => {
        const u = t / 3;
        const f = 52 - 20 * u + 3 * Math.sin(TAU * 4 * t);
        const growl = 0.55 + 0.45 * Math.sin(TAU * 19 * t);
        return env(t, 3, 0.2, 1.2) * (0.75 * drive(saw(ph(f), 16) * growl * 1.7, 2.4) + 0.5 * formant(rnd(), 200 + 300 * Math.sin(Math.PI * u)) * 3 + 0.9 * low(rnd()));
      });
    }
    case 'sfx.ysmeryth.sweep': {
      // A tail or wing sweeping low across the ground: a rising whoosh and a dragging rumble.
      const rnd = noise(330);
      const air = bandpass(150, 1800);
      const rum = lowpass(120);
      return render(1.3, (t) => air(rnd(), 300 + 800 * Math.min(1, t / 0.7)) * 5 * Math.sin(Math.PI * Math.min(1, t / 1.0)) * (t < 1.0 ? 1 : hit(t - 1, 8)) * 0.6 + rum(rnd()) * 3 * env(t, 1.3, 0.2, 1.2));
    }
    case 'sfx.ysmeryth.slam': {
      const rnd = noise(331);
      const ph = phasor();
      const rum = lowpass(100);
      const crack = bandpass(500, 2200);
      return render(1.6, (t) => {
        const thud = Math.sin(ph(36 - 14 * Math.min(1, t / 0.4))) * hit(t, 3.2);
        return drive(thud * 1.6 + rum(rnd()) * 7 * hit(t, 3.2), 1.8) * 0.8 + crack(rnd()) * 3 * bursts(t, [0, 0.07, 0.19], 30) * 0.5;
      });
    }
    case 'sfx.ysmeryth.breath': {
      // The indrawn breath, then the roaring blast: a rising band of noise that breaks into a long gout.
      const rnd = noise(332);
      const ph = phasor();
      const band = bandpass(200, 1400);
      const hiss = bandpass(1500, 6000);
      return render(2.6, (t) => {
        const inhale = t < 0.9 ? band(rnd(), 300 + 900 * (t / 0.9)) * 3 * Math.pow(t / 0.9, 1.5) : 0;
        const u = Math.max(0, t - 0.9);
        const blast = t >= 0.9 ? (band(rnd(), 500) * 4 + hiss(rnd()) * 2.5 + Math.sin(ph(60)) * 0.5) * Math.min(1, u / 0.08) * Math.pow(Math.max(0, 1 - u / 1.7), 1.3) : 0;
        return (inhale + blast) * 0.7 * (t >= 0.9 ? 0.75 + 0.25 * Math.sin(TAU * 24 * t) : 1);
      });
    }
    case 'sfx.ysmeryth.call': {
      // A long summoning call: a horn-like tone that climbs a fourth and holds, with a breathy edge.
      const rnd = noise(333);
      const a = phasor();
      const b = phasor();
      const breath = bandpass(200, 1200);
      return render(2.6, (t) => {
        const f = 82 * (1 + 0.33 * Math.min(1, t / 0.9)) * (1 + 0.012 * Math.sin(TAU * 5 * t));
        return env(t, 2.6, 0.4, 1.2) * (saw(a(f), 10) * 0.35 + saw(b(f * 1.5), 6) * 0.15 + breath(rnd()) * 1.2) * 0.8;
      });
    }
    case 'sfx.dragon.wingbeat': {
      // Two slow, heavy beats (one every 1.6 s): a deep thud, a vast low whump of air and a late snap of membrane.
      const rnd = noise(334);
      const ph = phasor();
      const air = lowpass(200);
      const snap = highpass(900);
      return loopRender(3.2, (t) => {
        const u = t % 1.6;
        const thud = Math.sin(ph(46 - 16 * Math.min(1, u / 0.25))) * hit(u, 5);
        const whump = air(rnd()) * 6 * Math.min(1, u / 0.08) * hit(u, 3.2);
        const flap = snap(rnd()) * 0.5 * hit(u - 0.25, 12) * (u > 0.25 ? 1 : 0);
        return 0.8 * thud + 0.7 * whump + flap * 0.4;
      }, 0.8);
    }
    case 'sfx.drake.chain': {
      // A heavy chain struck: iron links ringing and shifting.
      const rnd = noise(335);
      const clink = highpass(1500);
      return render(0.8, (t) => {
        const iron = ring(t, 520, [[1, 0.5, 9], [2.7, 0.35, 12], [5.2, 0.2, 18]]) * 0.5;
        return iron + clink(rnd()) * 2.5 * bursts(t, [0, 0.06, 0.13, 0.22], 45) * 0.5;
      });
    }
    case 'sfx.drake.freed': {
      // The chain falling away: a long rattle of links and a last heavy fall.
      const rnd = noise(336);
      const clink = highpass(1400);
      const ph = phasor();
      return render(1.6, (t) => {
        const times = [0, 0.08, 0.15, 0.27, 0.34, 0.5, 0.58, 0.77, 0.9];
        const rattle = clink(rnd()) * 3 * bursts(t, times, 28) * 0.5 + ring(t, 430, [[1, 0.4, 10], [2.7, 0.25, 14]]) * bursts(t, times, 10) * 0.4;
        const fall = t >= 1.0 ? (Math.sin(ph(70 - 25 * Math.min(1, (t - 1) / 0.12))) * hit(t - 1, 8) + ring(t - 1, 260, [[1, 0.5, 12], [2.5, 0.3, 16]]) * 0.5) : 0;
        return rattle + fall * 0.8;
      });
    }
  }
}
