// Draws the greybox looks of quest props and notes at their anchors (src/quests/propLooks.ts) and keeps each one's
// visibility in step with the prop: a prop shows once its quest has begun, a spent prop hides (`hideWhenUsed`) or only
// then appears (`lookOnlyUsed`); a note's look is always there. Three.js stays behind the `build` port.
import type { QuestReader, StatePort } from './ports';
import type { PropLook } from './propLooks';
import type { QuestPropSpec } from './props';

export interface LookSpec {
  key: string;
  anchorId: string;
  look: PropLook;
  /** shown once this quest is no longer inactive; absent means always */
  questId?: string;
  usedFlag?: string;
  hideWhenUsed?: boolean;
  lookOnlyUsed?: boolean;
}

export interface LookHandle { setVisible(on: boolean): void; dispose(): void }

export interface QuestLookPorts {
  state: StatePort;
  quests: QuestReader;
  anchor(id: string): { x: number; y: number; z: number; yaw: number } | undefined;
  build(look: PropLook, at: { x: number; y: number; z: number; yaw: number }): LookHandle;
  warn?(m: string): void;
}

/** Look specs for the props that have one and for the notes in `noteLooks`. */
export function lookSpecs(
  props: readonly QuestPropSpec[], notes: readonly { interactableId: string; anchorId: string }[], noteLooks: Record<string, PropLook>,
): LookSpec[] {
  const out: LookSpec[] = [];
  for (const p of props) {
    if (!p.look) continue;
    out.push({
      key: p.interactableId, anchorId: p.anchorId, look: p.look, questId: p.objective[0],
      usedFlag: p.usedFlag, hideWhenUsed: p.hideWhenUsed, lookOnlyUsed: p.lookOnlyUsed,
    });
  }
  for (const n of notes) {
    const look = noteLooks[n.interactableId];
    if (look) out.push({ key: n.interactableId, anchorId: n.anchorId, look });
  }
  return out;
}

/** Whether a look should show now. */
export function lookVisible(s: LookSpec, quests: QuestReader, state: StatePort): boolean {
  if (s.questId && quests.state(s.questId) === 'inactive') return false;
  const used = !!s.usedFlag && state.getFlag(s.usedFlag) === true;
  if (s.lookOnlyUsed) return used;
  if (s.hideWhenUsed && used) return false;
  return true;
}

export class QuestLooks {
  private readonly built = new Map<string, LookHandle>();
  private readonly failed = new Set<string>();
  private disposed = false;

  constructor(private readonly specs: readonly LookSpec[], private readonly p: QuestLookPorts) {}

  /** Builds looks whose anchors exist and refreshes visibility. Cheap; call a few times a second. */
  update(): void {
    if (this.disposed) return;
    for (const s of this.specs) {
      if (this.failed.has(s.key)) continue;
      let h = this.built.get(s.key);
      if (!h) {
        const at = this.p.anchor(s.anchorId);
        if (!at) continue;
        try {
          h = this.p.build(s.look, at);
        } catch (e) {
          this.failed.add(s.key);
          this.p.warn?.(`looks: could not build ${s.key}: ${String(e)}`);
          continue;
        }
        this.built.set(s.key, h);
      }
      h.setVisible(lookVisible(s, this.p.quests, this.p.state));
    }
  }

  /** Keys of the looks built so far (tests and diagnostics). */
  builtKeys(): string[] { return [...this.built.keys()]; }

  dispose(): void {
    this.disposed = true;
    for (const h of this.built.values()) h.dispose();
    this.built.clear();
  }
}
