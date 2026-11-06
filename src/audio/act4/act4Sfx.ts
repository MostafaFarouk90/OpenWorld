import { CHIME_PITCHES_HZ, EBBA_BPM, EBBA_TUNE } from '../../music/act4Tracks';
import { bandpass, drive, env, hit, highpass, lowpass, noise, phasor, saw, SR, TAU } from '../sfxKit';

/**
 * Synthesized placeholder sounds for the Act 4 sound pass (L8): the Waste's storms, rope-lines and shelters, the Singing
 * Slag's glass pillars, the Bellows-Engine, husks, the Husk Knight, the Waste Strider, cinder gnats, Archwraith Eormen and
 * the Last Gong, M38's betrayal sting, Ebba's music box and the dream hum. Registered by `act4Sfx.plugin` under these
 * stable keys; a recording registered under the same key replaces one. Deterministic, mono, CC0 (built on `sfxKit`).
 * The loops (`ACT4_LOOP_KEYS`) fold their tail into their head so they repeat without a seam.
 */
export const ACT4_SFX_KEYS = [
  'sfx.storm.loop',
  'sfx.storm.muffled',
  'sfx.storm.onset',
  'sfx.storm.warning',
  'sfx.storm.gust',
  'sfx.rope.creak',
  'sfx.shelter.flap',
  'sfx.glass.pillar.1',
  'sfx.glass.pillar.2',
  'sfx.glass.pillar.3',
  'sfx.glass.pillar.4',
  'sfx.glass.pillar.5',
  'sfx.glass.pillar.6',
  'sfx.glass.wrong',
  'sfx.engine.idle',
  'sfx.engine.piston',
  'sfx.engine.steam',
  'sfx.engine.vent',
  'sfx.engine.valve',
  'sfx.engine.coalshot',
  'sfx.husk.rasp',
  'sfx.husk.rise',
  'sfx.husk.collapse',
  'sfx.huskknight.raise',
  'sfx.huskknight.rush',
  'sfx.huskknight.ember',
  'sfx.strider.click',
  'sfx.strider.lunge',
  'sfx.strider.die',
  'sfx.gnats.buzz',
  'sfx.gnats.sting',
  'sfx.gnats.scatter',
  'sfx.eormen.blades',
  'sfx.eormen.toll',
  'sfx.eormen.release',
  'sfx.gong.last',
  'sfx.m38.betrayal',
  'sfx.ebba.musicbox',
  'sfx.dream.hum',
] as const;
export type Act4SfxKey = (typeof ACT4_SFX_KEYS)[number];

/** The keys that loop (registered with `loop: true`, played through `attach`). */
export const ACT4_LOOP_KEYS: readonly Act4SfxKey[] = ['sfx.storm.loop', 'sfx.storm.muffled', 'sfx.engine.idle', 'sfx.strider.click', 'sfx.gnats.buzz'];
export const isAct4Loop = (key: string): boolean => (ACT4_LOOP_KEYS as readonly string[]).includes(key);

/** The glass pillar key for pillar index 0 to 5 (the Singing Slag; pitches in `CHIME_PITCHES_HZ`). */
export const pillarKey = (pillar: number): Act4SfxKey | undefined =>
  Number.isInteger(pillar) && pillar >= 0 && pillar < 6 ? (`sfx.glass.pillar.${pillar + 1}` as Act4SfxKey) : undefined;

