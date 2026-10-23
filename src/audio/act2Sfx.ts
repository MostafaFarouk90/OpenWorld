import { bandpass, drive, env, hit, highpass, lowpass, noise, phasor, render, saw, TAU } from './sfxKit';

/**
 * Synthesized placeholder sounds for the Act 2 sound pass: the A6b ground enemies (golem, slag crawler, hunters), the
 * A7 raid carts and barricade, and the A9 Weeping Bellows. Registered by `act2Sfx.plugin` under these stable keys; a real
 * recording registered under the same key replaces one. Deterministic, mono, CC0 (built on `sfxKit`).
 */
export const ACT2_SFX_KEYS = [
  'sfx.golem.stomp',
  'sfx.golem.slam',
  'sfx.golem.throw',
  'sfx.golem.corebreak',
  'sfx.golem.crumble',
  'sfx.crawler.bite',
  'sfx.crawler.spit',
  'sfx.crawler.drop',
  'sfx.crawler.hiss',
  'sfx.hunter.thrust',
  'sfx.hunter.net',
  'sfx.hunter.harpoon',
  'sfx.cart.hit',
  'sfx.cart.break',
  'sfx.barricade.ram',
  'sfx.barricade.fall',
  'sfx.bellows.valve',
  'sfx.bellows.hiss',
  'sfx.bellows.solved',
  'sfx.bellows.vent',
  'sfx.slagmaw.rumble',
  'sfx.slagmaw.tremor',
  'sfx.slagmaw.tremor.chain',
  'sfx.slagmaw.erupt',
  'sfx.slagmaw.spit',
  'sfx.slagmaw.valve',
] as const;
/** The keys the Slagmaw fight (`src/bosses/slagmaw`) plays; they replace its placeholders under the same names. */
export const SLAGMAW_SFX_KEYS = ACT2_SFX_KEYS.filter((k) => k.startsWith('sfx.slagmaw.'));
export type Act2SfxKey = (typeof ACT2_SFX_KEYS)[number];

/** Volume per key (the golem and the barricade fill the space; the chime sits just under the music). */
export const ACT2_SFX_VOLUME: Readonly<Record<Act2SfxKey, number>> = {
  'sfx.golem.stomp': 0.9,
  'sfx.golem.slam': 0.95,
  'sfx.golem.throw': 0.7,
  'sfx.golem.corebreak': 0.8,
  'sfx.golem.crumble': 0.85,
  'sfx.crawler.bite': 0.6,
  'sfx.crawler.spit': 0.55,
  'sfx.crawler.drop': 0.7,
  'sfx.crawler.hiss': 0.5,
  'sfx.hunter.thrust': 0.5,
  'sfx.hunter.net': 0.5,
  'sfx.hunter.harpoon': 0.7,
  'sfx.cart.hit': 0.6,
  'sfx.cart.break': 0.9,
  'sfx.barricade.ram': 0.9,
  'sfx.barricade.fall': 0.95,
  'sfx.bellows.valve': 0.6,
  'sfx.bellows.hiss': 0.45,
  'sfx.bellows.solved': 0.6,
  'sfx.bellows.vent': 0.6,
  'sfx.slagmaw.rumble': 0.8,
  'sfx.slagmaw.tremor': 0.85,
  'sfx.slagmaw.tremor.chain': 0.95,
  'sfx.slagmaw.erupt': 1,
  'sfx.slagmaw.spit': 0.6,
  'sfx.slagmaw.valve': 0.7,
};

/** A struck partial set (a bell, a metal ring): `partials` are [ratio, gain, decay per second]. */
function ring(t: number, f: number, partials: ReadonlyArray<readonly [number, number, number]>): number {
  let s = 0;
  for (const [r, g, d] of partials) s += Math.sin(TAU * f * r * t) * g * hit(t, d);
  return s;
}

const BELL: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 2.6],
  [2.01, 0.5, 3.4],
  [2.76, 0.35, 4.5],
  [4.07, 0.2, 6],
];

/** Sparse bursts: the gain of a train of short decaying hits at the given times (seconds). */
function bursts(t: number, times: readonly number[], rate: number): number {
  let g = 0;
  for (const at of times) if (t >= at) g = Math.max(g, hit(t - at, rate));
  return g;
}

