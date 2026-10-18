/**
 * Registration scopes for plugins: a wrapped service records every undo function its tracked methods
 * return, so a failed or disposed plugin leaves nothing behind (contracts/game-events-and-flags.md section 1).
 */
export class Scope {
  private readonly undos: (() => void)[] = [];
  private closed = false;

  constructor(private readonly report: (message: string, err?: unknown) => void = (m, e) => console.error(m, e)) {}

  get isClosed(): boolean {
    return this.closed;
  }

  get size(): number {
    return this.undos.length;
  }

  /** Records `undo`; after `close` it runs at once (a late registration from a timed-out setup). */
  track(undo: () => void): () => void {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      try {
        undo();
      } catch (err) {
        this.report('Scope: undo failed', err);
      }
    };
    if (this.closed) {
      once();
      return once;
    }
    this.undos.push(once);
    return once;
  }

  /** Runs every undo in reverse order. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.undos.length) this.undos.pop()!();
  }
}

/**
 * A stand-in for `target` whose methods are bound to it and whose properties read and write through to
 * it, except `tracked` methods, whose returned undo function is recorded in `scope`, and `custom` ones,
 * which replace the method outright.
 */
export function scoped<T extends object>(
  target: T,
  scope: Scope,
  tracked: readonly string[],
  custom: Partial<Record<string, (...args: never[]) => unknown>> = {},
): T {
  const out = Object.create(null) as Record<string, unknown>;
  const seen = new Set<string>();
  for (let o: object | null = target; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const name of Object.getOwnPropertyNames(o)) {
      if (name === 'constructor' || seen.has(name)) continue;
      seen.add(name);
      const desc = Object.getOwnPropertyDescriptor(o, name)!;
      if (name in custom) {
        out[name] = custom[name];
      } else if (typeof desc.value === 'function') {
        const fn = desc.value as (...a: unknown[]) => unknown;
        out[name] = tracked.includes(name)
          ? (...a: unknown[]) => {
              const undo = fn.apply(target, a);
              if (undo === null) return null; // e.g. openModal refused: nothing to undo
              if (typeof undo !== 'function') throw new Error(`scoped: ${name} did not return an undo function`);
              return scope.track(undo as () => void);
            }
          : fn.bind(target);
      } else {
        Object.defineProperty(out, name, {
          get: () => (target as Record<string, unknown>)[name],
          set: (v) => {
            (target as Record<string, unknown>)[name] = v;
          },
          enumerable: true,
        });
      }
    }
  }
  return out as T;
}
