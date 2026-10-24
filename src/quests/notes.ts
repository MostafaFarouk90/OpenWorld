// Readable notes: a page, a grave or a ledger in the world. F opens a short dialogue (speaker 'note' or 'cael'), so a
// note reads like any conversation, counts as a talk with its own id (`talk` objectives target the note id) and, read
// to the end the first time, unlocks a codex lore entry.
import type { BusPort, ConditionEnv, Unsubscribe } from './ports';
import type { Condition, ObjectiveDef } from './types';
import type { Vec3Like } from './carry';
import { evalCondition } from './conditions';

export interface QuestNoteSpec {
  /** `use:note-<name>`; the dialogue id and the talk target are the part after `use:` */
  interactableId: string;
  anchorId: string;
  /** readable only while this holds (default: always) */
  when?: Condition;
  /** codex lore entry unlocked when the note is first read to its end */
  codexId?: string;
  /** prompt shown with F; default `quest.prompt.read` */
  promptKey?: string;
  /** Wins focus over an NPC standing on the same spot (equal distance ties go to `npc:`), within the limits of `outranks`. */
  priority?: number;
  /**
   * A note standing on an NPC (`npcId`) keeps its `priority` only while it is still worth reading: its read objective
   * (`quest`, `objective`) is current and has not counted this note yet, and the NPC has no live talk objective of its
   * own. Once read (or opened in this session and not cut short) it gives way, so the NPC is reachable from where it
   * stands (playtest NOTES_UNDER_NPCS).
   */
  outranks?: { npcId: string; quest: string; objective: string };
}

/** What a note standing on an NPC asks of the quests to decide whether it still outranks the NPC. */
export interface NoteQuestPort {
  isObjectiveCurrent(questId: string, objectiveId: string): boolean;
  /** The objective has counted this dedupe key (a note id) already. */
  counted(questId: string, objectiveId: string, key: string): boolean;
  /** Some active quest's current objective is a talk with this NPC. */
  npcObjectiveLive(npcId: string): boolean;
  /** Some active quest's current objective still needs this note read (a talk with it, or a read it has not counted). */
  noteNeeded?(noteId: string): boolean;
}

/** An objective `target` (one id or a list) names `id`. */
export const targets = (target: string | readonly string[] | undefined, id: string): boolean =>
  Array.isArray(target) ? target.includes(id) : target === id;

/** The quest reads `noteNeeded` takes (QuestManager has them all). */
export interface NoteNeedReader {
  active(): string[];
  objectives(questId: string): ReadonlyArray<{ def: ObjectiveDef; current: boolean }>;
  counted(questId: string, objectiveId: string, key: string): boolean;
}

/**
 * Some active quest's current objective needs this note read: a `talk` with it, or a read objective (`dialogue.ended`
 * matching its npc id) that has not counted it yet.
 */
export function noteNeeded(q: NoteNeedReader, noteId: string): boolean {
  for (const qid of q.active()) {
    for (const v of q.objectives(qid)) {
      if (!v.current) continue;
      const d = v.def;
      if (d.type === 'talk' && targets(d.target, noteId)) return true;
      if (d.type !== 'event' || !targets(d.target, 'dialogue.ended')) continue;
      const m = d.match?.npcId;
      if ((Array.isArray(m) ? m.includes(noteId) : m === noteId) && !q.counted(qid, d.id, noteId)) return true;
    }
  }
  return false;
}

/** The dialogue id (and the npc id it runs under) of a note. */
export const noteDialogueId = (interactableId: string): string => interactableId.replace(/^use:/, '');

export interface QuestNotePorts {
  bus: BusPort;
  env(): ConditionEnv;
  anchor(id: string): Vec3Like | undefined;
  /** Read on each focus pick: `priority` is a getter on the registered interactable. */
  register(i: {
    id: string; radius: number; promptKey: string; readonly priority?: number;
    position(out: Vec3Like): Vec3Like; enabled(): boolean; onInteract(): void;
    /** A current objective needs this note (the focus prefers it over a companion at a similar distance). */
    live(): boolean;
  }): () => void;
  /** dialogue service start; false when another modal or dialogue is open */
  startDialogue(dialogueId: string, npcId: string): boolean;
  codexUnlock?(id: string): void;
  /** For notes with `outranks`; absent, such a note gives way only once opened in this session. */
  quests?: NoteQuestPort;
  warn?(m: string): void;
}

