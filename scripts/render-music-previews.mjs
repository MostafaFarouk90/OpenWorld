// Renders short WAV previews of each music state through the real stem synth, the shared reverb and the
// interior reverb, so the music can be judged without playing the game. Also times the shared reverb.
// Usage: npm i --no-save playwright && [CHROMIUM_PATH=/path/to/chrome] node scripts/render-music-previews.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const outDir = process.argv[2] ?? 'previews';
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
    const { InteriorFx } = await import('/src/audio/InteriorFx.ts');

    const stemCache = new Map();
    const stemsOf = (track) => {
      if (!stemCache.has(track.id)) stemCache.set(track.id, Object.fromEntries(track.stems.map((s) => [s, synthStem(track, s, RATE)])));
      return stemCache.get(track.id);
    };

    async function render(track, mix, { interior = null, reverb = true, offsetBars = 4 } = {}) {
      const ctx = new OfflineAudioContext(1, RATE * SECONDS, RATE);
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
      const rv = reverb ? MusicReverb.create(ctx, bus, ctx.destination) : null;
      if (interior) {
        const fx = InteriorFx.create(ctx, bus, ctx.destination);
        fx?.setInterior(interior);
        rv?.setIndoors(true);
      }
      const t0 = performance.now();
      const out = await ctx.startRendering();
      return { samples: Array.from(out.getChannelData(0)), ms: performance.now() - t0 };
    }

    const barley = TRACKS_BY_ID['barley-and-brazier'];
    const seven = TRACKS_BY_ID['seven-gates-one-drum'];
    const jobs = [
      ['barley-explore', barley, barley.mixes.explore, {}],
      ['barley-discover', barley, barley.mixes.discover, {}],
      ['barley-stealth', barley, barley.mixes.stealth, {}],
      ['barley-chase', barley, barley.mixes.chase, {}],
      ['barley-combat', barley, barley.mixes.combat, {}],
      ['barley-boss', barley, barley.bossMixes['ashen-prior'].phases[1], {}],
      ['barley-tavern-tilted-anvil', barley, barley.mixes.explore, { interior: 'tilted-anvil' }],
      ['barley-interior-chapel-vault', barley, barley.mixes.explore, { interior: 'chapel-vault' }],
      ['sevengates-explore', seven, seven.mixes.explore, {}],
      ['sevengates-stealth', seven, seven.mixes.stealth, {}],
      ['sevengates-chase', seven, seven.mixes.chase, {}],
      ['sevengates-combat', seven, seven.mixes.combat, {}],
      ['sevengates-boss', seven, seven.bossMixes['gaffer-grimtooth'].phases[1], {}],
      ['sevengates-interior-underways', seven, seven.mixes.explore, { interior: 'underways' }],
    ];
    const ash = TRACKS_BY_ID['ash-on-the-pasture'];
    const ham = TRACKS_BY_ID['hammers-below'];
    jobs.push(
      ['ashpasture-explore', ash, ash.mixes.explore, {}],
      ['ashpasture-discover', ash, ash.mixes.discover, {}],
      ['ashpasture-stealth', ash, ash.mixes.stealth, {}],
      ['ashpasture-chase', ash, ash.mixes.chase, {}],
      ['ashpasture-combat', ash, ash.mixes.combat, {}],
      ['ashpasture-boss-redmane', ash, ash.bossMixes['thrandil-redmane'].phases[1], {}],
      ['hammersbelow-explore', ham, ham.mixes.explore, {}],
      ['hammersbelow-discover', ham, ham.mixes.discover, {}],
      ['hammersbelow-stealth', ham, ham.mixes.stealth, {}],
      ['hammersbelow-chase', ham, ham.mixes.chase, {}],
      ['hammersbelow-combat', ham, ham.mixes.combat, {}],
      ['hammersbelow-boss-slagmaw', ham, ham.bossMixes['the-slagmaw'].phases[1], {}],
      ['hammersbelow-interior-mine', ham, ham.mixes.explore, { interior: 'mine-old-galleries' }],
    );
    const files = [];
    for (const [name, track, mix, opts] of jobs) {
      const { samples } = await render(track, mix, opts);
      files.push({ name, samples: Float32Array.from(samples) });
    }
    // Reverb cost: the same combat render with and without the shared reverb, median of 5.
    const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const withRv = [];
    const without = [];
    await render(barley, barley.mixes.combat, { reverb: false }); // warm up
    for (let i = 0; i < 5; i++) {
      without.push((await render(barley, barley.mixes.combat, { reverb: false })).ms);
      withRv.push((await render(barley, barley.mixes.combat, { reverb: true })).ms);
    }
    // Too large to return in one message: the files stay on the page and are fetched one at a time below.
    window.__previewFiles = files;
    return { names: files.map((f) => f.name), cost: { withMs: med(withRv), withoutMs: med(without), seconds: SECONDS } };
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
const { withMs, withoutMs, seconds } = result.cost;
console.log(`reverb cost: ${withMs.toFixed(0)} ms with vs ${withoutMs.toFixed(0)} ms without for ${seconds} s (offline render, median of 5): +${(((withMs - withoutMs) / withoutMs) * 100).toFixed(0)}%, ${((withMs - withoutMs) / seconds).toFixed(1)} ms per second of audio`);
await browser.close();
await server.close();