export function act2SfxSamples(key: Act2SfxKey): Float32Array<ArrayBuffer> {
  switch (key) {
    case 'sfx.golem.stomp': {
      const rnd = noise(101);
      const ph = phasor();
      const rum = lowpass(180);
      const grit = highpass(1500);
      return render(0.9, (t) => {
        const thud = Math.sin(ph(58 - 28 * Math.min(1, t / 0.25))) * hit(t, 7);
        const gravel = grit(rnd()) * bursts(t, [0.02, 0.09, 0.17, 0.3], 30) * 0.5;
        return drive(thud * 1.3 + rum(rnd()) * 5 * hit(t, 6), 1.5) * 0.8 + gravel;
      });
    }
    case 'sfx.golem.slam': {
      const rnd = noise(102);
      const ph = phasor();
      const rum = lowpass(150);
      const crack = bandpass(900, 3200);
      return render(1.0, (t) => {
        const thud = Math.sin(ph(48 - 20 * Math.min(1, t / 0.3))) * hit(t, 5.5);
        const split = crack(rnd()) * 3 * hit(t, 40);
        return drive(thud * 1.4 + rum(rnd()) * 5 * hit(t, 5), 1.6) * 0.8 + split * 0.6;
      });
    }
    case 'sfx.golem.throw': {
      // A grinding heave that climbs, then the whoosh of the released rock.
      const rnd = noise(103);
      const ph = phasor();
      const whoosh = bandpass(400, 1600);
      const low = lowpass(400);
      return render(0.8, (t) => {
        const heave = t < 0.4 ? saw(ph(52 + 40 * (t / 0.4)), 10) * (0.55 + 0.45 * Math.sin(TAU * 18 * t)) * Math.min(1, t / 0.1) : 0;
        const air = t >= 0.4 ? whoosh(rnd(), 500 + 700 * ((t - 0.4) / 0.4)) * 4 * hit(t - 0.4, 6) : 0;
        return drive(heave, 1.8) * 0.5 + low(rnd()) * 0.4 * (t < 0.4 ? 1 : hit(t - 0.4, 10)) + air * 0.6;
      });
    }
    case 'sfx.golem.corebreak': {
      // The back core cracks: a glassy snap and a falling, inharmonic ring.
      const rnd = noise(104);
      const tick = highpass(3000);
      return render(0.8, (t) => {
        const snap = tick(rnd()) * hit(t, 45) * 1.4;
        const rg = ring(t, 1250 - 650 * Math.min(1, t / 0.6), [
          [1, 0.6, 5],
          [1.47, 0.4, 7],
          [2.3, 0.25, 9],
        ]);
        return snap + rg * 0.6;
      });
    }
    case 'sfx.golem.crumble': {
      // The golem settles into a cairn: a long rumble under falling rock clatter that thins out.
      const rnd = noise(105);
      const rum = lowpass(110);
      const rock = bandpass(300, 2400);
      const times: number[] = [];
      const r = noise(205);
      for (let i = 0; i < 26; i++) times.push(((r() + 1) / 2) ** 1.7 * 1.3);
      return render(1.7, (t) => {
        const clatter = rock(rnd(), 600 + 1200 * (rnd() * 0.5 + 0.5)) * bursts(t, times, 38) * 5;
        return rum(rnd()) * 6 * env(t, 1.7, 0.08, 1.4) + clatter * hit(t, 1.2);
      });
    }
    case 'sfx.crawler.bite': {
      // A wet snap with a couple of chitin clicks.
      const rnd = noise(106);
      const snap = bandpass(1500, 4500);
      return render(0.3, (t) => snap(rnd()) * 4 * (bursts(t, [0, 0.05, 0.1], 70) * 0.7 + hit(t - 0.14, 30) * (t > 0.14 ? 0.5 : 0)));
    }
    case 'sfx.crawler.spit': {
      // A slag glob: a boiling hiss with bubble pops that fall in pitch.
      const rnd = noise(107);
      const hiss = highpass(2800);
      const ph = phasor();
      return render(0.55, (t) => {
        const u = t / 0.55;
        const bub = Math.sin(ph(380 - 160 * ((t * 22) % 1))) * 0.25 * (0.5 + 0.5 * Math.sin(TAU * 22 * t)) ** 3;
        return hiss(rnd()) * 0.9 * Math.sin(Math.PI * Math.sqrt(u)) * (1 - u) + bub * (1 - u);
      });
    }
    case 'sfx.crawler.drop': {
      // The crawler lands from the ceiling: a short thud and a sizzle of slag on stone.
      const rnd = noise(108);
      const rum = lowpass(200);
      const sizzle = highpass(3500);
      const ph = phasor();
      return render(0.7, (t) => {
        const thud = Math.sin(ph(90 - 40 * Math.min(1, t / 0.1))) * hit(t, 14);
        return thud + rum(rnd()) * 3 * hit(t, 12) + sizzle(rnd()) * 0.5 * hit(t, 5) * (0.6 + 0.4 * rnd());
      });
    }
    case 'sfx.crawler.hiss': {
      // A cooling hit: slag quenched, a steam hiss that swells and fades.
      const rnd = noise(109);
      const steam = bandpass(2500, 9000);
      return render(1.0, (t) => {
        const u = t / 1.0;
        return steam(rnd()) * 6 * Math.sin(Math.PI * Math.pow(u, 0.5)) * (1 - u * u) * (0.8 + 0.2 * rnd());
      });
    }
    case 'sfx.hunter.thrust': {
      // A spear thrust: a short rising whoosh and a metal tick at the end.
      const rnd = noise(110);
      const air = bandpass(500, 2500);
      return render(0.32, (t) => air(rnd(), 800 + 2200 * (t / 0.32)) * 4 * Math.sin(Math.PI * Math.min(1, t / 0.2)) * (1 - t / 0.32) + ring(t - 0.2, 2100, [[1, 0.5, 40]]) * (t > 0.2 ? 1 : 0));
    }
    case 'sfx.hunter.net': {
      // A thrown net: a whirling flutter that fades as it flies off.
      const rnd = noise(111);
      const air = bandpass(700, 3000);
      return render(0.55, (t) => {
        const flutter = 0.5 + 0.5 * Math.sin(TAU * (26 - 14 * (t / 0.55)) * t);
        return air(rnd()) * 4.5 * flutter * Math.min(1, t / 0.06) * (1 - t / 0.55);
      });
    }
    case 'sfx.hunter.harpoon': {
      // A hard throw: a heavy whoosh and the twang of the line pulling taut.
      const rnd = noise(112);
      const air = bandpass(300, 1800);
      return render(0.7, (t) => {
        const w = air(rnd(), 350 + 1400 * Math.min(1, t / 0.2)) * 5 * hit(t, 9) * Math.min(1, t / 0.02);
        const twang = t > 0.15 ? ring(t - 0.15, 190, [[1, 0.5, 7], [2, 0.3, 9], [3, 0.2, 12], [5, 0.1, 18]]) * (1 + 0.04 * Math.sin(TAU * 40 * t)) : 0;
        return w * 0.7 + twang * 0.7;
      });
    }
    case 'sfx.cart.hit': {
      // A blow on a wooden cart: a hollow knock and a short splinter tick.
      const rnd = noise(113);
      const tick = bandpass(1200, 3500);
      const ph = phasor();
      return render(0.4, (t) => Math.sin(ph(190 - 70 * Math.min(1, t / 0.08))) * hit(t, 20) + tick(rnd()) * 3 * hit(t, 60));
    }
    case 'sfx.cart.break': {
      // The cart comes apart: a crack, falling planks, a rolling wheel that wobbles out.
      const rnd = noise(114);
      const crack = bandpass(800, 4000);
      const rum = lowpass(160);
      const planks = [0.12, 0.25, 0.33, 0.5, 0.61, 0.8];
      return render(1.4, (t) => {
        const split = crack(rnd()) * 4 * hit(t, 22);
        const wood = crack(rnd(), 500) * 3 * bursts(t, planks, 28);
        const wheel = t > 0.6 ? Math.sin(TAU * 7 * (t - 0.6) ** 0.7 * 3) * 0.15 * rum(rnd()) * 8 * (1 - (t - 0.6) / 0.8) : 0;
        return split * 0.8 + wood * 0.7 + rum(rnd()) * 3 * hit(t, 4) + wheel;
      });
    }
    case 'sfx.barricade.ram': {
      // A cart rams the palisade: a deep boom, the crunch of posts and a long creak of strained timber.
      const rnd = noise(115);
      const ph = phasor();
      const cph = phasor();
      const crunch = bandpass(400, 2800);
      const rum = lowpass(140);
      return render(1.0, (t) => {
        const boom = Math.sin(ph(62 - 24 * Math.min(1, t / 0.2))) * hit(t, 6);
        const posts = crunch(rnd()) * 3 * (hit(t, 25) + 0.5 * hit(t - 0.09, 22) * (t > 0.09 ? 1 : 0));
        const creak = t > 0.1 ? saw(cph(170 - 60 * ((t - 0.1) / 0.9) + 25 * Math.sin(TAU * 11 * t)), 6) * 0.18 * hit(t - 0.1, 3.5) * (0.6 + 0.4 * Math.sin(TAU * 31 * t)) : 0;
        return drive(boom * 1.3 + rum(rnd()) * 4 * hit(t, 7), 1.5) * 0.8 + posts * 0.6 + creak;
      });
    }
    case 'sfx.barricade.fall': {
      // The palisade falls: three heavy timber crashes and a settling rumble.
      const rnd = noise(116);
      const crunch = bandpass(300, 2600);
      const rum = lowpass(120);
      return render(1.8, (t) => {
        const crashes = [0, 0.22, 0.5];
        let boom = 0;
        for (const at of crashes) if (t >= at) boom += Math.sin(TAU * (55 - 15 * Math.min(1, (t - at) / 0.3)) * (t - at)) * hit(t - at, 7);
        const wood = crunch(rnd()) * 3.5 * bursts(t, [0, 0.07, 0.22, 0.3, 0.5, 0.58, 0.8], 24);
        return drive(boom * 0.8, 1.4) * 0.7 + wood * 0.6 + rum(rnd()) * 5 * env(t, 1.8, 0.05, 1.5);
      });
    }
    case 'sfx.bellows.valve': {
      // A valve wheel turned: a squeal of dry metal and a ratchet of six clicks.
      const rnd = noise(117);
      const ph = phasor();
      const click = highpass(1800);
      const clicks = [0.05, 0.16, 0.27, 0.38, 0.49, 0.6];
      return render(0.8, (t) => {
        const squeal = t < 0.65 ? Math.sin(ph(640 + 140 * Math.sin(TAU * 9 * t) + 300 * (t / 0.65))) * 0.12 * Math.sin(Math.PI * (t / 0.65)) : 0;
        const tick = click(rnd()) * 2.2 * bursts(t, clicks, 90);
        return squeal + tick * 0.5 + ring(t - 0.62, 520, [[1, 0.4, 9], [2.7, 0.25, 12]]) * (t > 0.62 ? 1 : 0);
      });
    }
    case 'sfx.bellows.hiss': {
      // Pressure venting: a high steady hiss under a thin whistle, swelling in and fading out.
      const rnd = noise(118);
      const steam = bandpass(3000, 9500);
      const ph = phasor();
      return render(1.4, (t) => {
        const u = t / 1.4;
        const shape = Math.min(1, t / 0.15) * (1 - Math.pow(u, 3));
        return shape * (steam(rnd()) * 5.5 * (0.85 + 0.15 * Math.sin(TAU * 3 * t)) + 0.05 * Math.sin(ph(3900 + 80 * Math.sin(TAU * 4 * t))));
      });
    }
    case 'sfx.bellows.solved': {
      // A rising chime: four bell strikes up an open fifth arpeggio, the last left to ring.
      const notes = [523.25, 659.25, 783.99, 1046.5];
      return render(2.2, (t) => {
        let s = 0;
        notes.forEach((f, i) => {
          const at = i * 0.16;
          if (t >= at) s += ring(t - at, f, BELL) * (i === notes.length - 1 ? 1 : 0.7);
        });
        return s * 0.28;
      });
    }
    case 'sfx.bellows.vent': {
      // The puzzle fails and the line vents: a bang of metal and a falling gust.
      const rnd = noise(119);
      const gust = lowpass(900);
      const click = highpass(2000);
      return render(1.0, (t) => {
        const u = t / 1.0;
        return click(rnd()) * 2.5 * hit(t, 40) + ring(t, 300, [[1, 0.5, 8], [2.4, 0.3, 11]]) * 0.5 + gust(rnd(), 1400 - 1100 * u) * 5 * Math.min(1, t / 0.03) * (1 - u) ** 1.5;
      });
    }
    case 'sfx.slagmaw.rumble': {
      // The intro cue: something vast turning over under the floor. A deep, wobbling drone with slow grinding stones.
      const rnd = noise(121);
      const ph = phasor();
      const rum = lowpass(90);
      const grind = bandpass(120, 700);
      return render(2.6, (t) => {
        const swell = env(t, 2.6, 0.9, 1.3);
        const drone = Math.sin(ph(34 + 6 * Math.sin(TAU * 0.7 * t))) * (0.7 + 0.3 * Math.sin(TAU * 3.1 * t));
        const stones = grind(rnd()) * bursts(t, [0.4, 0.95, 1.3, 1.85], 7) * 3;
        return drive(drone * 0.9 + rum(rnd()) * 6, 1.6) * 0.75 * swell + stones * 0.35 * swell;
      });
    }
    case 'sfx.slagmaw.tremor': {
      // A single heavy pulse through the floor before the worm moves: a low thump that sags in pitch, and a dull gravel rattle.
      const rnd = noise(122);
      const ph = phasor();
      const rum = lowpass(130);
      const grit = bandpass(200, 1200);
      return render(1.1, (t) => {
        const thump = Math.sin(ph(52 - 24 * Math.min(1, t / 0.35))) * hit(t, 5);
        return drive(thump * 1.3 + rum(rnd()) * 5 * hit(t, 4.5), 1.5) * 0.8 + grit(rnd()) * bursts(t, [0.05, 0.13, 0.24], 22) * 1.2;
      });
    }
    case 'sfx.slagmaw.tremor.chain': {
      // The same tremor chained: three hammering pulses, each a little higher and harder, the last left to fall away.
      const rnd = noise(123);
      const rum = lowpass(140);
      const grit = bandpass(250, 1800);
      const pulses = [0, 0.28, 0.54];
      return render(1.5, (t) => {
        let thump = 0;
        pulses.forEach((at, i) => {
          if (t >= at) thump += Math.sin(TAU * (50 + 8 * i - 22 * Math.min(1, (t - at) / 0.3)) * (t - at)) * hit(t - at, 6.5) * (0.75 + 0.15 * i);
        });
        return drive(thump * 1.4 + rum(rnd()) * 5 * Math.max(hit(t, 3.2), 0), 1.7) * 0.8 + grit(rnd()) * bursts(t, [0.04, 0.32, 0.58], 26) * 1.4;
      });
    }
    case 'sfx.slagmaw.erupt': {
      // The worm breaks the floor: a crack of rock, a roar that climbs and tears, and a slow fall of molten debris.
      const rnd = noise(124);
      const ph = phasor();
      const crack = bandpass(700, 4200);
      const rum = lowpass(100);
      const roar = bandpass(150, 1400);
      const debris = highpass(1800);
      const times: number[] = [];
      const r = noise(224);
      for (let i = 0; i < 20; i++) times.push(0.25 + ((r() + 1) / 2) ** 1.5 * 1.0);
      return render(1.9, (t) => {
        const split = crack(rnd()) * 4 * hit(t, 28);
        const boom = Math.sin(ph(44 - 14 * Math.min(1, t / 0.6))) * hit(t, 3.2);
        const growl = saw(TAU * (70 + 90 * Math.min(1, t / 0.5)) * t, 6) * (0.6 + 0.4 * Math.sin(TAU * 31 * t));
        const body = roar(rnd() * 0.6 + growl * 0.4) * 3.2 * env(t, 1.9, 0.05, 1.6);
        return drive(boom * 1.2 + rum(rnd()) * 5 * hit(t, 2.6), 1.6) * 0.7 + split * 0.5 + body * 0.5 + debris(rnd()) * bursts(t, times, 16) * 0.5;
      });
    }
    case 'sfx.slagmaw.spit': {
      // A glob of slag lobbed: a wet gurgle building in the throat, a pop of release, then a hissing arc.
      const rnd = noise(125);
      const ph = phasor();
      const wet = lowpass(500);
      const hiss = bandpass(2500, 7500);
      return render(0.9, (t) => {
        const gurgle = t < 0.3 ? Math.sin(ph(110 + 160 * (t / 0.3) + 60 * Math.sin(TAU * 26 * t))) * Math.min(1, t / 0.05) * (0.6 + 0.4 * Math.sin(TAU * 22 * t)) : 0;
        const pop = wet(rnd(), 1800) * 4 * hit(t - 0.3, 45) * (t >= 0.3 ? 1 : 0);
        const arc = t >= 0.3 ? hiss(rnd()) * 3.5 * hit(t - 0.3, 6) : 0;
        return drive(gurgle, 1.8) * 0.45 + pop * 0.8 + arc * 0.4 + wet(rnd()) * 0.5 * (t < 0.3 ? t / 0.3 : hit(t - 0.3, 12));
      });
    }
    case 'sfx.slagmaw.valve': {
      // A cooling valve thrown open: a heavy iron clank, a grating turn, then a surge of quenching steam.
      const rnd = noise(126);
      const ph = phasor();
      const steam = bandpass(2200, 9000);
      const clank = highpass(1200);
      return render(1.3, (t) => {
        const iron = ring(t, 190, [[1, 0.6, 7], [2.32, 0.4, 10], [3.9, 0.25, 14]]) * 0.55;
        const bang = clank(rnd()) * 2.6 * hit(t, 55);
        const turn = t > 0.08 && t < 0.4 ? Math.sin(ph(260 + 120 * ((t - 0.08) / 0.32))) * 0.1 * Math.sin(Math.PI * ((t - 0.08) / 0.32)) : 0;
        const surge = t >= 0.3 ? steam(rnd()) * 5 * Math.min(1, (t - 0.3) / 0.12) * (1 - ((t - 0.3) / 1.0) ** 2) * (t < 1.3 ? 1 : 0) : 0;
        return iron + bang * 0.5 + turn + surge * 0.6;
      });
    }
  }
}
