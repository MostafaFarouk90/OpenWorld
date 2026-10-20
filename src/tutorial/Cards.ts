/**
 * Tutorial cards (Mostafa, 2026-10-20: "better tutorial cards"): the beat lines and toasts as readable panels in
 * the shared HUD look (dark warm panel, gold edge), and a beat card in `top-center` naming the beat as it starts
 * ("Knighting Day · 3 of 15") and as it is done. Timed by `tick(dt)` from the render loop, not by timers.
 */

type Slot = 'subtitle' | 'toast' | 'top-center';

export interface CardDeps {
  /** Null headless: nothing is drawn, the bookkeeping still runs. */
  doc: Document | null;
  mount(slot: Slot, widget: { id: string; element: HTMLElement }, order?: number): () => void;
}

const PANEL = {
  background: 'rgba(20,16,12,.84)',
  border: '1px solid #6a5a3a',
  borderRadius: '6px',
  boxShadow: '0 2px 10px rgba(0,0,0,.45)',
  color: '#f3ead8',
  fontFamily: 'system-ui,sans-serif',
  pointerEvents: 'none',
} as const;
const GOLD = '#c9a64a';
const SPEAKER_MAX = 24;
/** Pixels the line cards rise above the subtitle slot, clear of up to two prompt rows. */
const SUBTITLE_LIFT = 84;

/** "Sir Gaut: Run!" → speaker "Sir Gaut", body "Run!". A line without a short leading name has no speaker. */
export function splitSpeaker(text: string): { speaker: string | null; body: string } {
  const at = text.indexOf(': ');
  if (at <= 0 || at > SPEAKER_MAX || /[.!?]/.test(text.slice(0, at))) return { speaker: null, body: text };
  return { speaker: text.slice(0, at), body: text.slice(at + 2) };
}

/** Seconds a line stays up: long enough to read, 4 s plus 55 ms a character, within 5 to 11 s. */
export function lineSeconds(text: string): number {
  return Math.min(11, Math.max(5, 4 + 0.055 * text.length));
}

interface Live {
  left: number;
  unmount: () => void;
}

/** Beat lines (subtitle slot) and tutorial toasts as cards; at most `max` of each at once, oldest out first. */
export class LineCards {
  private readonly live: Record<'subtitle' | 'toast', Live[]> = { subtitle: [], toast: [] };
  private seq = 0;

  constructor(
    private readonly deps: CardDeps,
    private readonly max = 2,
  ) {}

  count(slot: 'subtitle' | 'toast'): number {
    return this.live[slot].length;
  }

  show(text: string, slot: 'subtitle' | 'toast'): void {
    if (!text) return;
    const list = this.live[slot];
    while (list.length >= this.max) list.shift()!.unmount();
    let unmount = () => {};
    const doc = this.deps.doc;
    if (doc) {
      const el = doc.createElement('div');
      el.className = `owg-tutorial-card owg-tutorial-${slot}`;
      if (slot === 'subtitle') {
        const { speaker, body } = splitSpeaker(text);
        // The subtitle slot sits just above the ability bar; lift the card clear of the key prompts too.
        Object.assign(el.style, PANEL, { maxWidth: '620px', padding: '10px 16px', margin: '0 auto 8px', borderLeft: `3px solid ${GOLD}`, position: 'relative', top: `-${SUBTITLE_LIFT}px` });
        if (speaker) {
          const who = doc.createElement('div');
          who.className = 'owg-tutorial-speaker';
          who.textContent = speaker;
          Object.assign(who.style, { fontSize: '12px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#f0d890', marginBottom: '2px' });
          el.appendChild(who);
        }
        const b = doc.createElement('div');
        b.className = 'owg-tutorial-body';
        b.textContent = body;
        Object.assign(b.style, { fontSize: '17px', lineHeight: '1.35' });
        el.appendChild(b);
      } else {
        el.textContent = text;
        Object.assign(el.style, PANEL, { padding: '6px 16px', marginTop: '6px', fontSize: '15px', borderLeft: '3px solid #6a9a4a' });
      }
      // Tutorial toasts go under the beat card (top-center): the toast slot shares the top right with the tracker.
      unmount = this.deps.mount(slot === 'toast' ? 'top-center' : slot, { id: `tutorial.${slot}.${++this.seq}`, element: el }, slot === 'toast' ? 5 : undefined);
    }
    list.push({ left: slot === 'subtitle' ? lineSeconds(text) : 3.5, unmount });
  }