/** Volume per key (loops sit under the music; the bosses and the scene cues fill the space). */
export const ACT4_SFX_VOLUME: Readonly<Record<Act4SfxKey, number>> = {
  'sfx.storm.loop': 0.5,
  'sfx.storm.muffled': 0.4,
  'sfx.storm.onset': 0.6,
  'sfx.storm.warning': 0.45,
  'sfx.storm.gust': 0.45,
  'sfx.rope.creak': 0.4,
  'sfx.shelter.flap': 0.5,
  'sfx.glass.pillar.1': 0.6,
  'sfx.glass.pillar.2': 0.6,
  'sfx.glass.pillar.3': 0.6,
  'sfx.glass.pillar.4': 0.6,
  'sfx.glass.pillar.5': 0.6,
  'sfx.glass.pillar.6': 0.6,
  'sfx.glass.wrong': 0.5,
  'sfx.engine.idle': 0.4,
  'sfx.engine.piston': 0.65,
  'sfx.engine.steam': 0.6,
  'sfx.engine.vent': 0.65,
  'sfx.engine.valve': 0.55,
  'sfx.engine.coalshot': 0.6,
  'sfx.husk.rasp': 0.5,
  'sfx.husk.rise': 0.55,
  'sfx.husk.collapse': 0.55,
  'sfx.huskknight.raise': 0.6,
  'sfx.huskknight.rush': 0.6,
  'sfx.huskknight.ember': 0.6,
  'sfx.strider.click': 0.35,
  'sfx.strider.lunge': 0.6,
  'sfx.strider.die': 0.55,
  'sfx.gnats.buzz': 0.3,
  'sfx.gnats.sting': 0.5,
  'sfx.gnats.scatter': 0.45,
  'sfx.eormen.blades': 0.6,
  'sfx.eormen.toll': 0.65,
  'sfx.eormen.release': 0.6,
  'sfx.gong.last': 0.7,
  'sfx.m38.betrayal': 0.7,
  'sfx.ebba.musicbox': 0.6,
  'sfx.dream.hum': 0.6,
};

/** Hollow-gong partials [ratio, gain, decay per second] (the same set Dust Chant's `toll` stem rings with). */
const GONG: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.7, 0.55], [1.007, 0.45, 0.6], [2.76, 0.35, 1.1], [5.4, 0.18, 2], [8.93, 0.08, 3.4],
];

/** Glass partials: a bright, slightly inharmonic bar with a long shimmer. */
const GLASS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.8, 1.6], [2.01, 0.25, 2.6], [2.76, 0.3, 3.4], [5.4, 0.12, 6], [8.93, 0.05, 9],
];

function ring(t: number, f: number, partials: ReadonlyArray<readonly [number, number, number]>): number {
  let s = 0;
  for (const [r, g, d] of partials) if (f * r < SR * 0.45) s += Math.sin(TAU * f * r * t) * g * hit(t, d);
  return s;
}

/** Sparse bursts: the gain of a train of short decaying hits at the given times (seconds). */
function bursts(t: number, times: readonly number[], rate: number): number {
  let g = 0;
  for (const at of times) if (t >= at) g = Math.max(g, hit(t - at, rate));
  return g;
}

/** Every sound is scaled to this peak after rendering; loudness per key is `ACT4_SFX_VOLUME`. */
export const ACT4_SFX_PEAK = 0.85;

/** Renders `seconds` of `fn(t, i)` with a 3 ms fade at each end, unclamped (the caller normalises). */
function render(seconds: number, fn: (t: number, i: number) => number): Float32Array<ArrayBuffer> {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const edge = Math.round(0.003 * SR);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i) * Math.min(1, i / edge, (n - 1 - i) / edge);
  return out;
}

/** Scales `x` in place to `ACT4_SFX_PEAK` (a scale keeps a loop's seam seamless). */
function normalise(x: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < x.length; i++) x[i] *= ACT4_SFX_PEAK / max;
  return x;
}

/**
 * A seamless loop of `seconds`: renders `seconds + fold` and fades the extra tail into the head, so the last sample runs on
 * into the first. No edge fade (the seam is already continuous), unclamped (the caller normalises).
 */
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

/** The storm wind: band-passed noise with gusting level and centre, a low roar under it and ash grit on top. */
function stormWind(seed: number, muffled: boolean): (t: number) => number {
  const rnd = noise(seed);
  const band = bandpass(300, 2400);
  const roar = lowpass(140);
  const grit = highpass(4200);
  const soft = lowpass(muffled ? 650 : 9000);
  return (t) => {
    const gust = 0.55 + 0.3 * Math.sin(TAU * t / 3.7) + 0.15 * Math.sin(TAU * t / 1.3 + 1);
    const centre = 700 + 600 * gust;
    const air = band(rnd(), centre) * 3.2 * gust;
    const low = roar(rnd()) * 6 * (0.7 + 0.3 * gust);
    const sand = grit(rnd()) * 0.5 * gust * gust;
    return soft(air + low + (muffled ? 0 : sand)) * (muffled ? 1.3 : 0.75);
  };
}

