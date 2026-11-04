// A hook for code that plays an Act 3 sound straight on the audio service instead of through the router: the `act3-sfx`
// plugin renders its sounds lazily, so such a caller asks for the key first. A no-op when the plugin is not running or the
// key is already registered. (Same shape as `act2SfxEnsure`, which only knows the Act 2 keys.)
let impl: ((key: string) => void) | null = null;

export function setAct3SfxEnsure(fn: ((key: string) => void) | null): void {
  impl = fn;
}

/** Makes sure `key` is rendered and registered before it is played. Never throws. */
export function ensureAct3Sfx(key: string): void {
  try {
    impl?.(key);
  } catch {
    // a failed render leaves the key unregistered, which the caller's play already tolerates
  }
}
