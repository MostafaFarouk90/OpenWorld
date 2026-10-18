import { Howl, Howler, type PannerAttributes } from 'howler';
import * as THREE from 'three';
import { AUDIO } from '../config/constants';
import { StemMixer } from './StemMixer';

export interface SoundDefinition {
  /** One or more URLs; the first playable one is used. */
  src: string[];
  /** Needed when `src` has no file extension (e.g. blob: URLs). */
  format?: string[];
  volume?: number;
  loop?: boolean;
  /** Distance at which attenuation starts, in metres. */
  refDistance?: number;
  /**
   * PannerNode maxDistance, in metres. Only the linear distance model uses it; with our exponential
   * model it has no effect on loudness (see exponentialGain).
   */
  maxDistance?: number;
}

interface Emitter {
  key: string;
  object: THREE.Object3D;
  /** Howler sound id once playing; null while waiting for the audio unlock or the file to load. */
  soundId: number | null;
  /** Waiting on the Howl's load event before starting. */
  awaitingLoad: boolean;
}

// Web Audio supports 'exponential', but @types/howler only lists 'inverse' | 'linear'.
const DISTANCE_MODEL = AUDIO.distanceModel as unknown as PannerAttributes['distanceModel'];

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

/**
 * Howler-based audio: 3D one-shots and looping emitters through PannerNodes (HRTF, exponential
 * distance model, rolloff from AUDIO), a listener that follows the camera, and a StemMixer for
 * music that shares Howler's AudioContext and master volume.
 *
 * Before the browser allows audio (first pointer, key or touch), one-shots (`play`, `playAt`) are
 * dropped and return null, since a sound heard late is worse than none. Emitters from `attach`
 * are persistent, so they are queued and start on unlock.
 *
 * Howler's own autoUnlock and autoSuspend are turned off: autoUnlock replaces the AudioContext on
 * devices that do not run at 44.1 kHz (which would orphan the StemMixer), and autoSuspend only
 * counts Howl sounds, so it would suspend the context under playing music.
 */
export class AudioManager {
  readonly music: StemMixer;
  /**
   * The music bus: every stem mixer feeds it and it feeds the master gain, so a duck or a reverb
   * send acts on the music as a whole without touching the stems' own `setMix` ramps. Null if the
   * context cannot make a gain node (then music goes straight to the master gain).
   */
  readonly musicBus: GainNode | null;
  private readonly sounds = new Map<string, Howl>();
  private readonly emitters = new Map<number, Emitter>();
  private readonly unlockCallbacks: Array<() => void> = [];
  private unlocked = false;
  private disposed = false;
  private nextEmitterId = 1;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  constructor() {
    Howler.autoUnlock = false;
    Howler.autoSuspend = false;
    // Touching Howler's volume creates its shared AudioContext and master gain.
    Howler.volume(1);
    if (!Howler.usingWebAudio || !Howler.ctx) {
      throw new Error('Web Audio is unavailable; spatial audio requires it');
    }
    let bus: GainNode | null = null;
    try {
      bus = Howler.ctx.createGain();
      bus.connect(Howler.masterGain);
    } catch {
      bus = null;
    }
    this.musicBus = bus;
    this.music = new StemMixer(Howler.ctx, bus ?? Howler.masterGain);
    if (Howler.ctx.state === 'running') this.unlocked = true;
    else for (const type of UNLOCK_EVENTS) window.addEventListener(type, this.unlock, true);
  }

  /** The node the music bus and the interior reverb feed (Howler's master gain). */
  get masterNode(): AudioNode {
    return Howler.masterGain;
  }