  tick(dt: number): void {
    if (!(dt > 0)) return;
    for (const list of Object.values(this.live)) {
      for (const l of [...list]) {
        l.left -= dt;
        if (l.left <= 0) {
          l.unmount();
          list.splice(list.indexOf(l), 1);
        }
      }
    }
  }

  /** Drops every card, or one slot's (a save load or a skip: they are about a beat that is over). */
  clear(slot?: 'subtitle' | 'toast'): void {
    for (const list of slot ? [this.live[slot]] : Object.values(this.live)) for (const l of list.splice(0)) l.unmount();
  }

  dispose(): void {
    this.clear();
  }
}

export interface BeatCardSpec {
  kind: 'start' | 'done';
  /** Small line above the title, e.g. "Knighting Day · 3 of 15". */
  kicker: string;
  title: string;
}

const BEAT_SECONDS = { start: 4, done: 2.5 } as const;

/**
 * One card at a time in `top-center`. A start that follows a done in the same moment (a beat finishes and the next
 * begins) waits for the done card, so both are read.
 */
export class BeatCards {
  private queue: BeatCardSpec[] = [];
  private current: (BeatCardSpec & { left: number; unmount: () => void }) | null = null;

  constructor(private readonly deps: CardDeps) {}

  get showing(): BeatCardSpec | null {
    return this.current ? { kind: this.current.kind, kicker: this.current.kicker, title: this.current.title } : null;
  }

  show(spec: BeatCardSpec): void {
    // A newer card of the same kind replaces a queued one (skip chains), so the queue never grows.
    this.queue = this.queue.filter((q) => q.kind !== spec.kind);
    this.queue.push(spec);
    // A beat finished (done) or was skipped (the next start) while a start card is still up: take over at once.
    if (this.current?.kind === 'start') {
      this.current.unmount();
      this.current = null;
    }
    if (!this.current) this.next();
  }

  tick(dt: number): void {
    if (!(dt > 0) || !this.current) return;
    this.current.left -= dt;
    if (this.current.left > 0) return;
    this.current.unmount();
    this.current = null;
    this.next();
  }

  /** Drops what is showing and queued (a skip chain or teardown). */
  clear(): void {
    this.queue = [];
    this.current?.unmount();
    this.current = null;
  }

  dispose(): void {
    this.clear();
  }

  private next(): void {
    const spec = this.queue.shift();
    if (!spec) return;
    let unmount = () => {};
    const doc = this.deps.doc;
    if (doc) {
      const el = doc.createElement('div');
      el.className = `owg-tutorial-beat owg-tutorial-beat-${spec.kind}`;
      Object.assign(el.style, PANEL, { padding: '8px 22px', textAlign: 'center', borderTop: `2px solid ${spec.kind === 'done' ? '#6a9a4a' : GOLD}` });
      const k = doc.createElement('div');
      k.textContent = spec.kicker;
      Object.assign(k.style, { fontSize: '11px', letterSpacing: '.16em', textTransform: 'uppercase', color: '#c9b88a' });
      const n = doc.createElement('div');
      n.textContent = spec.kind === 'done' ? `✓ ${spec.title}` : spec.title;
      Object.assign(n.style, { fontSize: '22px', fontWeight: '700', color: spec.kind === 'done' ? '#cfe6b0' : '#f0d890' });
      el.append(k, n);
      unmount = this.deps.mount('top-center', { id: 'tutorial.beat-card', element: el }, 4);
    }
    this.current = { ...spec, left: BEAT_SECONDS[spec.kind], unmount };
  }
}