export class QuestNotes {
  private readonly offs = new Map<string, () => void>();
  private readonly failed = new Set<string>();
  private readonly unsub: Unsubscribe;
  private readonly unsubLoad: Unsubscribe;
  /** Notes opened in this session and not cut short (a talk closed early is a read not done). */
  private readonly opened = new Set<string>();
  private disposed = false;

  constructor(private readonly specs: readonly QuestNoteSpec[], private readonly p: QuestNotePorts) {
    const byNpc = new Map(specs.map((s) => [noteDialogueId(s.interactableId), s]));
    this.unsub = p.bus.on('dialogue.ended', (e: { npcId?: unknown; reason?: unknown } | null | undefined) => {
      const s = typeof e?.npcId === 'string' ? byNpc.get(e.npcId) : undefined;
      const completed = e?.reason === undefined || e.reason === 'completed';
      if (s && !completed) this.opened.delete(noteDialogueId(s.interactableId));
      if (!s?.codexId || !completed) return;
      try { p.codexUnlock?.(s.codexId); } catch (err) { p.warn?.(`notes: codex unlock ${s.codexId}: ${String(err)}`); }
    });
    // A load may go back to before a read: the loaded quests decide again.
    this.unsubLoad = p.bus.on('save.loaded', () => this.opened.clear());
  }

  /** Registers every note whose anchor exists. Cheap; call a few times a second. */
  update(): void {
    if (this.disposed) return;
    for (const s of this.specs) {
      if (this.offs.has(s.interactableId) || this.failed.has(s.interactableId)) continue;
      const at = this.p.anchor(s.anchorId);
      if (!at) continue;
      const home = { x: at.x, y: at.y, z: at.z };
      const id = noteDialogueId(s.interactableId);
      const notes = this;
      try {
        this.offs.set(s.interactableId, this.p.register({
          id: s.interactableId, radius: 2, promptKey: s.promptKey ?? 'quest.prompt.read',
          get priority() { return notes.priorityOf(s); },
          position: (out) => { out.x = home.x; out.y = home.y; out.z = home.z; return out; },
          enabled: () => !this.disposed && this.readable(s),
          live: () => this.p.quests?.noteNeeded?.(id) ?? false,
          onInteract: () => {
            if (this.readable(s) && this.p.startDialogue(id, id)) this.opened.add(id);
          },
        }));
      } catch (e) {
        this.failed.add(s.interactableId);
        this.p.warn?.(`notes: could not register ${s.interactableId}: ${String(e)}`);
      }
    }
  }

  /** The focus priority right now: the spec's, while the note still outranks the NPC it stands on, else none. */
  priorityOf(s: QuestNoteSpec): number | undefined {
    if (!s.priority) return undefined;
    const id = noteDialogueId(s.interactableId);
    if (this.opened.has(id)) return undefined;
    const o = s.outranks;
    const q = this.p.quests;
    if (!o || !q) return s.priority;
    try {
      if (!q.isObjectiveCurrent(o.quest, o.objective) || q.counted(o.quest, o.objective, id) || q.npcObjectiveLive(o.npcId)) return undefined;
    } catch (e) {
      this.p.warn?.(`notes: priority of ${s.interactableId}: ${String(e)}`);
      return undefined;
    }
    return s.priority;
  }

  readable(s: QuestNoteSpec): boolean {
    if (!s.when) return true;
    try { return evalCondition(s.when, this.p.env()); } catch { return false; }
  }

  /** Notes still waiting on an anchor (tests and diagnostics). */
  pending(): string[] { return this.specs.filter((s) => !this.offs.has(s.interactableId)).map((s) => s.interactableId); }

  dispose(): void {
    this.disposed = true;
    this.unsub();
    this.unsubLoad();
    for (const o of this.offs.values()) o();
    this.offs.clear();
  }
}
