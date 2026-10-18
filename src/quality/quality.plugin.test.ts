import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BloomPass', () => ({
  BloomPostPass: class {
    dispose = vi.fn();
  },
}));

import plugin from './quality.plugin';
import { PROBE } from '../vfx/tuning';

function fake(opts: { renderer?: boolean; vfx?: boolean } = {}) {
  const services = new Map<string, any>();
  const systems: any[] = [];
  const graphics: any = {
    setRenderScale: vi.fn(),
    setShadows: vi.fn(),
    setViewDistanceOffset: vi.fn(),
    setPostPass: vi.fn(),
    renderer: opts.renderer === false ? undefined : {},
  };
  services.set('graphics', graphics);
  const vfx = { setQuality: vi.fn() };
  if (opts.vfx !== false) services.set('vfx', vfx);
  const ctx: any = {
    scene: {},
    camera: {},
    services: {
      provide: (k: string, v: any) => {
        services.set(k, v);
        return () => services.delete(k);
      },
      get: (k: string) => services.get(k),
    },
    systems: {
      add: (s: any) => {
        systems.push(s);
        return () => systems.splice(systems.indexOf(s), 1);
      },
    },
  };
  return { ctx, services, systems, graphics, vfx };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', undefined);
});

describe('quality plugin', () => {
  it('has id and dependency', () => {
    expect(plugin.id).toBe('quality');
    expect(plugin.dependsOn).toEqual(['core']);
  });
  it('provides quality, installs bloom on medium with a renderer, forwards to vfx', () => {
    const f = fake();
    plugin.setup(f.ctx);
    expect(f.services.get('quality').step).toBe('medium');
    expect(f.graphics.setPostPass).toHaveBeenCalledWith(expect.objectContaining({ dispose: expect.any(Function) }));
    expect(f.vfx.setQuality).toHaveBeenCalledWith('medium');
    expect(f.systems[0]).toMatchObject({ renderPhase: 'hud', order: 150 });
    plugin.dispose();
  });
  it('does not install without a renderer', () => {
    const f = fake({ renderer: false });
    plugin.setup(f.ctx);
    expect(f.graphics.setPostPass).not.toHaveBeenCalled();
    plugin.dispose();
  });
  it('removes the pass on Low and forwards the change', () => {
    const f = fake();
    plugin.setup(f.ctx);
    f.graphics.setPostPass.mockClear();
    f.services.get('quality').setStep('low');
    expect(f.graphics.setPostPass).toHaveBeenCalledWith(null);
    expect(f.vfx.setQuality).toHaveBeenLastCalledWith('low');
    f.services.get('quality').setStep('high');
    expect(f.graphics.setPostPass).toHaveBeenLastCalledWith(expect.anything());
    plugin.dispose();
  });
  it('dispose removes systems, service and pass', () => {
    const f = fake();
    plugin.setup(f.ctx);
    plugin.dispose();
    expect(f.systems).toHaveLength(0);
    expect(f.services.has('quality')).toBe(false);
    expect(f.graphics.setPostPass).toHaveBeenLastCalledWith(null);
  });
  it('render frames drive the probe (first frame skipped)', () => {
    const f = fake();
    plugin.setup(f.ctx);
    const sys = f.systems[0];
    sys.render(0, 10, f.ctx);
    for (let i = 0; i < PROBE.warmupFrames + PROBE.sampleFrames; i++) sys.render(0, 10, f.ctx);
    expect(f.services.get('quality').step).toBe('high');
    expect(f.vfx.setQuality).toHaveBeenLastCalledWith('high');
    plugin.dispose();
  });
});
