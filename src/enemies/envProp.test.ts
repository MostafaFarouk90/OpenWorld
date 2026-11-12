// The env-prop library's warning (Act 4 L5, open follow-up): a loader that marks itself quiet (the headless chapter harness,
// which cannot load env glbs by url) keeps the fallback silently; any other loader still warns once for a missing glb.
import { describe, expect, it, vi } from 'vitest';
import { envPropLibrary, QUIET_ENV_PROPS } from './envProp';

const loader = (extra: Record<string, unknown> = {}) => ({
  load: () => Promise.reject(new Error('not on disk')),
  instantiate: () => {
    throw new Error('not loaded');
  },
  ...extra,
});

describe('envPropLibrary warnings', () => {
  it('a real loader still warns once for a missing env glb', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lib = envPropLibrary(loader() as never);
    expect(await lib.template('env/does-not-exist')).toBeNull();
    expect(await lib.template('env/does-not-exist')).toBeNull();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('unavailable'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('a quiet loader keeps the fallback without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lib = envPropLibrary(loader({ [QUIET_ENV_PROPS]: true }) as never);
    expect(await lib.template('env/spear-hunter')).toBeNull();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('unavailable'))).toHaveLength(0);
    warn.mockRestore();
  });
});
