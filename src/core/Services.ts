/**
 * Optional cross-thread APIs (contracts/game-events-and-flags.md section 6). Providers augment this
 * interface: `declare module '../core/Services' { interface GameServices { vfx: VfxService } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GameServices {}

type Name = keyof GameServices & string;

export class Services {
  private readonly impls = new Map<string, unknown>();

  /** Registers the provider; a second provider for the same name throws. Returns unprovide(). */
  provide<K extends Name>(name: K, impl: GameServices[K]): () => void {
    if (this.impls.has(name)) throw new Error(`Services: "${name}" is already provided`);
    this.impls.set(name, impl);
    return () => {
      if (this.impls.get(name) === impl) this.impls.delete(name);
    };
  }

  /** The provider, or undefined when its thread has not merged or its plugin failed. */
  get<K extends Name>(name: K): GameServices[K] | undefined {
    return this.impls.get(name) as GameServices[K] | undefined;
  }

  require<K extends Name>(name: K): GameServices[K] {
    if (!this.impls.has(name)) throw new Error(`Services: "${name}" is required but not provided`);
    return this.impls.get(name) as GameServices[K];
  }

  has(name: string): boolean {
    return this.impls.has(name);
  }
}
