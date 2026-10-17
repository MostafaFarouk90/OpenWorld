import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from '../config/constants';
import { AudioManager } from './AudioManager';

interface PannerAttrs {
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  panningModel?: string;
  distanceModel?: string;
  rolloffFactor?: number;
  refDistance?: number;
  maxDistance?: number;
}

const mock = vi.hoisted(() => {
  class FakeHowl {
    static instances: FakeHowl[] = [];
    static initialState = 'loaded';
    nextId = 1;
    loadState = FakeHowl.initialState;
    groupAttrs: PannerAttrs | undefined;
    perIdAttrs: Array<[PannerAttrs, number]> = [];
    onceCallbacks: Array<[string, () => void]> = [];
    play = vi.fn(() => this.nextId++);
    stop = vi.fn();
    pos = vi.fn();
    loop = vi.fn();
    unload = vi.fn();
    constructor(public options: Record<string, unknown>) {
      FakeHowl.instances.push(this);
    }
    pannerAttr(attrs?: PannerAttrs, id?: number): unknown {
      if (attrs === undefined) return this.groupAttrs;
      if (id === undefined) this.groupAttrs = attrs;
      else this.perIdAttrs.push([attrs, id]);
      return this;
    }
    state(): string {
      return this.loadState;
    }
    once(event: string, cb: () => void): this {
      this.onceCallbacks.push([event, cb]);
      return this;
    }
    fire(event: string): void {
      const matching = this.onceCallbacks.filter(([e]) => e === event);
      this.onceCallbacks = this.onceCallbacks.filter(([e]) => e !== event);
      for (const [, cb] of matching) cb();
    }
  }
  const Howler = {
    volume: vi.fn(),
    mute: vi.fn(),
    pos: vi.fn(),
    orientation: vi.fn(),
    masterGain: {} as unknown,
    usingWebAudio: true,
    autoUnlock: true,
    autoSuspend: true,
    ctx: null as null | { state: string; resume: ReturnType<typeof vi.fn> },
  };
  return { FakeHowl, Howler };
});

vi.mock('howler', () => ({ Howl: mock.FakeHowl, Howler: mock.Howler }));

const { FakeHowl, Howler } = mock;

// Node's EventTarget ignores a boolean `capture` argument in removeEventListener (browsers do not),
// so normalise it to the options-object form.
class FakeWindow extends EventTarget {
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

let win: EventTarget;
let manager: AudioManager;

function setCtx(state: string, resume: () => Promise<void> = () => Promise.resolve()): void {
  Howler.ctx = { state, resume: vi.fn(resume) };
}

// Lets resolved/rejected promise callbacks run.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const gesture = (type = 'pointerdown'): void => {
  win.dispatchEvent(new Event(type));
};
const howl = (n = 0) => FakeHowl.instances[n];
const resumeMock = () => Howler.ctx!.resume;

function make(state = 'suspended'): AudioManager {
  setCtx(state);
  manager = new AudioManager();
  return manager;
}

beforeEach(() => {
  win = new FakeWindow();
  vi.stubGlobal('window', win);
  FakeHowl.instances.length = 0;
  FakeHowl.initialState = 'loaded';
  Howler.usingWebAudio = true;
  Howler.autoUnlock = true;
  Howler.autoSuspend = true;
  Howler.ctx = null;
  for (const fn of [Howler.volume, Howler.mute, Howler.pos, Howler.orientation]) fn.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AudioManager construction', () => {
  it('throws when Howler is not using Web Audio', () => {
    setCtx('suspended');
    Howler.usingWebAudio = false;
    expect(() => new AudioManager()).toThrow(/Web Audio/);
  });

  it('throws when Howler has no AudioContext', () => {
    Howler.ctx = null;
    expect(() => new AudioManager()).toThrow(/Web Audio/);
  });

  it('disables Howler autoUnlock and autoSuspend before touching the volume', () => {
    let atVolume: [boolean, boolean] | null = null;
    Howler.volume.mockImplementationOnce(() => {
      atVolume = [Howler.autoUnlock, Howler.autoSuspend];
    });
    make('running');
    expect(Howler.autoUnlock).toBe(false);
    expect(Howler.autoSuspend).toBe(false);
    expect(atVolume).toEqual([false, false]);
  });

  it('is already unlocked when the context is running and attach plays immediately', () => {
    const m = make('running');
    m.register('hum', { src: ['hum.ogg'], loop: true });
    expect(m.isUnlocked).toBe(true);
    m.attach('hum', new THREE.Group());
    expect(howl().play).toHaveBeenCalledTimes(1);
    expect(howl().loop).toHaveBeenCalledWith(true, 1);
  });
});