/** Ebba's tune on `voice`, at `EBBA_BPM`: each note's start and length in seconds and its pillar's pitch. */
function ebbaNotes(): { at: number; seconds: number; hz: number }[] {
  const beat = 60 / EBBA_BPM;
  let at = 0;
  return EBBA_TUNE.map((n) => {
    const out = { at, seconds: n.beats * beat, hz: CHIME_PITCHES_HZ[n.pillar] };
    at += n.beats * beat;
    return out;
  });
}

export function act4SfxSamples(key: Act4SfxKey): Float32Array<ArrayBuffer> {
  return normalise(raw(key));
}

function raw(key: Act4SfxKey): Float32Array<ArrayBuffer> {
  if (key.startsWith('sfx.glass.pillar.')) {
    // One struck glass pillar: a hard tick, the glass partials ringing for two seconds, a faint singing beat.
    const hz = CHIME_PITCHES_HZ[Number(key.slice(-1)) - 1];
    const rnd = noise(500 + Number(key.slice(-1)));
    const tick = highpass(3000);
    return render(2.4, (t) => (ring(t, hz, GLASS) * (1 + 0.08 * Math.sin(TAU * 3.1 * t)) * 0.55 + tick(rnd()) * hit(t, 300) * 0.6) * Math.min(1, t / 0.002));
  }
  switch (key) {
    case 'sfx.storm.loop':
      return loopRender(6, stormWind(401, false), 0.8);
    case 'sfx.storm.muffled':
      // The same storm heard through a tent: low-passed, the canvas thrumming.
      return loopRender(6, (() => {
        const w = stormWind(401, true);
        return (t: number) => w(t) * (0.85 + 0.15 * Math.sin(TAU * 7 * t));
      })(), 0.8);
    case 'sfx.storm.onset': {
      // A rising whoosh as the wall of ash arrives, cresting at 2.2 s.
      const rnd = noise(402);
      const band = bandpass(300, 3000);
      const roar = lowpass(160);
      return render(3.2, (t) => {
        const rise = t < 2.2 ? (t / 2.2) ** 2 : hit(t - 2.2, 2.5);
        return drive(band(rnd(), 400 + 1400 * Math.min(1, t / 2.2)) * 3.5 * rise + roar(rnd()) * 6 * rise, 1.3) * 0.8;
      });
    }
    case 'sfx.storm.warning': {
      // Far off: a low rolling rumble, felt more than heard.
      const rnd = noise(403);
      const roar = lowpass(90);
      return render(3.5, (t) => roar(rnd()) * 9 * env(t, 3.5, 0.9, 1.4) * (0.7 + 0.3 * Math.sin(TAU * 0.8 * t)));
    }
    case 'sfx.storm.gust': {
      const rnd = noise(404);
      const band = bandpass(400, 3200);
      return render(1.6, (t) => band(rnd(), 900 + 900 * Math.sin(Math.PI * Math.min(1, t / 1.6))) * 4 * Math.sin(Math.PI * Math.min(1, t / 1.6)) ** 2);
    }
    case 'sfx.rope.creak': {
      // Hemp rope dragging on a post: a stuttering, pitch-wandering friction squeal.
      const rnd = noise(405);
      const ph = phasor();
      const body = bandpass(300, 1500);
      return render(0.9, (t) => {
        const stick = 0.5 + 0.5 * Math.sign(Math.sin(TAU * (28 + 10 * t) * t));
        const f = 340 + 90 * Math.sin(TAU * 1.4 * t);
        return (saw(ph(f), 6) * 0.5 + body(rnd()) * 0.8) * stick * env(t, 0.9, 0.06, 1.2) * 0.8;
      });
    }
    case 'sfx.shelter.flap': {
      // A canvas flap thrown back: two soft slaps and a rustle.
      const rnd = noise(406);
      const cloth = bandpass(250, 2200);
      return render(0.6, (t) => cloth(rnd()) * 3.5 * (bursts(t, [0, 0.13], 30) + 0.25 * env(t, 0.6, 0.02, 2)));
    }
    case 'sfx.glass.wrong': {
      // A cracked, dull clank: the pillar rejects the note.
      const rnd = noise(407);
      const knock = bandpass(500, 2500);
      return render(0.7, (t) => (ring(t, 311, [[1, 0.6, 9], [1.41, 0.5, 11], [2.3, 0.3, 14]]) + knock(rnd()) * hit(t, 40)) * 0.7);
    }
    case 'sfx.engine.idle': {
      // The engine at rest: a slow bellows breath, a ticking escapement and a deep machine hum.
      const rnd = noise(408);
      const breath = bandpass(200, 1200);
      const ph = phasor();
      return loopRender(4, (t) => {
        const lung = Math.sin(Math.PI * ((t / 2) % 1)) ** 2;
        const tick = bursts(t % 0.5, [0], 120);
        return breath(rnd()) * 2 * lung + Math.sin(ph(55)) * 0.25 + Math.sin(TAU * 1900 * t) * tick * 0.2;
      });
    }
    case 'sfx.engine.piston': {
      // The punch: a draw-back hiss (1.0 s, the telegraph), then the iron slam.
      const rnd = noise(409);
      const hiss = highpass(2500);
      const thud = lowpass(180);
      return render(1.6, (t) => {
        const draw = t < 1 ? hiss(rnd()) * (t / 1) ** 1.5 * 0.6 : 0;
        const slam = t >= 1 ? ring(t - 1, 98, [[1, 0.5, 6], [2.76, 0.4, 9], [5.4, 0.2, 14]]) + thud(rnd()) * 6 * hit(t - 1, 18) : 0;
        return drive(draw + slam, 1.4) * 0.8;
      });
    }
    case 'sfx.engine.steam': {
      // A steam jet: a hard onset and a long roaring hiss.
      const rnd = noise(410);
      const hp = highpass(1800);
      return render(1.8, (t) => hp(rnd()) * env(t, 1.8, 0.03, 1.1) * 1.4);
    }
    case 'sfx.engine.vent': {
      // A valve shut and the engine venting (8 s, the poise break): a great gasp falling away to a sputter.
      const rnd = noise(411);
      const hp = highpass(1200);
      const low = lowpass(300);
      return render(3.0, (t) => (hp(rnd()) * 1.3 + low(rnd()) * 3) * env(t, 3, 0.02, 1.6) * (t > 1.4 ? 0.6 + 0.4 * Math.sign(Math.sin(TAU * 9 * t)) : 1));
    }
    case 'sfx.engine.valve': {
      // A wheel valve wrenched shut: iron grinding, then a clank.
      const rnd = noise(412);
      const ph = phasor();
      const iron = bandpass(400, 2000);
      return render(1.2, (t) => {
        const grind = t < 0.8 ? (saw(ph(140 + 60 * t), 6) * 0.4 + iron(rnd()) * 0.6) * 0.7 : 0;
        const clank = t >= 0.8 ? ring(t - 0.8, 420, [[1, 0.6, 12], [2.76, 0.4, 16], [5.4, 0.2, 22]]) : 0;
        return grind + clank;
      });
    }
    case 'sfx.engine.coalshot': {
      // A coal-shot volley: a muffled cough and a scatter of burning lumps.
      const rnd = noise(413);
      const low = lowpass(250);
      const crackle = highpass(2500);
      return render(1.2, (t) => drive(low(rnd()) * 7 * hit(t, 14), 1.5) * 0.6 + crackle(rnd()) * bursts(t, [0.05, 0.11, 0.2, 0.31, 0.44], 60) * 0.7);
    }
    case 'sfx.husk.rasp': {
      // A dry, ash-choked rasp: breath through a dead throat.
      const rnd = noise(414);
      const throat = bandpass(500, 2600);
      return render(1.0, (t) => throat(rnd(), 900 + 300 * Math.sin(TAU * 1.2 * t)) * 3 * env(t, 1, 0.15, 1.3) * (0.6 + 0.4 * Math.sin(TAU * 38 * t)));
    }
    case 'sfx.husk.rise': {
      // Ash shifting and a husk pulling free of it, with a low moan.
      const rnd = noise(415);
      const sand = bandpass(800, 5000);
      const ph = phasor();
      return render(1.8, (t) => sand(rnd()) * 2 * env(t, 1.8, 0.3, 1.4) + Math.sin(ph(120 + 30 * Math.sin(TAU * 0.6 * t))) * 0.3 * env(t, 1.8, 0.6, 1.2));
    }
    case 'sfx.husk.collapse': {
      // The husk crumbles to ash: a sighing exhale and a dry slump.
      const rnd = noise(416);
      const sand = bandpass(500, 4500);
      const low = lowpass(200);
      return render(1.4, (t) => sand(rnd()) * 2.4 * env(t, 1.4, 0.02, 1.8) + low(rnd()) * 4 * hit(t - 0.35, 10) * (t >= 0.35 ? 1 : 0));
    }
    case 'sfx.huskknight.raise': {
      // The 0.7 s greatsword raise with a gong tone (design 13): a scrape of steel and a low toll.
      const rnd = noise(417);
      const scrape = bandpass(2000, 6000);
      return render(1.8, (t) => scrape(rnd()) * (t < 0.7 ? t / 0.7 : 0) * 0.6 + ring(t, 92, GONG) * 0.5 * Math.min(1, t / 0.01));
    }
    case 'sfx.huskknight.rush': {
      // A shield rush: armour clatter and a charging footfall.
      const rnd = noise(418);
      const clat = bandpass(1500, 5000);
      const low = lowpass(160);
      return render(1.0, (t) => clat(rnd()) * 1.6 * bursts(t, [0, 0.12, 0.24, 0.36], 40) + low(rnd()) * 5 * bursts(t, [0, 0.24], 20));
    }
    case 'sfx.huskknight.ember': {
      // The chest ember breaks: a glassy crack and a hot hiss.
      const rnd = noise(419);
      const hp = highpass(3000);
      return render(1.0, (t) => ring(t, 1240, [[1, 0.5, 18], [1.6, 0.4, 22], [2.9, 0.3, 30]]) + hp(rnd()) * env(t, 1, 0.01, 2) * 0.8);
    }
    case 'sfx.strider.click': {
      // The strider's chitin clicking as it stalks: uneven pairs of dry clicks.
      const rnd = noise(420);
      const click = bandpass(1800, 6000);
      const times = [0.1, 0.16, 0.7, 0.74, 1.3, 1.38, 1.9, 1.95, 2.6, 2.66];
      return loopRender(3, (t) => click(rnd()) * 3 * bursts(t, times, 180), 0.2);
    }
    case 'sfx.strider.lunge': {
      // A rattling rear-up and a hiss before the strike.
      const rnd = noise(421);
      const click = bandpass(1800, 6000);
      const hiss = highpass(3500);
      return render(0.9, (t) => click(rnd()) * 3 * (0.5 + 0.5 * Math.sign(Math.sin(TAU * 32 * t))) * env(t, 0.5, 0.01, 1) * (t < 0.5 ? 1 : 0) + hiss(rnd()) * env(t - 0.4, 0.5, 0.02, 1.5) * (t >= 0.4 ? 1 : 0));
    }
    case 'sfx.strider.die': {
      const rnd = noise(422);
      const click = bandpass(1200, 5000);
      const ph = phasor();
      return render(1.2, (t) => click(rnd()) * 2.5 * bursts(t, [0, 0.07, 0.18, 0.33, 0.52], 70) + Math.sin(ph(400 - 280 * Math.min(1, t))) * 0.3 * env(t, 1.2, 0.02, 1.5));
    }
    case 'sfx.gnats.buzz': {
      // A swarm: many slightly detuned wing buzzes, beating against each other.
      const phs = [0, 0, 0, 0, 0];
      const f = [210, 223, 236, 248, 262];
      return loopRender(2, (t) => {
        let s = 0;
        for (let i = 0; i < f.length; i++) {
          phs[i] += (TAU * f[i] * (1 + 0.03 * Math.sin(TAU * (0.7 + i * 0.31) * t + i))) / SR;
          s += Math.sign(Math.sin(phs[i])) * 0.12 + Math.sin(phs[i] * 2) * 0.05;
        }
        return s * 0.6;
      }, 0.3);
    }
    case 'sfx.gnats.sting': {
      // The swarm dives: the buzz rises in pitch and tightens.
      const ph = phasor();
      return render(0.8, (t) => Math.sign(Math.sin(ph(260 + 300 * Math.min(1, t / 0.6)))) * 0.35 * env(t, 0.8, 0.05, 1.2));
    }
    case 'sfx.gnats.scatter': {
      const ph = phasor();
      const rnd = noise(423);
      return render(1.0, (t) => Math.sign(Math.sin(ph(320 - 200 * t + 40 * rnd()))) * 0.3 * env(t, 1, 0.01, 2.2));
    }
    case 'sfx.eormen.blades': {
      // Spirit blades appearing: a 0.8 s blue-white hum swelling, with a glassy shimmer.
      const ph = phasor();
      const ph2 = phasor();
      return render(1.0, (t) => {
        const swell = t < 0.8 ? (t / 0.8) ** 1.5 : hit(t - 0.8, 12);
        return (Math.sin(ph(220 + 40 * t)) * 0.4 + Math.sin(ph2(1320 + 200 * t)) * 0.2 * (0.6 + 0.4 * Math.sin(TAU * 11 * t))) * swell;
      });
    }
    case 'sfx.eormen.toll': {
      // The gong toll (1.2 s wind-up): a rising hum, then a vast hollow toll.
      const ph = phasor();
      return render(4.2, (t) => {
        const wind = t < 1.2 ? Math.sin(ph(70 + 30 * t)) * 0.3 * (t / 1.2) : 0;
        return wind + (t >= 1.2 ? ring(t - 1.2, 62, GONG) * 0.75 : 0);
      });
    }
    case 'sfx.eormen.release': {
      // Released: the toll's partials rising and thinning into air.
      return render(4.0, (t) => ring(t, 123.47 * (1 + 0.5 * Math.min(1, t / 3)), GONG) * env(t, 4, 0.4, 1.4) * 0.7);
    }
    case 'sfx.gong.last': {
      // The Last Gong struck by the player: a brighter, nearer gong with a hard mallet.
      const rnd = noise(424);
      const mallet = lowpass(1200);
      return render(5.0, (t) => ring(t, 98, GONG) * 0.8 + mallet(rnd()) * 3 * hit(t, 60));
    }
    case 'sfx.m38.betrayal': {
      // The betrayal sting: a low brass-like stab over a gong hit, the stab cut short.
      const ph = phasor();
      const ph2 = phasor();
      return render(2.5, (t) => {
        const stab = (saw(ph(82.4), 8) + saw(ph2(87.3), 8)) * 0.35 * env(t, 0.9, 0.02, 2) * (t < 0.9 ? 1 : 0);
        return drive(stab, 1.6) * 0.7 + ring(t, 82.4, GONG) * 0.5;
      });
    }
    case 'sfx.ebba.musicbox': {
      // Ebba's tune on a small music-box comb: bright plucked tines with a soft metallic tail, a little slow.
      const notes = ebbaNotes();
      const total = notes[notes.length - 1].at + notes[notes.length - 1].seconds + 1.5;
      const tine: ReadonlyArray<readonly [number, number, number]> = [[1, 0.7, 2.2], [3, 0.12, 5], [5.4, 0.06, 9]];
      return render(total, (t) => {
        let s = 0;
        // A tine has rung out (exp(-2.2 t)) about 3 s after it was plucked.
        for (const n of notes) if (t >= n.at && t - n.at < 3) s += ring(t - n.at, n.hz * 2, tine) * Math.min(1, (t - n.at) / 0.002);
        return s * 0.45;
      });
    }
    case 'sfx.dream.hum': {
      // The same tune hummed low (Ulthred in Cael's dream, Q10): a closed-mouth "mm", two octaves down, slow vibrato.
      const notes = ebbaNotes();
      const total = notes[notes.length - 1].at + notes[notes.length - 1].seconds + 0.5;
      const ph = phasor();
      const warm = lowpass(900);
      let idx = 0;
      let gain = 0;
      const smoothK = 1 - Math.exp(-1 / (0.015 * SR));
      return render(total, (t) => {
        while (idx + 1 < notes.length && t >= notes[idx + 1].at) idx++;
        const cur = notes[idx];
        const u = (t - cur.at) / cur.seconds;
        // A legato hum: each note dips and swells, the gain smoothed (about 15 ms) so a note change never steps.
        const target = Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.2 + 0.3);
        gain += (target - gain) * smoothK;
        const shape = gain;
        const hz = (cur.hz / 4) * (1 + 0.006 * Math.sin(TAU * 5 * t));
        const p = ph(hz);
        return warm(Math.sin(p) + 0.4 * Math.sin(2 * p) + 0.2 * Math.sin(3 * p)) * shape * 0.55;
      });
    }
  }
  // Every key is handled above; the glass pillars return before the switch.
  throw new Error(`act4Sfx: no synth for ${key}`);
}
