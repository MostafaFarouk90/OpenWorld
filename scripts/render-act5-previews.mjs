// Renders WAV previews of the Act 5 music and sound (N8): each state of "Heart of the Anvil", the siege mix and its lull,
// Vey's mix and hush, Ulthred's three phases (and phase 3's drop and build as a sequence), the medley stem alone, the two
// ending themes, the credits ballad with each of R30's four verses, the last verse and Tobb's tie verse, the Caldera bed,
// and a strip of every Act 5 sound effect, through the real synth and the shared reverb.
// Usage: npm i --no-save playwright && [CHROMIUM_PATH=/path/to/chrome] node scripts/render-act5-previews.mjs <outDir>
// The out dir is required and must be outside the repo (previews/ is not gitignored), e.g.
// /mnt/project-files/audio-assets/previews/act5.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const outArg = process.argv[2];
if (!outArg) {
  console.error('usage: node scripts/render-act5-previews.mjs <outDir outside the repo>');
  process.exit(2);
}
const outDir = resolve(outArg);
const rel = relative(process.cwd(), outDir); // the repo is the cwd (run from the repo root)
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
    const { ACT5_SFX_KEYS, act5SfxSamples } = await import('/src/audio/act5/act5Sfx.ts');
    const { makeBedSamples } = await import('/src/audio/AmbienceBed.ts');
    const { PLACEHOLDER_SAMPLE_RATE } = await import('/src/audio/proceduralSounds.ts');

    const stemCache = new Map();
    const stemsOf = (track) => {
      if (!stemCache.has(track.id)) stemCache.set(track.id, Object.fromEntries(track.stems.map((s) => [s, synthStem(track, s, RATE)])));
      return stemCache.get(track.id);
    };

    /** Renders `track` through the shared reverb. `seq` is [{ at, mix }] (seconds), each switch ramped over 0.4 s as the director does. */
    async function render(track, seq, { seconds = SECONDS, offsetBars = 4 } = {}) {
      const steps = Array.isArray(seq) ? seq : [{ at: 0, mix: seq }];
      const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      const offset = (offsetBars * 240) / track.bpm;
      for (const [id, data] of Object.entries(stemsOf(track))) {
        const buf = ctx.createBuffer(1, data.length, RATE);
        buf.copyToChannel(data, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(steps[0].mix[id] ?? 0, 0);
        let prev = steps[0].mix;
        for (const s of steps.slice(1)) {
          gain.gain.setValueAtTime(prev[id] ?? 0, s.at);
          prev = s.mix;
          gain.gain.linearRampToValueAtTime(s.mix[id] ?? 0, s.at + 0.4);
        }
        src.connect(gain);
        gain.connect(bus);
        src.start(0, offset);
      }
      MusicReverb.create(ctx, bus, ctx.destination);
      const out = await ctx.startRendering();
      return Float32Array.from(out.getChannelData(0));
    }

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

    const heart = TRACKS_BY_ID['heart-of-the-anvil'];
    const bm = (k, i = 0) => heart.bossMixes[k].phases[i];
    const jobs = [];
    for (const state of ['explore', 'discover', 'combat', 'stealth', 'chase', 'talk', 'ending']) jobs.push([`heart-${state}`, heart, heart.mixes[state]]);
    jobs.push(['heart-siege', heart, bm('siege')], ['heart-siege-lull', heart, bm('siege.lull')]);
    jobs.push(['heart-boss-vey', heart, bm('vey')], ['heart-boss-vey-hush', heart, heart.bossMixes.vey.hush]);
    for (let i = 0; i < 3; i++) jobs.push([`heart-boss-ulthred-phase${i + 1}`, heart, bm('ulthred', i)]);
    jobs.push(['heart-medley-stem-alone', heart, { medley: 1 }]);
    // Ulthred phase 3 as it plays: phase 2 for two bars, the drop (two bars), the one-bar build, then everything.
    {
      const bar = 240 / heart.bpm;
      const t0 = 2 * bar;
      jobs.push([
        'heart-boss-ulthred-phase3-sequence',
        heart,
        [
          { at: 0, mix: bm('ulthred', 1) },
          { at: t0, mix: bm('ulthred.3.drop') },
          { at: t0 + 2 * bar, mix: bm('ulthred.3.build') },
          { at: t0 + 3 * bar, mix: bm('ulthred', 2) },
        ],
        { seconds: 8 * bar + 4, offsetBars: 0 },
      ]);
    }
    for (const id of ['ending.rekindle', 'ending.let-it-die']) jobs.push([`theme-${id.replace('ending.', '')}`, TRACKS_BY_ID[id], TRACKS_BY_ID[id].bossMixes.theme.phases[0]]);
    const credits = TRACKS_BY_ID.credits;
    for (const key of Object.keys(credits.bossMixes)) jobs.push([key.replace('.', '-').replace('.', '-'), credits, credits.bossMixes[key].phases[0]]);
    // The levels beside Dust Chant, for the loudness match.
    for (const state of ['explore', 'combat']) jobs.push([`levels-dust-chant-${state}`, TRACKS_BY_ID['dust-chant'], TRACKS_BY_ID['dust-chant'].mixes[state]]);

    const files = [];
    for (const [name, track, mix, opts] of jobs) files.push({ name, samples: await render(track, mix, opts) });

    // The Caldera bed, two loops.
    const bed = makeBedSamples('caldera', RATE);
    const bedLen = bed.length;
    let bp = 0;
    for (const v of bed) bp = Math.max(bp, Math.abs(v));
    for (let i = 0; i < bed.length; i++) bed[i] *= 0.35 / bp;
    const twoBeds = new Float32Array(bedLen * 2);
    twoBeds.set(bed, 0);
    twoBeds.set(bed, bedLen);
    files.push({ name: 'bed-caldera', samples: twoBeds });

    // Every sound effect in key order with 0.6 s of silence between; the order is printed with the file.
    const gap = Math.round(0.6 * RATE);
    const parts = [];
    const order = [];
    let t = 0;
    for (const key of ACT5_SFX_KEYS) {
      const r = resample(act5SfxSamples(key));
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
