// Pure dialogue state machine. Depends only on the narrow ports in ../quests/ports.
import type { BusPort, StatePort, StringsPort, QuestReader } from '../quests/ports';
import type { Condition, DialogueDef, DialogueNode, DialogueSaveData, Effect } from '../quests/types';
import { evalCondition as defaultEval } from '../quests/conditions';

export type CloseReason = 'skip' | 'death' | 'load' | 'dispose' | 'script';

export interface DialogueView {
  dialogueId: string;
  npcId: string;
  nodeId: string;
  speaker: string;
  /** set when the speaker's display name is dynamic (speaker 'cael' = the player's name) */
  speakerName?: string;
  portrait: string | undefined;
  text: string;
  hasNext: boolean;
  choices: { number: number; id: string; text: string }[];
}

export interface DialogueRunnerOptions {
  bus: BusPort;
  state: StatePort;
  quests: QuestReader;
  effects: { run(effects: Effect[] | undefined): unknown };
  strings: StringsPort;
  evalCondition?: (c: Condition | undefined, env: { state: StatePort; quests: QuestReader; gold?: () => number | undefined; warn?(m: string): void }) => boolean;
  /** inventory gold for `gold` conditions */
  gold?: () => number | undefined;
  playerName?: () => string;
  warn?: (msg: string) => void;
}

export const MAX_CHOICES = 4;
export const MAX_STEPS = 200;

export class DialogueRunner {
  readonly strings: StringsPort;
  private readonly o: DialogueRunnerOptions;
  private readonly defs = new Map<string, DialogueDef>();
  private readonly nodeMaps = new Map<string, Map<string, DialogueNode>>();
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly warned = new Set<string>();
  private cur: { def: DialogueDef; npcId: string; node: DialogueNode; visible: DialogueNode['choices'] } | null = null;
  private cachedView: DialogueView | null = null;
  private steps = 0;

  constructor(o: DialogueRunnerOptions) {
    this.o = o;
    this.strings = o.strings;
  }

  register(def: DialogueDef): void {
    if (this.defs.has(def.id)) throw new Error(`dialogue "${def.id}" already registered`);
    this.defs.set(def.id, def);
    this.nodeMaps.set(def.id, new Map(def.nodes.map((n) => [n.id, n])));
  }

  get isOpen(): boolean { return this.cur !== null; }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  hasSeen(nodeId: string): boolean { return this.seen.has(nodeId); }
  serialize(): DialogueSaveData { return { seen: [...this.seen] }; }
  load(data: unknown): void {
    this.seen.clear();
    const seen = (data as { seen?: unknown } | null | undefined)?.seen;
    if (Array.isArray(seen)) for (const s of seen) if (typeof s === 'string') this.seen.add(s);
  }

  view(): DialogueView | null { return this.cachedView; }

  start(dialogueId: string, npcId: string): boolean {
    if (this.cur) return false;
    const def = this.defs.get(dialogueId);
    if (!def) { this.warnOnce(`unknown:${dialogueId}`, `dialogue: unknown id "${dialogueId}"`); return false; }
    let startNode: string | undefined;
    if (typeof def.start === 'string') startNode = def.start;
    else {
      for (const e of def.start) {
        if (this.check(e.when)) { startNode = e.node; break; }
      }
    }
    if (startNode === undefined || !this.nodeMaps.get(dialogueId)!.has(startNode)) {
      this.warnOnce(`nostart:${dialogueId}`, `dialogue "${dialogueId}": no usable start entry`);
      return false;
    }
    this.steps = 0;
    // Placeholder so isOpen is true during entry; replaced by go().
    const first = this.nodeMaps.get(dialogueId)!.get(startNode)!;
    this.cur = { def, npcId, node: first, visible: [] };
    this.o.bus.emit('dialogue.started', { dialogueId, npcId });
    this.go(startNode);
    return true;
  }

  advance(): void {
    const c = this.cur;
    if (!c || !this.cachedView || this.cachedView.choices.length > 0) return;
    this.steps = 0;
    this.go(c.node.next);
  }

  choose(displayNumber: number): void {
    const c = this.cur;
    if (!c || !Number.isInteger(displayNumber)) return;
    const vis = c.visible ?? [];
    const choice = vis[displayNumber - 1];
    if (!choice) return;
    if (!this.check(choice.when)) {
      // stale: refresh the visible list and re-render
      c.visible = this.visibleChoices(c.node);
      if (c.visible.length === 0) { this.steps = 0; this.go(c.node.next); return; }
      this.refreshView();
      return;
    }
    this.steps = 0;
    this.o.bus.emit('dialogue.choice', { dialogueId: c.def.id, nodeId: c.node.id, choiceId: choice.id });
    if (this.cur !== c) return; // a listener closed us
    const halted = this.runEffects(choice.effects);
    if (this.cur !== c) return;
    if (halted) {
      // a failed spend: stay on this node; the choice is hidden or disabled by its own gold condition now
      c.visible = this.visibleChoices(c.node);
      if (c.visible.length === 0) { this.steps = 0; this.go(c.node.next); return; }
      this.refreshView();
      return;
    }
    this.go(choice.next);
  }