describe('AudioManager.register', () => {
  it('creates a Web Audio Howl with the given options', () => {
    make().register('boom', { src: ['a.ogg'], format: ['ogg'], volume: 0.4, loop: true });
    expect(howl().options).toMatchObject({
      src: ['a.ogg'],
      format: ['ogg'],
      volume: 0.4,
      loop: true,
      html5: false,
    });
  });

  it('defaults volume to 1 and loop to false', () => {
    make().register('boom', { src: ['a.ogg'] });
    expect(howl().options).toMatchObject({ volume: 1, loop: false });
  });

  it('applies HRTF/exponential panner attributes with default ref and max distance', () => {
    make().register('boom', { src: ['a.ogg'] });
    expect(howl().groupAttrs).toMatchObject({
      panningModel: 'HRTF',
      distanceModel: 'exponential',
      rolloffFactor: AUDIO.rolloffFactor,
      refDistance: 1,
      maxDistance: 100,
    });
    expect(AUDIO.rolloffFactor).toBe(1.5);
  });

  it('uses refDistance and maxDistance overrides', () => {
    make().register('boom', { src: ['a.ogg'], refDistance: 4, maxDistance: 60 });
    expect(howl().groupAttrs).toMatchObject({ refDistance: 4, maxDistance: 60 });
  });

  it('sets finite cone values so per-id re-application never passes undefined', () => {
    make().register('boom', { src: ['a.ogg'] });
    expect(howl().groupAttrs).toMatchObject({ coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 0 });
  });

  it('unloads the previous Howl when a key is re-registered', () => {
    const m = make();
    m.register('boom', { src: ['a.ogg'] });
    m.register('boom', { src: ['b.ogg'] });
    expect(howl(0).unload).toHaveBeenCalledTimes(1);
    expect(howl(1).unload).not.toHaveBeenCalled();
  });
});

