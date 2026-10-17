import type * as THREE from 'three';
import type { AttackWindowSource } from './types';

/** True when the source's current time lies in [start, end]; inverted windows never fire (start == end is a legal instant window). */
export function isWindowActive(src: AttackWindowSource): boolean {
  if (!(src.end >= src.start)) return false;
  const t = src.currentTime();
  if (t === null || t === undefined || !Number.isFinite(t)) return false;
  return t >= src.start && t <= src.end;
}

/** Attack window driven by a THREE.AnimationAction's playback position. */
export class MixerAttackWindowSource implements AttackWindowSource {
  constructor(
    private readonly action: THREE.AnimationAction,
    readonly clipName: string,
    readonly start: number,
    readonly end: number,
  ) {}

  currentTime(): number | null {
    const a = this.action;
    if (a.getClip().name !== this.clipName) return null; // action plays a different clip than the window describes
    if (!a.isRunning() || a.paused || !a.enabled || a.getEffectiveWeight() <= 0) return null;
    const duration = a.getClip().duration;
    if (!(duration > 0)) return null;
    const t = (((a.time % duration) + duration) % duration) / duration;
    return t >= 1 ? 0 : t;
  }
}
