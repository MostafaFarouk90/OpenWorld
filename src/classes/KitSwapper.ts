import type { ClassId } from '../actors/classes';
import type { PlayerAvatar } from '../characters/PlayerAvatar';

export interface KitSwapperPorts {
  /** The class of the avatar worn now; null before the first `player.avatar`. */
  wornClass(): ClassId | null;
  /** True once the first `player.avatar` arrived (core rule: no swap before it). */
  attached(): boolean;
  /** Safe to swap: out of combat, not mid-attack or mid-action (`combatVerbs.busy`), no cast open. */
  idle(): boolean;
  build(classId: ClassId): Promise<PlayerAvatar>;
  /** `ctx.player.swapAvatar`. */
  swap(avatar: PlayerAvatar): boolean;
  warn(message: string): void;
  /** The kit failed to load: the player keeps the current look. */
  failed(classId: ClassId): void;
}

/**
 * Dresses the player in the class of record. Loads start at once; the swap itself waits, ticked each fixed step, for the
 * first avatar and an idle moment. A newer request makes an older load stale (it is disposed when it lands).
 */
export class KitSwapper {
  private target: ClassId | null = null;
  private ready: PlayerAvatar | null = null;
  private generation = 0;

  constructor(private readonly ports: KitSwapperPorts) {}

  /** The class the swapper is working towards (null when the worn kit already matches). */
  get pending(): ClassId | null {
    return this.target;
  }

  request(classId: ClassId): void {
    if (this.target === classId) return;
    this.drop();
    if (this.ports.attached() && this.ports.wornClass() === classId) return;
    this.target = classId;
    const gen = ++this.generation;
    this.ports.build(classId).then(
      (avatar) => {
        if (gen !== this.generation) {
          avatar.dispose();
          return;
        }
        this.ready = avatar;
      },
      (err: unknown) => {
        if (gen !== this.generation) return;
        this.target = null;
        this.ports.warn(`classes: the ${classId} kit failed to load (${err instanceof Error ? err.message : String(err)}); keeping the current look`);
        this.ports.failed(classId);
      },
    );
  }

  tick(): void {
    if (!this.target) return;
    if (!this.ports.attached()) return;
    if (this.ports.wornClass() === this.target) {
      // Already dressed (a load re-requested the class it boots with).
      this.drop();
      return;
    }
    if (!this.ready || !this.ports.idle()) return;
    const avatar = this.ready;
    if (this.ports.swap(avatar)) {
      this.ready = null;
      this.target = null;
    }
  }

  dispose(): void {
    this.drop();
  }

  private drop(): void {
    this.generation++;
    this.ready?.dispose();
    this.ready = null;
    this.target = null;
  }
}
