import { synthStem } from './stemSynth';
import { loopSamples, type TrackDef } from './tracks';

export interface StemLoaderContext {
  readonly sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

export interface LoadedStems {
  buffers: Map<string, AudioBuffer>;
  /** Where each stem came from; a stem that failed both ways is absent from `buffers` and listed in `failed`. */
  sources: Record<string, 'recorded' | 'procedural'>;
  failed: string[];
  /** True when `isCancelled` abandoned the load; the buffers are then incomplete and must be discarded. */
  cancelled?: boolean;
}

export interface StemLoaderOptions {
  /** Folder holding `<stem>.ogg` recordings; default `/assets/music/<track id>`. */
  baseUrl?: string;
  fetchImpl?: (url: string) => Promise<Response>;
  /** Frames a recording may differ from the canonical length and still be trimmed or padded. */
  toleranceFrames?: number;
  /** Stems never to synthesise (for example the boss stem, unheard in the slice); recordings still load. */
  skipProcedural?: readonly string[];
  /** A fetch that has not answered after this long counts as missing (default 5 s). */
  fetchTimeoutMs?: number;
  /** Checked between stems; true abandons the load (a cancelled preload or a disposed plugin). */
  isCancelled?: () => boolean;
  /** Awaited between procedural stems so synthesis does not block a frame for long. */
  yieldToMain?: () => Promise<void>;
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Returns `buffer` resampled to exactly `length` frames by trimming or zero-padding, or null when
 * it is more than `tolerance` frames off (a different-length recording would drift against the others).
 */
export function conformBuffer(ctx: StemLoaderContext, buffer: AudioBuffer, length: number, tolerance: number): AudioBuffer | null {
  if (Math.abs(buffer.length - length) > tolerance) return null;
  if (buffer.length === length) return buffer;
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    out.copyToChannel(src.length > length ? src.subarray(0, length) : src, c);
  }
  return out;
}

/**
 * Builds every stem of `track` as an AudioBuffer of the one canonical length. A recording at
 * `<baseUrl>/<stem>.ogg` is used when it fetches, decodes and matches the length (within
 * tolerance); otherwise that stem alone falls back to the procedural placeholder.
 */
export async function loadTrackStems(
  ctx: StemLoaderContext,
  track: TrackDef,
  options: StemLoaderOptions = {},
): Promise<LoadedStems> {
  const length = loopSamples(track, ctx.sampleRate);
  const baseUrl = options.baseUrl ?? `${import.meta.env.BASE_URL}assets/music/${track.id}`;
  const timeoutMs = options.fetchTimeoutMs ?? 5000;
  const fetchImpl =
    options.fetchImpl ??
    (async (url: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    });
  const tolerance = options.toleranceFrames ?? 2;
  const yieldToMain = options.yieldToMain ?? defaultYield;

  const recorded = await Promise.all(
    track.stems.map(async (stem): Promise<AudioBuffer | null> => {
      const url = `${baseUrl}/${stem}.ogg`;
      try {
        const response = await fetchImpl(url);
        if (!response.ok) return null;
        const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
        const conformed = conformBuffer(ctx, decoded, length, tolerance);
        if (!conformed) {
          console.warn(`Music: ${url} has ${decoded.length} frames, expected ${length}; using the placeholder stem`);
        }
        return conformed;
      } catch {
        return null; // missing file, a dev-server HTML fallback, or a network error: use the placeholder
      }
    }),
  );

  const result: LoadedStems = { buffers: new Map(), sources: {}, failed: [] };
  for (let i = 0; i < track.stems.length; i++) {
    const stem = track.stems[i];
    const buffer = recorded[i];
    if (options.isCancelled?.()) {
      result.cancelled = true;
      return result;
    }
    if (buffer) {
      result.buffers.set(stem, buffer);
      result.sources[stem] = 'recorded';
      continue;
    }
    if (options.skipProcedural?.includes(stem)) continue;
    try {
      await yieldToMain();
      if (options.isCancelled?.()) {
        result.cancelled = true;
        return result;
      }
      const out = ctx.createBuffer(1, length, ctx.sampleRate);
      out.copyToChannel(synthStem(track, stem, ctx.sampleRate) as Float32Array<ArrayBuffer>, 0);
      result.buffers.set(stem, out);
      result.sources[stem] = 'procedural';
    } catch (err) {
      console.warn(`Music: stem "${stem}" could not be built:`, err);
      result.failed.push(stem);
    }
  }
  if (!Object.values(result.sources).includes('recorded')) {
    console.info(`Music: no recorded stems in ${baseUrl}; using procedural placeholders`);
  }
  return result;
}
