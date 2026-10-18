import type { InvulnerabilityGate } from './types';

/** Reference-counted invulnerability: the actor stays invulnerable while any named source is active. */
export class InvulnSources implements InvulnerabilityGate {
  private readonly sources = new Set<string>();

  constructor(private readonly actor: { invulnerable: boolean }) {
    this.actor.invulnerable = false;
  }

  add(source: string): void {
    this.sources.add(source);
    this.sync();
  }

  remove(source: string): void {
    this.sources.delete(source);
    this.sync();
  }

  has(source: string): boolean {
    return this.sources.has(source);
  }

  /** True when `source` is the only reason the actor is invulnerable. */
  only(source: string): boolean {
    return this.sources.size === 1 && this.sources.has(source);
  }

  get active(): boolean {
    return this.sources.size > 0;
  }

  private sync(): void {
    this.actor.invulnerable = this.sources.size > 0;
  }
}
