import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioManager as AudioManagerType } from './AudioManager';

// Integration test against the REAL howler module with a fake Web Audio environment. It guards the
// regression where Howler's autoUnlock replaced a non-44.1 kHz AudioContext, orphaning the StemMixer.

// Node's EventTarget ignores a boolean `capture` argument in removeEventListener (browsers do not),
// so normalise it to the options-object form.
class FakeWindow extends EventTarget {
  location = { protocol: 'http:' };
  navigator = { userAgent: 'vitest', platform: 'test', appVersion: '1.0', vendor: '' };
  override addEventListener(
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    opts?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, cb, typeof opts === 'boolean' ? { capture: opts } : opts);
  }
  override removeEventListener(
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    opts?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, cb, typeof opts === 'boolean' ? { capture: opts } : opts);
  }
}

class FakeAudioParam {
  value = 0;
  setValueAtTime(v: number, _t?: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, _t?: number): this {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, _t?: number, _c?: number): this {
    this.value = v;
    return this;
  }
  cancelScheduledValues(_t?: number): this {
    return this;
  }
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakePannerNode extends FakeNode {
  coneInnerAngle: unknown = 360;
  coneOuterAngle: unknown = 360;
  coneOuterGain: unknown = 0;
  distanceModel: unknown = 'inverse';
  maxDistance: unknown = 10000;
  refDistance: unknown = 1;
  rolloffFactor: unknown = 1;
  panningModel: unknown = 'equalpower';
  positionX = new FakeAudioParam();
  positionY = new FakeAudioParam();
  positionZ = new FakeAudioParam();
  orientationX = new FakeAudioParam();
  orientationY = new FakeAudioParam();
  orientationZ = new FakeAudioParam();
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

const fakeBuffer = { duration: 1, length: 48000, numberOfChannels: 1, sampleRate: 48000 };

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate = 48000;
  state = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  listener = {
    positionX: new FakeAudioParam(),
    positionY: new FakeAudioParam(),
    positionZ: new FakeAudioParam(),
    forwardX: new FakeAudioParam(),
    forwardY: new FakeAudioParam(),
    forwardZ: new FakeAudioParam(),
    upX: new FakeAudioParam(),
    upY: new FakeAudioParam(),
    upZ: new FakeAudioParam(),
  };
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createPanner(): FakePannerNode {
    return new FakePannerNode();
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  createBuffer(): typeof fakeBuffer {
    return fakeBuffer;
  }
  // length === 1 makes Howler use the promise form.
  decodeAudioData(_data: ArrayBuffer): Promise<typeof fakeBuffer> {
    return Promise.resolve(fakeBuffer);
  }
}

class FakeHtmlAudio {
  muted = false;
  oncanplaythrough: unknown = null;
  canPlayType(): string {
    return 'probably';
  }
  play(): Promise<void> {
    return Promise.resolve();
  }
}

// A tiny base64 data URI: Howler decodes these without XHR, then hands the bytes to our fake context.
const SRC = 'data:audio/wav;base64,UklGRg==';

type HowlInternals = {
  _state: string;
  _sounds: Array<{ _panner?: FakePannerNode }>;
  pannerAttr(): unknown;
  state(): string;
  once(event: string, cb: () => void): void;
};

let win: FakeWindow;
let HowlerMod: typeof import('howler');
let AudioManager: typeof AudioManagerType;
let manager: AudioManagerType | null = null;

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const ctx = () => HowlerMod.Howler.ctx as unknown as FakeAudioContext;
const soundsOf = (m: AudioManagerType): Map<string, HowlInternals> =>
  (m as unknown as { sounds: Map<string, HowlInternals> }).sounds;

beforeAll(async () => {
  win = new FakeWindow();
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', win.navigator);
  vi.stubGlobal('document', new FakeWindow());
  vi.stubGlobal('Audio', FakeHtmlAudio);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  (win as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  vi.resetModules();
  HowlerMod = await import('howler');
  ({ AudioManager } = await import('./AudioManager'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Howler is a process-wide singleton: put back what its constructor-time defaults would be.
  HowlerMod.Howler.autoUnlock = true;
  HowlerMod.Howler.autoSuspend = true;
});

afterEach(() => {
  manager?.dispose();
  manager = null;
});

describe('AudioManager with the real Howler', () => {
  it('keeps Howler.ctx (a 48 kHz context) alive and shared with the StemMixer after register', () => {
    manager = new AudioManager();
    const before = ctx();
    expect(before.sampleRate).toBe(48000);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(manager.context).toBe(before);
    manager.register('boom', { src: [SRC], format: ['wav'] });
    manager.register('hum', { src: [SRC], format: ['wav'], loop: true });

    expect(HowlerMod.Howler.autoUnlock).toBe(false);
    expect(HowlerMod.Howler.autoSuspend).toBe(false);
    expect(HowlerMod.Howler.ctx).toBe(before);
    expect(manager.context).toBe(before);
    expect(before.state).not.toBe('closed');
    expect(before.close).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(1);
    // The mixer holds the same context object.
    expect((manager.music as unknown as { ctx: unknown }).ctx).toBe(before);
  });

  it('never auto-suspends the context', async () => {
    manager = new AudioManager();
    manager.register('boom', { src: [SRC], format: ['wav'] });
    await flush();
    expect(ctx().suspend).not.toHaveBeenCalled();
  });

  it('unlocks on a gesture and removes its listeners afterwards', async () => {
    manager = new AudioManager();
    expect(manager.isUnlocked).toBe(false);
    const resume = ctx().resume;
    resume.mockClear();
    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(manager.isUnlocked).toBe(true);
    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('gives a played-at sound a PannerNode with finite cone values and the configured model', async () => {
    ctx().state = 'suspended';
    manager = new AudioManager();
    manager.register('boom', { src: [SRC], format: ['wav'], refDistance: 3, maxDistance: 50 });
    const howl = soundsOf(manager).get('boom')!;
    await flush();
    expect(howl.state()).toBe('loaded');

    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(manager.isUnlocked).toBe(true);

    const id = manager.playAt('boom', { x: 1, y: 2, z: 3 });
    expect(typeof id).toBe('number');
    const panner = howl._sounds.find((s) => s._panner)?._panner;
    expect(panner).toBeDefined();
    for (const key of ['coneInnerAngle', 'coneOuterAngle', 'coneOuterGain'] as const) {
      expect(Number.isFinite(panner![key])).toBe(true);
    }
    expect(panner!.panningModel).toBe('HRTF');
    expect(panner!.distanceModel).toBe('exponential');
    expect(panner!.refDistance).toBe(3);
    expect(panner!.maxDistance).toBe(50);
    expect(panner!.positionX.value).toBe(1);
    expect(panner!.positionY.value).toBe(2);
    expect(panner!.positionZ.value).toBe(3);
    // Let Howler's deferred playback callbacks run before the afterEach unload.
    await flush();
    await flush();
    await flush();
  });

  it('keeps the group panner attributes finite on a real Howl right after register', () => {
    manager = new AudioManager();
    manager.register('boom', { src: [SRC], format: ['wav'] });
    const attrs = soundsOf(manager).get('boom')!.pannerAttr() as Record<string, unknown>;
    for (const key of ['coneInnerAngle', 'coneOuterAngle', 'coneOuterGain']) {
      expect(Number.isFinite(attrs[key])).toBe(true);
    }
  });

  it('drives the Howler listener from the camera', async () => {
    const THREE = await import('three');
    manager = new AudioManager();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(4, 5, 6);
    camera.updateMatrixWorld(true);
    manager.update(camera);
    const l = ctx().listener;
    expect([l.positionX.value, l.positionY.value, l.positionZ.value]).toEqual([4, 5, 6]);
    expect(l.forwardZ.value).toBeCloseTo(-1, 6);
    expect(l.upY.value).toBeCloseTo(1, 6);
  });
});