  close(reason: CloseReason): void {
    this.finish(reason);
  }

  // ---- internals ----

  private go(first: string | null | undefined): void {
    const c = this.cur;
    if (!c) return;
    const nodes = this.nodeMaps.get(c.def.id)!;
    let id = first;
    for (;;) {
      if (this.cur !== c) return;
      if (id === null || id === undefined) { this.finish(); return; }
      if (++this.steps > MAX_STEPS) {
        this.warnOnce(`cap:${c.def.id}`, `dialogue "${c.def.id}": more than ${MAX_STEPS} node entries in one step, ending`);
        this.finish();
        return;
      }
      const node = nodes.get(id);
      if (!node) {
        this.warnOnce(`node:${c.def.id}:${id}`, `dialogue "${c.def.id}": unknown node "${id}"`);
        this.finish();
        return;
      }
      if (node.when !== undefined && !this.check(node.when)) { id = node.next; continue; }
      c.node = node;
      this.runEffects(node.effects);
      if (this.cur !== c) return;
      this.seen.add(node.id);
      if (node.choices && node.choices.length > 0) {
        const vis = this.visibleChoices(node);
        if (vis.length === 0) {
          this.warnOnce(`allfiltered:${c.def.id}:${node.id}`, `dialogue "${c.def.id}" node "${node.id}": every choice filtered out`);
          id = node.next;
          continue;
        }
        c.visible = vis;
      } else c.visible = [];
      this.refreshView();
      return;
    }
  }

  private visibleChoices(node: DialogueNode): NonNullable<DialogueNode['choices']> {
    const all = node.choices ?? [];
    const vis = all.filter((ch) => this.check(ch.when));
    if (vis.length > MAX_CHOICES) {
      this.warnOnce(`many:${node.id}`, `dialogue node "${node.id}": ${vis.length} choices, truncated to ${MAX_CHOICES}`);
      return vis.slice(0, MAX_CHOICES);
    }
    return vis;
  }

  private refreshView(): void {
    const c = this.cur;
    if (!c) return;
    const name = this.playerName();
    const vis = c.visible ?? [];
    this.cachedView = {
      dialogueId: c.def.id,
      npcId: c.npcId,
      nodeId: c.node.id,
      speaker: c.node.speaker,
      ...(c.node.speaker === 'cael' ? { speakerName: name } : {}),
      portrait: c.node.portrait,
      text: this.t(c.node.textKey, name),
      hasNext: vis.length === 0,
      choices: vis.map((ch, i) => ({ number: i + 1, id: ch.id, text: this.t(ch.textKey, name) })),
    };
    this.notify();
  }

  private finish(reason: CloseReason | 'completed' = 'completed'): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.cachedView = null;
    this.o.bus.emit('dialogue.ended', { dialogueId: c.def.id, npcId: c.npcId, reason });
    this.notify();
  }

  private notify(): void {
    for (const l of [...this.listeners]) {
      try { l(); } catch (e) { this.warnOnce('listener', `dialogue listener threw: ${String(e)}`); }
    }
  }

  private playerName(): string {
    try { return this.o.playerName?.() || 'Cael'; } catch { return 'Cael'; }
  }

  private t(key: string, name: string): string {
    try { return this.o.strings.t(key, { name }); } catch { return `[[${key}]]`; }
  }

  private check(c: Condition | undefined): boolean {
    if (c === undefined) return true;
    try {
      const fn = this.o.evalCondition ?? defaultEval;
      return !!fn(c, { state: this.o.state, quests: this.o.quests, gold: this.o.gold, warn: (m) => this.warn(m) });
    } catch (e) {
      this.warnOnce('cond', `dialogue condition threw: ${String(e)}`);
      return false;
    }
  }

  /** Runs effects; true when a failed spend halted them. */
  private runEffects(effects: Effect[] | undefined): boolean {
    if (!effects || effects.length === 0) return false;
    try {
      const res = this.o.effects.run(effects);
      return Array.isArray(res) && res.some((r) => (r as { halted?: boolean })?.halted === true);
    } catch (e) { this.warnOnce('effects', `dialogue effects threw: ${String(e)}`); return false; }
  }

  private warn(msg: string): void {
    if (this.o.warn) this.o.warn(msg);
    else console.warn(msg);
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(msg);
  }
}
