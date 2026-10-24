// A hook for code that plays an Act 2 sound straight on the audio service (the Slagmaw fight) instead of through the router:
// the `act2-sfx` plugin renders its sounds lazily, so such a caller asks for the key first. A no-op when the plugin is not
// running or the key is already registered.
let impl: ((key: string) => void) | null = null;

export function setAct2SfxEnsure(fn: ((key: string) => void) | null): void {
  impl = fn;
}

/** Makes sure `key` is rendered and registered before it is played. Never throws. */
export function ensureAct2Sfx(key: string): void {
  try {
    impl?.(key);
  } catch {
    // a failed render leaves the key unregistered, which the caller's play already tolerates
  }
}

export interface Act2CueAudio {
  play(key: string): unknown;
  playAt(key: string, position: { x: number; y: number; z: number }): unknown;
}

/**
 * Plays an Act 2 or boss cue on the audio service, rendering it first if the lazy `act2-sfx` slice has not come yet (idle time
 * can be starved). With a `position` it plays spatially. Like the audio service it may throw on an unknown key; callers wrap it.
 */
export function playEnsured(audio: Act2CueAudio, key: string, position?: { x: number; y: number; z: number }): void {
  ensureAct2Sfx(key);
  if (position) audio.playAt(key, position);
  else audio.play(key);
}

