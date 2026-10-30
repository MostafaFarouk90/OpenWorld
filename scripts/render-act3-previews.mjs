// Renders WAV previews of the Act 3 music (K14): each state of "Peat and Pitch" and "Wing over Rime", the Murkjaw,
// Skarl and Ysmeryth-trial mixes (the trial chant at 3 minutes, to hear the loop join), both ambience beds and a strip
// of every Act 3 sound effect, through the real synth and the shared reverb. The Act 1 and 2 previews stay in
// render-music-previews.mjs.
// Usage: npm i --no-save playwright && [CHROMIUM_PATH=/path/to/chrome] node scripts/render-act3-previews.mjs <outDir>
// The out dir is required and must be outside the repo (previews/ is not gitignored), e.g.
// /mnt/project-files/audio-assets/previews/act3.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const outArg = process.argv[2];
if (!outArg) {
  console.error('usage: node scripts/render-act3-previews.mjs <outDir outside the repo>');
  process.exit(2);
}
const outDir = resolve(outArg);
const rel = relative(process.cwd(), outDir);
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  console.error(`refusing to write previews inside the repo (${outDir})`);
  process.exit(2);
}
const SECONDS = 24;
const TRIAL_SECONDS = 180;
const RATE = 44100;
mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:5198/');

const result = await page.evaluate(
  async ({ SECONDS, TRIAL_SECONDS, RATE }) => {
    const { synthStem } = await import('/src/music/stemSynth.ts');
    const { TRACKS_BY_ID } = await import('/src/music/tracks.ts');
    const { MusicReverb } = await import('/src/audio/MusicReverb.ts');
    const { makeBedSamples } = await import('/src/audio/AmbienceBed.ts');
    const { ACT3_SFX_KEYS, act3SfxSamples } = await import('/src/audio/act3Sfx.ts');
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

    const peat = TRACKS_BY_ID['peat-and-pitch'];
    const wing = TRACKS_BY_ID['wing-over-rime'];
    const jobs = [];
    for (const [tag, t] of [['peatandpitch', peat], ['wingoverrime', wing]]) {
      for (const state of ['explore', 'discover', 'combat', 'stealth', 'chase', 'talk', 'ending']) jobs.push([`${tag}-${state}`, t, t.mixes[state], {}]);
      for (const [boss, def] of Object.entries(t.bossMixes ?? {})) {
        def.phases.forEach((m, i) => jobs.push([`${tag}-boss-${boss}-phase${i + 1}`, t, m, boss === 'ysmeryth-trial' && i === 0 ? { seconds: TRIAL_SECONDS, offsetBars: 0 } : {}]));
        if (def.hush) jobs.push([`${tag}-boss-${boss}-hush`, t, def.hush, {}]);
      }
    }
    const files = [];
    for (const [name, track, mix, opts] of jobs) files.push({ name, samples: await render(track, mix, opts) });
    // Two loops of each bed.
    for (const id of ['greyfen', 'dragonspine']) {
      const one = makeBedSamples(id, RATE);
      const two = new Float32Array(one.length * 2);
      two.set(one, 0);
      two.set(one, one.length);
      files.push({ name: `bed-${id}`, samples: two });
    }
    // Every sound effect in key order with 0.6 s of silence between; the order is printed with the file.
    const gap = Math.round(0.6 * RATE);
    const parts = [];
    const order = [];
    let t = 0;
    for (const key of ACT3_SFX_KEYS) {
      const s = act3SfxSamples(key);
      // The synth renders at its own rate (sfxKit); resample to RATE by linear interpolation.
      const srcRate = PLACEHOLDER_SAMPLE_RATE;
      const ratio = srcRate / RATE;
      const n = Math.round(s.length / ratio);
      const r = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const f = x - i0;
        r[i] = (s[i0] ?? 0) * (1 - f) + (s[i0 + 1] ?? 0) * f;
      }
      order.push(`${(t / RATE).toFixed(1).padStart(6)} s  ${key}`);
      parts.push(r, new Float32Array(gap));
      t += n + gap;
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
  { SECONDS, TRIAL_SECONDS, RATE },
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
