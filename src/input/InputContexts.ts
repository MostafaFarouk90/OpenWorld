import type { InputContext, InputContextStack } from './actions';

interface Entry {
  ctx: InputContext;
  ownerId: string;
}

/** The input context stack (contracts/input-and-hud.md section 3). */
export class InputContexts implements InputContextStack {
  private readonly stack: Entry[] = [];
  private readonly listeners = new Set<(top: InputContext) => void>();

  push(ctx: InputContext, ownerId: string): () => void {
    const before = this.top();
    const entry: Entry = { ctx, ownerId };
    this.stack.push(entry);
    this.notify(before);
    return () => {
      const i = this.stack.indexOf(entry);
      if (i < 0) return;
      const prev = this.top();
      this.stack.splice(i, 1);
      this.notify(prev);
    };
  }

  top(): InputContext {
    return this.stack.length ? this.stack[this.stack.length - 1].ctx : 'gameplay';
  }

  /** Owner ids from bottom to top (diagnostics). */
  owners(): string[] {
    return this.stack.map((e) => e.ownerId);
  }

  onChange(listener: (top: InputContext) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(before: InputContext): void {
    const now = this.top();
    if (now === before) return;
    for (const l of [...this.listeners]) l(now);
  }
}