  /** Howler's shared AudioContext, for decoding or building buffers. */
  get context(): AudioContext {
    return Howler.ctx;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Runs `cb` once audio is allowed to play (immediately if it already is). */
  onUnlock(cb: () => void): void {
    if (this.unlocked) cb();
    else this.unlockCallbacks.push(cb);
  }

  register(key: string, def: SoundDefinition): void {
    this.sounds.get(key)?.unload();
    const howl = new Howl({
      src: def.src,
      format: def.format,
      volume: def.volume ?? 1,
      loop: def.loop ?? false,
      html5: false, // PannerNode spatialization needs Web Audio buffers.
      onloaderror: (_id, error) => console.warn(`Sound "${key}" failed to load:`, error),
    });
    // Cone values are explicit: re-applying the group attributes per sound id (spatialize) would
    // otherwise pass undefined cone angles, which PannerNode rejects as non-finite.
    howl.pannerAttr({
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0,
      panningModel: 'HRTF',
      distanceModel: DISTANCE_MODEL,
      rolloffFactor: AUDIO.rolloffFactor,
      refDistance: def.refDistance ?? 1,
      maxDistance: def.maxDistance ?? 100,
    });
    this.sounds.set(key, howl);

    // Emitters on a re-registered key were bound to the unloaded Howl; restart them on the new one.
    for (const emitter of this.emitters.values()) {
      if (emitter.key !== key) continue;
      emitter.soundId = null;
      emitter.awaitingLoad = false;
      if (this.unlocked) this.startEmitter(emitter);
    }
  }

  /** Plays a non-positional sound. Returns the Howler sound id, or null if audio is still locked. */
  play(key: string): number | null {
    const howl = this.get(key);
    if (!this.unlocked) return null;
    return howl.play();
  }

  /**
   * Plays a sound at a fixed world position. Returns null (and plays nothing) while locked. Note
   * that Howler merges two plays issued before the file has loaded into one sound.
   */
  playAt(key: string, position: THREE.Vector3Like): number | null {
    const howl = this.get(key);
    if (!this.unlocked) return null;
    const id = howl.play();
    this.spatialize(howl, id);
    howl.pos(position.x, position.y, position.z, id);
    return id;
  }

  /**
   * Starts a looping sound that follows `object` every frame and returns an emitter id for
   * `detach`. While audio is locked the emitter is queued and starts on unlock. It is removed
   * automatically once the object is no longer under a THREE.Scene.
   */
  attach(key: string, object: THREE.Object3D): number {
    this.get(key);
    const id = this.nextEmitterId++;
    const emitter: Emitter = { key, object, soundId: null, awaitingLoad: false };
    this.emitters.set(id, emitter);
    if (this.unlocked) this.startEmitter(emitter);
    return id;
  }

  /** Stops and removes an emitter. Unknown ids are ignored. */
  detach(emitterId: number): void {
    const emitter = this.emitters.get(emitterId);
    if (!emitter) return;
    if (emitter.soundId !== null) this.sounds.get(emitter.key)?.stop(emitter.soundId);
    this.emitters.delete(emitterId);
  }

  /** Call once per rendered frame: moves the listener to the camera and emitters to their objects. */
  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.tmpPos);
    camera.getWorldDirection(this.tmpForward);
    this.tmpUp.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(this.tmpQuat));
    Howler.pos(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z);
    Howler.orientation(
      this.tmpForward.x,
      this.tmpForward.y,
      this.tmpForward.z,
      this.tmpUp.x,
      this.tmpUp.y,
      this.tmpUp.z,
    );

    for (const [id, emitter] of this.emitters) {
      if (!isInScene(emitter.object)) {
        this.detach(id);
        continue;
      }
      if (emitter.soundId === null) continue;
      emitter.object.getWorldPosition(this.tmpPos);
      this.sounds.get(emitter.key)?.pos(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z, emitter.soundId);
    }
  }

  setMasterVolume(volume: number): void {
    Howler.volume(volume);
  }

  setMuted(muted: boolean): void {
    Howler.mute(muted);
  }

  /** Stops music and emitters, unloads every sound and removes the unlock listeners. */
  dispose(): void {
    this.disposed = true;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, this.unlock, true);
    this.unlockCallbacks.length = 0;
    for (const id of [...this.emitters.keys()]) this.detach(id);
    this.music.dispose();
    this.musicBus?.disconnect();
    for (const howl of this.sounds.values()) howl.unload();
    this.sounds.clear();
  }

  /**
   * Tries to resume the context on every gesture until one succeeds. A gesture that does not count
   * as user activation leaves resume() pending or rejected, so listeners stay until it resolves.
   */
  private readonly unlock = (): void => {
    if (this.unlocked || this.disposed) return;
    Howler.ctx.resume().then(
      () => {
        if (this.unlocked || this.disposed) return;
        this.unlocked = true;
        for (const type of UNLOCK_EVENTS) window.removeEventListener(type, this.unlock, true);
        for (const emitter of this.emitters.values()) {
          if (emitter.soundId === null) this.startEmitter(emitter);
        }
        for (const cb of this.unlockCallbacks.splice(0)) cb();
      },
      () => {}, // Refused: stay locked; the next gesture tries again.
    );
  };

  private startEmitter(emitter: Emitter): void {
    const howl = this.get(emitter.key);
    // Howler cannot set loop points on a sound whose buffer is not decoded yet, so wait for it.
    if (howl.state() !== 'loaded') {
      if (emitter.awaitingLoad) return;
      emitter.awaitingLoad = true;
      howl.once('load', () => {
        emitter.awaitingLoad = false;
        const stillAttached = [...this.emitters.values()].includes(emitter);
        if (stillAttached && emitter.soundId === null && !this.disposed) this.startEmitter(emitter);
      });
      return;
    }
    const soundId = howl.play();
    howl.loop(true, soundId);
    this.spatialize(howl, soundId);
    emitter.object.getWorldPosition(this.tmpPos);
    howl.pos(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z, soundId);
    emitter.soundId = soundId;
  }

  private get(key: string): Howl {
    const howl = this.sounds.get(key);
    if (!howl) throw new Error(`Unknown sound "${key}"`);
    return howl;
  }

  /** Howler only creates a sound's PannerNode on its first pos() call, so apply the group attributes per id. */
  private spatialize(howl: Howl, id: number): void {
    howl.pannerAttr(howl.pannerAttr(), id);
  }
}

function isInScene(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if ((o as THREE.Scene).isScene) return true;
  }
  return false;
}