describe('AudioManager.register restarts emitters', () => {
  it('restarts a playing emitter on the new Howl and unloads the old one', () => {
    make('running').register('hum', { src: ['a.ogg'], loop: true });
    const obj = new THREE.Group();
    obj.position.set(1, 2, 3);
    manager.attach('hum', obj);
    expect(howl(0).play).toHaveBeenCalledTimes(1);

    manager.register('hum', { src: ['b.ogg'], loop: true });
    expect(howl(0).unload).toHaveBeenCalledTimes(1);
    expect(howl(1).play).toHaveBeenCalledTimes(1);
    expect(howl(1).loop).toHaveBeenCalledWith(true, 1);
    expect(howl(1).pos).toHaveBeenCalledWith(1, 2, 3, 1);
    // The old Howl is not asked to play again.
    expect(howl(0).play).toHaveBeenCalledTimes(1);
  });

  it('does not restart emitters of other keys', () => {
    make('running');
    manager.register('a', { src: ['a.ogg'], loop: true });
    manager.register('b', { src: ['b.ogg'], loop: true });
    manager.attach('a', new THREE.Group());
    manager.register('b', { src: ['b2.ogg'], loop: true });
    expect(howl(0).play).toHaveBeenCalledTimes(1);
    expect(howl(2).play).not.toHaveBeenCalled();
  });

  it('a queued (locked) emitter starts on the new Howl after unlock, not the old one', async () => {
    make('suspended').register('hum', { src: ['a.ogg'], loop: true });
    manager.attach('hum', new THREE.Group());
    manager.register('hum', { src: ['b.ogg'], loop: true });
    expect(howl(1).play).not.toHaveBeenCalled();
    gesture();
    await flush();
    expect(howl(0).play).not.toHaveBeenCalled();
    expect(howl(1).play).toHaveBeenCalledTimes(1);
    expect(howl(1).pos).toHaveBeenCalledTimes(1);
  });

  it('an emitter waiting for the old Howl load starts from the new Howl', () => {
    make('running').register('hum', { src: ['a.ogg'], loop: true });
    howl(0).loadState = 'loading';
    manager.attach('hum', new THREE.Group());
    expect(howl(0).onceCallbacks).toHaveLength(1);

    manager.register('hum', { src: ['b.ogg'], loop: true });
    // New Howl is loaded in the mock, so it starts immediately.
    expect(howl(1).play).toHaveBeenCalledTimes(1);
    // The old Howl's load event must not start it a second time.
    howl(0).loadState = 'loaded';
    howl(0).fire('load');
    expect(howl(0).play).not.toHaveBeenCalled();
    expect(howl(1).play).toHaveBeenCalledTimes(1);
  });

  it('a re-registered emitter whose new Howl is still loading waits for its load', () => {
    make('running').register('hum', { src: ['a.ogg'], loop: true });
    manager.attach('hum', new THREE.Group());
    FakeHowl.initialState = 'loading';
    manager.register('hum', { src: ['b.ogg'], loop: true });
    expect(howl(1).play).not.toHaveBeenCalled();
    expect(howl(1).onceCallbacks).toHaveLength(1);
    howl(1).loadState = 'loaded';
    howl(1).fire('load');
    expect(howl(1).play).toHaveBeenCalledTimes(1);
    expect(howl(1).loop).toHaveBeenCalledWith(true, 1);
  });

  it('warns with the key when loading fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      make('running').register('boom', { src: ['a.ogg'] });
      const onloaderror = howl().options.onloaderror as (id: number, err: unknown) => void;
      onloaderror(1, 'Decoding failed');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('boom');
      expect(warn.mock.calls[0][1]).toBe('Decoding failed');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('AudioManager play / playAt', () => {
  beforeEach(() => {
    make('running').register('boom', { src: ['a.ogg'] });
  });

  it('play returns the sound id without spatializing', () => {
    expect(manager.play('boom')).toBe(1);
    expect(howl().perIdAttrs).toHaveLength(0);
    expect(howl().pos).not.toHaveBeenCalled();
  });

  it('playAt re-applies finite panner attributes to the sound id, positions it and returns the id', () => {
    const id = manager.playAt('boom', { x: 1, y: 2, z: 3 });
    expect(id).toBe(1);
    expect(howl().perIdAttrs).toHaveLength(1);
    const [attrs, attrId] = howl().perIdAttrs[0];
    expect(attrId).toBe(1);
    for (const key of ['coneInnerAngle', 'coneOuterAngle', 'coneOuterGain'] as const) {
      expect(Number.isFinite(attrs[key])).toBe(true);
    }
    expect(attrs.panningModel).toBe('HRTF');
    expect(howl().pos).toHaveBeenCalledWith(1, 2, 3, 1);
  });

  it('throws for an unknown key in play, playAt and attach', () => {
    expect(() => manager.play('nope')).toThrow(/Unknown sound "nope"/);
    expect(() => manager.playAt('nope', { x: 0, y: 0, z: 0 })).toThrow(/Unknown sound/);
    expect(() => manager.attach('nope', new THREE.Object3D())).toThrow(/Unknown sound/);
  });

  it('throws for an unknown key even while locked', () => {
    make('suspended');
    expect(() => manager.play('nope')).toThrow(/Unknown sound/);
  });
});

describe('AudioManager locked state', () => {
  beforeEach(() => {
    make('suspended').register('boom', { src: ['a.ogg'], loop: true });
  });

  it('is locked and drops one-shots, returning null', () => {
    expect(manager.isUnlocked).toBe(false);
    expect(manager.play('boom')).toBeNull();
    expect(manager.playAt('boom', { x: 0, y: 0, z: 0 })).toBeNull();
    expect(howl().play).not.toHaveBeenCalled();
  });

  it('attach returns an emitter id but does not play', () => {
    const id = manager.attach('boom', new THREE.Group());
    expect(typeof id).toBe('number');
    expect(howl().play).not.toHaveBeenCalled();
  });

  it('queues onUnlock callbacks', () => {
    const cb = vi.fn();
    manager.onUnlock(cb);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('AudioManager unlock', () => {
  beforeEach(() => {
    make('suspended').register('boom', { src: ['a.ogg'], loop: true });
  });

  it('unlocks on a gesture once resume resolves, starting emitters and running callbacks once', async () => {
    const group = new THREE.Group();
    group.position.set(4, 5, 6);
    manager.attach('boom', group);
    const cb = vi.fn();
    manager.onUnlock(cb);

    gesture();
    expect(manager.isUnlocked).toBe(false);
    await flush();

    expect(resumeMock()).toHaveBeenCalledTimes(1);
    expect(manager.isUnlocked).toBe(true);
    expect(howl().play).toHaveBeenCalledTimes(1);
    expect(howl().loop).toHaveBeenCalledWith(true, 1);
    expect(howl().pos).toHaveBeenCalledWith(4, 5, 6, 1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs an onUnlock registered after unlock immediately and ignores later gestures', async () => {
    const early = vi.fn();
    manager.onUnlock(early);
    gesture();
    await flush();
    const late = vi.fn();
    manager.onUnlock(late);
    expect(late).toHaveBeenCalledTimes(1);

    gesture('keydown');
    gesture();
    await flush();
    expect(resumeMock()).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('calls resume again on the next gesture while the first resume is still pending, then unlocks', async () => {
    manager.dispose(); // drop the beforeEach manager's listeners
    const resolvers: Array<() => void> = [];
    setCtx('suspended', () => new Promise<void>((r) => resolvers.push(r)));
    manager = new AudioManager();
    manager.register('boom', { src: ['a.ogg'] });
    const cb = vi.fn();
    manager.onUnlock(cb);

    gesture();
    await flush();
    expect(resumeMock()).toHaveBeenCalledTimes(1);
    expect(manager.isUnlocked).toBe(false);

    gesture('keydown');
    await flush();
    expect(resumeMock()).toHaveBeenCalledTimes(2);
    expect(manager.isUnlocked).toBe(false);

    resolvers[1]();
    await flush();
    expect(manager.isUnlocked).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);

    // The first resume resolving late must not run callbacks twice.
    resolvers[0]();
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('removes the listeners after unlock so later gestures do not call resume', async () => {
    gesture();
    await flush();
    expect(manager.isUnlocked).toBe(true);
    for (const type of ['pointerdown', 'keydown', 'touchend']) gesture(type);
    await flush();
    expect(resumeMock()).toHaveBeenCalledTimes(1);
  });

  it('keeps listening after unlock fails and does not remove them on a rejected resume', async () => {
    resumeMock().mockImplementation(() => Promise.reject(new Error('no')));
    for (let i = 0; i < 3; i++) {
      gesture();
      await flush();
    }
    expect(resumeMock()).toHaveBeenCalledTimes(3);
    expect(manager.isUnlocked).toBe(false);
  });

  it('listens for keydown and touchend as well', async () => {
    gesture('keydown');
    await flush();
    expect(manager.isUnlocked).toBe(true);
  });

  it('stays locked when resume is refused and unlocks on a later gesture', async () => {
    const cb = vi.fn();
    manager.onUnlock(cb);
    resumeMock().mockImplementationOnce(() => Promise.reject(new Error('not allowed')));

    gesture();
    await flush();
    expect(manager.isUnlocked).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(manager.play('boom')).toBeNull();

    gesture('touchend');
    await flush();
    expect(resumeMock()).toHaveBeenCalledTimes(2);
    expect(manager.isUnlocked).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('AudioManager emitters waiting for load', () => {
  beforeEach(() => {
    make('running').register('boom', { src: ['a.ogg'], loop: true });
    howl().loadState = 'loading';
  });

  it('waits for the load event, then starts exactly once', () => {
    manager.attach('boom', new THREE.Group());
    expect(howl().play).not.toHaveBeenCalled();
    expect(howl().onceCallbacks).toHaveLength(1);
    howl().loadState = 'loaded';
    howl().fire('load');
    expect(howl().play).toHaveBeenCalledTimes(1);
    howl().fire('load');
    expect(howl().play).toHaveBeenCalledTimes(1);
  });

  it('never starts when detached before the load event', () => {
    const id = manager.attach('boom', new THREE.Group());
    manager.detach(id);
    howl().loadState = 'loaded';
    howl().fire('load');
    expect(howl().play).not.toHaveBeenCalled();
  });

  it('never starts when disposed before the load event', () => {
    manager.attach('boom', new THREE.Group());
    manager.dispose();
    howl().loadState = 'loaded';
    howl().fire('load');
    expect(howl().play).not.toHaveBeenCalled();
  });
});

describe('AudioManager.update', () => {
  beforeEach(() => {
    make('running').register('boom', { src: ['a.ogg'], loop: true });
  });

  it('moves the Howler listener to the camera position, forward and up vectors', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.rotation.y = Math.PI / 2;
    camera.updateMatrixWorld(true);
    manager.update(camera);

    expect(Howler.pos).toHaveBeenCalledTimes(1);
    const [px, py, pz] = Howler.pos.mock.calls[0] as number[];
    expect([px, py, pz]).toEqual([1, 2, 3]);

    const forward = camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const args = Howler.orientation.mock.calls[0] as number[];
    expect(args).toHaveLength(6);
    [forward.x, forward.y, forward.z, up.x, up.y, up.z].forEach((v, i) => {
      expect(args[i]).toBeCloseTo(v, 6);
    });
    // Looking down -Z rotated 90 degrees about Y faces -X.
    expect(args[0]).toBeCloseTo(-1, 6);
  });

  it('moves emitters to their object world position, including a translated parent', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);
    const child = new THREE.Object3D();
    child.position.set(1, 2, 3);
    parent.add(child);
    scene.add(parent);
    manager.attach('boom', child);
    howl().pos.mockClear();

    manager.update(new THREE.PerspectiveCamera());
    expect(howl().pos).toHaveBeenCalledTimes(1);
    expect(howl().pos).toHaveBeenCalledWith(11, 2, 3, 1);

    parent.position.set(20, 0, 0);
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().pos).toHaveBeenLastCalledWith(21, 2, 3, 1);
  });

  it('detaches an emitter whose object has no parent and does not update it again', () => {
    manager.attach('boom', new THREE.Object3D());
    howl().pos.mockClear();

    manager.update(new THREE.PerspectiveCamera());
    expect(howl().stop).toHaveBeenCalledWith(1);
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().stop).toHaveBeenCalledTimes(1);
    expect(howl().pos).not.toHaveBeenCalled();
  });

  it('detaches an emitter whose parent group was removed from the scene', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const child = new THREE.Object3D();
    group.add(child);
    scene.add(group);
    manager.attach('boom', child);
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().stop).not.toHaveBeenCalled();

    scene.remove(group);
    howl().pos.mockClear();
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().stop).toHaveBeenCalledWith(1);
    expect(howl().pos).not.toHaveBeenCalled();
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().stop).toHaveBeenCalledTimes(1);
  });

  it('keeps an emitter whose object is directly under the scene', () => {
    const scene = new THREE.Scene();
    const obj = new THREE.Object3D();
    obj.position.set(7, 8, 9);
    scene.add(obj);
    manager.attach('boom', obj);
    howl().pos.mockClear();
    manager.update(new THREE.PerspectiveCamera());
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().stop).not.toHaveBeenCalled();
    expect(howl().pos).toHaveBeenCalledTimes(2);
    expect(howl().pos).toHaveBeenLastCalledWith(7, 8, 9, 1);
  });

  it('listener follows a pitched and rolled camera inside a rotated, translated parent', () => {
    const scene = new THREE.Scene();
    const rig = new THREE.Group();
    rig.position.set(5, -2, 9);
    rig.rotation.y = 0.8;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.rotation.x = -0.4;
    camera.rotation.z = 0.3;
    rig.add(camera);
    scene.add(rig);
    scene.updateMatrixWorld(true);

    manager.update(camera);
    const pos = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const [px, py, pz] = Howler.pos.mock.calls[0] as number[];
    [px, py, pz].forEach((v, i) => expect(v).toBeCloseTo([pos.x, pos.y, pos.z][i], 6));
    const o = Howler.orientation.mock.calls[0] as number[];
    [dir.x, dir.y, dir.z, up.x, up.y, up.z].forEach((v, i) => expect(o[i]).toBeCloseTo(v, 6));
    const upDiffers = Math.abs(o[3]) > 1e-3 || Math.abs(o[4] - 1) > 1e-3 || Math.abs(o[5]) > 1e-3;
    expect(upDiffers).toBe(true);
    expect(Math.hypot(o[3], o[4], o[5])).toBeCloseTo(1, 6);
  });

  it('does not touch a locked emitter that has no sound id yet', () => {
    make('suspended').register('boom', { src: ['a.ogg'] });
    const parent = new THREE.Group();
    parent.add(new THREE.Object3D());
    manager.attach('boom', parent.children[0]);
    manager.update(new THREE.PerspectiveCamera());
    expect(howl().pos).not.toHaveBeenCalled();
    expect(howl().stop).not.toHaveBeenCalled();
  });

  it('detach of an unknown emitter id is a no-op', () => {
    expect(() => manager.detach(999)).not.toThrow();
    expect(howl().stop).not.toHaveBeenCalled();
  });

  it('detach stops the sound of a playing emitter', () => {
    const id = manager.attach('boom', new THREE.Group());
    manager.detach(id);
    expect(howl().stop).toHaveBeenCalledWith(1);
  });
});

describe('AudioManager master volume and mute', () => {
  it('forwards to Howler', () => {
    make('running');
    manager.setMasterVolume(0.3);
    manager.setMuted(true);
    expect(Howler.volume).toHaveBeenLastCalledWith(0.3);
    expect(Howler.mute).toHaveBeenCalledWith(true);
  });
});

describe('AudioManager.dispose', () => {
  it('removes unlock listeners so a later gesture does not resume the context', () => {
    make('suspended');
    manager.dispose();
    gesture();
    expect(resumeMock()).not.toHaveBeenCalled();
  });

  it('stops emitters, unloads every Howl and stops music', () => {
    make('running');
    manager.register('a', { src: ['a.ogg'], loop: true });
    manager.register('b', { src: ['b.ogg'] });
    manager.attach('a', new THREE.Group());
    const musicStop = vi.spyOn(manager.music, 'stop');

    manager.dispose();
    expect(howl(0).stop).toHaveBeenCalledWith(1);
    expect(howl(0).unload).toHaveBeenCalledTimes(1);
    expect(howl(1).unload).toHaveBeenCalledTimes(1);
    expect(musicStop).toHaveBeenCalledTimes(1);
    expect(() => manager.play('a')).toThrow(/Unknown sound/);
  });

  it('disposes the music mixer', () => {
    make('running');
    const spy = vi.spyOn(manager.music, 'dispose');
    manager.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clears queued callbacks so they never run, even if a pending resume resolves afterwards', async () => {
    let resolveResume!: () => void;
    setCtx('suspended', () => new Promise<void>((r) => (resolveResume = r)));
    manager = new AudioManager();
    manager.register('a', { src: ['a.ogg'], loop: true });
    manager.attach('a', new THREE.Group());
    const cb = vi.fn();
    manager.onUnlock(cb);

    gesture();
    manager.dispose();
    resolveResume();
    await flush();

    expect(cb).not.toHaveBeenCalled();
    expect(manager.isUnlocked).toBe(false);
    expect(howl().play).not.toHaveBeenCalled();
  });

  it('does not re-register unlock listeners when a pending resume is refused after dispose', async () => {
    let rejectResume!: () => void;
    setCtx('suspended', () => new Promise<void>((_, rej) => (rejectResume = () => rej(new Error('no')))));
    manager = new AudioManager();
    gesture();
    manager.dispose();
    rejectResume();
    await flush();
    gesture();
    expect(resumeMock()).toHaveBeenCalledTimes(1);
  });
});
