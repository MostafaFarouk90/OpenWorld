// Renders WAV previews of the Act 4 music and sound (L8): each state of "Dust Chant" and the Harrowmark ash variant of
// "Seven Gates, One Drum", the Eormen, Bellows-Engine and M38 mixes, the Act 3 tracks after their trim beside Barley and
// Seven Gates (explore and combat, for the loudness match), the Ashen Waste bed with a storm passing, and a strip of
// every Act 4 sound effect, through the real synth and the shared reverb.
// Usage: npm i --no-save playwright && [CHROMIUM_PATH=/path/to/chrome] node scripts/render-act4-previews.mjs <outDir>
// The out dir is required and must be outside the repo (previews/ is not gitignored), e.g.
// /mnt/project-files/audio-assets/previews/act4.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const outArg = process.argv[2];
if (!outArg) {
  console.error('usage: node scripts/render-act4-previews.mjs <outDir outside the repo>');
  process.exit(2);
}
const outDir = resolve(outArg);
const rel = relative(process.cwd(), outDir);
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  console.error(`refusing to write previews inside the repo (${outDir})`);
  process.exit(2);
}
const SECONDS = 24;
const RATE = 44100;
mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:5199/');

const result = await page.evaluate(
  async ({ SECONDS, RATE }) => {
    const { synthStem } = await import('/src/music/stemSynth.ts');
    const { TRACKS_BY_ID } = await import('/src/music/tracks.ts');
    const { MusicReverb } = await import('/src/audio/MusicReverb.ts');
    const { ACT4_SFX_KEYS, act4SfxSamples } = await import('/src/audio/act4/act4Sfx.ts');
    const { ASHEN_WASTE_BED_SECONDS, fillAshenWasteBed } = await import('/src/audio/act4/ambienceAct4.ts');
    const { PLACEHOLDER_SAMPLE_RATE } = await import('/src/audio/proceduralSounds.ts');

    const stemCache = new Map();
    const stemsOf = (track) => {
      if (!stemCache.has(track.id)) stemCache.set(track.id, Object.fromEntries(track.stems.map((s) => [s, synthStem(track, s, RATE)])));
      return stemCache.get(track.id);
    };

    async function render(track, mix, { seconds = SECONDS, offsetBars = 4 } = {}) {
      const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      const stems = stemsOf(track);
      const offset = (offsetBars * 240) / track.bpm;
      for (const [id, data] of Object.entries(stems)) {
        const g = mix[id] ?? 0;
        if (g <= 0) continue;
        const buf = ctx.createBuffer(1, data.length, RATE);
        buf.copyToChannel(data, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = g;
        src.connect(gain);
        gain.connect(bus);
        src.start(0, offset);
      }
      MusicReverb.create(ctx, bus, ctx.destination);
      const out = await ctx.startRendering();
      return Float32Array.from(out.getChannelData(0));
    }

    /** sfxKit renders at its own rate; resample to RATE by linear interpolation. */
    const resample = (s) => {
      const ratio = PLACEHOLDER_SAMPLE_RATE / RATE;
      const n = Math.round(s.length / ratio);
      const r = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const f = x - i0;
        r[i] = (s[i0] ?? 0) * (1 - f) + (s[i0 + 1] ?? 0) * f;
      }
      return r;
    };

    const dust = TRACKS_BY_ID['dust-chant'];
    const ash = TRACKS_BY_ID['seven-gates-ash'];
    const jobs = [];
    for (const [tag, t] of [['dustchant', dust], ['sevengatesash', ash]]) {
      for (const state of ['explore', 'discover', 'combat', 'stealth', 'chase', 'talk', 'ending']) jobs.push([`${tag}-${state}`, t, t.mixes[state]]);
      for (const [boss, def] of Object.entries(t.bossMixes ?? {})) {
        def.phases.forEach((m, i) => jobs.push([`${tag}-boss-${boss}-phase${i + 1}`, t, m]));
        if (def.hush) jobs.push([`${tag}-boss-${boss}-hush`, t, def.hush]);
      }
    }
    // The loudness match: the trimmed Act 3 tracks beside Barley and Seven Gates, explore and combat.
    for (const id of ['barley-and-brazier', 'seven-gates-one-drum', 'peat-and-pitch', 'wing-over-rime']) {
      for (const state of ['explore', 'combat']) jobs.push([`levels-${id}-${state}`, TRACKS_BY_ID[id], TRACKS_BY_ID[id].mixes[state]]);
    }
    const files = [];
    for (const [name, track, mix] of jobs) files.push({ name, samples: await render(track, mix) });

    // The M38 switch: 12 s of the council mix, then the betrayal mix (a 0.4 s ramp, as the director does), with the sting.
    {
      const council = ash.bossMixes['m38-council'].phases[0];
      const betrayal = ash.bossMixes['m38-betrayal'].phases[0];
      const seconds = 22;
      const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      for (const [id, data] of Object.entries(stemsOf(ash))) {
        const buf = ctx.createBuffer(1, data.length, RATE);
        buf.copyToChannel(data, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(council[id] ?? 0, 0);
        gain.gain.setValueAtTime(council[id] ?? 0, 12);
        gain.gain.linearRampToValueAtTime(betrayal[id] ?? 0, 12.4);
        src.connect(gain);
        gain.connect(bus);
        src.start(0);
      }
      MusicReverb.create(ctx, bus, ctx.destination);
      const out = Float32Array.from((await ctx.startRendering()).getChannelData(0));
      const sting = resample(act4SfxSamples('sfx.m38.betrayal'));
      for (let i = 0; i < sting.length && 12 * RATE + i < out.length; i++) out[12 * RATE + i] += sting[i] * 0.7;
      files.push({ name: 'sevengatesash-m38-betrayal-switch', samples: out });
    }

    // The Waste bed (two loops), then the bed with a storm passing: warning at 4 s, onset at 8 s, wind and gusts to 28 s.
    const bedLen = ASHEN_WASTE_BED_SECONDS * RATE;
    const bedRaw = new Float32Array(bedLen + RATE);
    fillAshenWasteBed(bedRaw, bedLen, RATE, 0x7e8f90);
    const bed = bedRaw.subarray(0, bedLen);
    let bp = 0;
    for (const v of bed) bp = Math.max(bp, Math.abs(v));
    for (let i = 0; i < bed.length; i++) bed[i] *= 0.35 / bp;
    const twoBeds = new Float32Array(bedLen * 2);
    twoBeds.set(bed, 0);
    twoBeds.set(bed, bedLen);
    files.push({ name: 'bed-ashen-waste', samples: twoBeds });
    {
      const out = new Float32Array(32 * RATE);
      for (let i = 0; i < out.length; i++) out[i] = bed[i % bedLen];
      const put = (key, at, gain) => {
        const s = resample(act4SfxSamples(key));
        for (let i = 0; i < s.length && at * RATE + i < out.length; i++) out[Math.round(at * RATE) + i] += s[i] * gain;
      };
      put('sfx.storm.warning', 4, 0.45);
      put('sfx.storm.onset', 8, 0.6);
      const loop = resample(act4SfxSamples('sfx.storm.loop'));
      for (let t = 10.2 * RATE, k = 0; t < 28 * RATE; t++, k++) out[t] += loop[k % loop.length] * 0.5 * Math.min(1, k / RATE) * Math.min(1, (28 * RATE - t) / (2 * RATE));
      for (const [at, key] of [[12, 'sfx.storm.gust'], [17.5, 'sfx.storm.gust'], [18, 'sfx.rope.creak'], [23, 'sfx.storm.gust']]) put(key, at, 0.45);
      files.push({ name: 'bed-ashen-waste-storm-passing', samples: out });
    }

    // Every sound effect in key order with 0.6 s of silence between; the order is printed with the file.
    const gap = Math.round(0.6 * RATE);
    const parts = [];
    const order = [];
    let t = 0;
    for (const key of ACT4_SFX_KEYS) {
      const r = resample(act4SfxSamples(key));
      order.push(`${(t / RATE).toFixed(1).padStart(6)} s  ${key}`);
      parts.push(r, new Float32Array(gap));
      t += r.length + gap;
    }
    const strip = new Float32Array(t);
    let at = 0;
    for (const p of parts) {
      strip.set(p, at);
      at += p.length;
    }
    files.push({ name: 'sfx-strip', samples: strip });
    for (const key of ['sfx.ebba.musicbox', 'sfx.dream.hum']) files.push({ name: key.replace(/^sfx\./, '').replace('.', '-'), samples: resample(act4SfxSamples(key)) });
    window.__previewFiles = files;
    return { names: files.map((f) => f.name), order };
  },
  { SECONDS, RATE },
);

function wav(samples) {
  const n = samples.length;
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.95 ? 0.95 / peak : 1;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  return buf;
}

for (const name of result.names) {
  const f = { name, samples: await page.evaluate((n) => {
    const f = window.__previewFiles.find((x) => x.name === n);
    let bin = '';
    const bytes = new Uint8Array(f.samples.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, name).then((b64) => new Float32Array(Buffer.from(b64, 'base64').buffer.slice(0))) };
  writeFileSync(`${outDir}/${f.name}.wav`, wav(f.samples));
  let sq = 0;
  let pk = 0;
  for (const s of f.samples) {
    sq += s * s;
    pk = Math.max(pk, Math.abs(s));
  }
  console.log(f.name.padEnd(34), 'peak', pk.toFixed(3), 'rms', Math.sqrt(sq / f.samples.length).toFixed(4));
}
writeFileSync(`${outDir}/sfx-strip.txt`, result.order.join('\n') + '\n');
console.log(`wrote ${result.names.length} previews and sfx-strip.txt to ${outDir}`);
await browser.close();
await server.close();
