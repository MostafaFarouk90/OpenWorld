// Readable notes: a page, a grave or a ledger in the world. F opens a short dialogue (speaker 'note' or 'cael'), so a
// note reads like any conversation, counts as a talk with its own id (`talk` objectives target the note id) and, read
// to the end the first time, unlocks a codex lore entry.
import type { BusPort, ConditionEnv, Unsubscribe } from './ports';
import type { Condition } from './types';
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
}

/** The dialogue id (and the npc id it runs under) of a note. */
export const noteDialogueId = (interactableId: string): string => interactableId.replace(/^use:/, '');

export interface QuestNotePorts {
  bus: BusPort;
  env(): ConditionEnv;
  anchor(id: string): Vec3Like | undefined;
  register(i: {
    id: string; radius: number; promptKey: string;
    position(out: Vec3Like): Vec3Like; enabled(): boolean; onInteract(): void;
  }): () => void;
  /** dialogue service start; false when another modal or dialogue is open */
  startDialogue(dialogueId: string, npcId: string): boolean;
  codexUnlock?(id: string): void;
  warn?(m: string): void;
}

export class QuestNotes {
  private readonly offs = new Map<string, () => void>();
  private readonly failed = new Set<string>();
  private readonly unsub: Unsubscribe;
  private disposed = false;

  constructor(private readonly specs: readonly QuestNoteSpec[], private readonly p: QuestNotePorts) {
    const byNpc = new Map(specs.map((s) => [noteDialogueId(s.interactableId), s]));
    this.unsub = p.bus.on('dialogue.ended', (e: { npcId?: unknown; reason?: unknown } | null | undefined) => {
      const s = typeof e?.npcId === 'string' ? byNpc.get(e.npcId) : undefined;
      if (!s?.codexId || (e?.reason !== undefined && e.reason !== 'completed')) return;
      try { p.codexUnlock?.(s.codexId); } catch (err) { p.warn?.(`notes: codex unlock ${s.codexId}: ${String(err)}`); }
    });
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
      try {
        this.offs.set(s.interactableId, this.p.register({
          id: s.interactableId, radius: 2, promptKey: s.promptKey ?? 'quest.prompt.read',
          position: (out) => { out.x = home.x; out.y = home.y; out.z = home.z; return out; },
          enabled: () => !this.disposed && this.readable(s),
          onInteract: () => { if (this.readable(s)) this.p.startDialogue(id, id); },
        }));
      } catch (e) {
        this.failed.add(s.interactableId);
        this.p.warn?.(`notes: could not register ${s.interactableId}: ${String(e)}`);
      }
    }
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
    for (const o of this.offs.values()) o();
    this.offs.clear();
  }
}
