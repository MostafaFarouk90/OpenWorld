// Interactable props the Harrowmark quests need that no layout thread places: they are anchored at ids the layout threads
// reserve for them and enabled only while their objective is current. Registration is retried until the anchor exists.
import type { BusPort, ConditionEnv, QuestReader, StatePort } from './ports';
import type { Vec3Like } from './carry';
import type { Condition } from './types';
import type { PropLook } from './propLooks';
import { evalCondition } from './conditions';

export interface QuestPropSpec {
  /** `<kind>:<name>`, no dots */
  interactableId: string;
  anchorId: string;
  promptKey: string;
  /** enabled while this objective is current */
  objective: [questId: string, objectiveId: string];
  /** granted to the player on use (hand-in objectives take it back) */
  give?: { itemId: string; count: number };
  /** flag set on use; the prop is disabled once it is set (so a repeat use cannot count twice) */
  usedFlag?: string;
  /** also needs this to be enabled (an objective shared by two outcomes, for one) */
  when?: Condition;
  /** a greybox look the quests plugin draws at the anchor once the quest has begun */
  look?: PropLook;
  /** hide the look once `usedFlag` is set (a taken candle, a cleared heap) */
  hideWhenUsed?: boolean;
  /** draw the look only once `usedFlag` is set (a stake planted, not lying about) */
  lookOnlyUsed?: boolean;
  /** Wins focus over an NPC standing on the same spot (equal distance ties go to `npc:`); only while its objective is current. */
  priority?: number;
}

export interface QuestPropPorts {
  bus: BusPort;
  state: StatePort;
  quests: QuestReader & { isObjectiveCurrent(q: string, o: string): boolean };
  /** for `when`; absent means a spec with `when` is never enabled */
  env?(): ConditionEnv;
  anchor(id: string): Vec3Like | undefined;
  register(i: {
    id: string; kind: string; name: string; radius: number; promptKey: string; priority?: number;
    position(out: Vec3Like): Vec3Like; enabled(): boolean; onInteract(): void;
  }): () => void;
  warn?(m: string): void;
}

export class QuestProps {
  private readonly offs = new Map<string, () => void>();
  private readonly failed = new Set<string>();
  private disposed = false;

  constructor(private readonly specs: QuestPropSpec[], private readonly p: QuestPropPorts) {}

  /** Registers every prop whose quest has begun and whose anchor now exists. Cheap; call a few times a second. */
  update(): void {
    if (this.disposed) return;
    for (const s of this.specs) {
      if (this.offs.has(s.interactableId) || this.failed.has(s.interactableId)) continue;
      if (this.p.quests.state(s.objective[0]) === 'inactive') continue;
      const at = this.p.anchor(s.anchorId);
      if (!at) continue;
      const home = { x: at.x, y: at.y, z: at.z };
      const [kind, ...rest] = s.interactableId.split(':');
      try {
        this.offs.set(s.interactableId, this.p.register({
          id: s.interactableId, kind, name: rest.join(':'), radius: 2, promptKey: s.promptKey, ...(s.priority ? { priority: s.priority } : {}),
          position: (out) => { out.x = home.x; out.y = home.y; out.z = home.z; return out; },
          enabled: () => !this.disposed && this.p.quests.isObjectiveCurrent(s.objective[0], s.objective[1])
            && !(s.usedFlag && this.p.state.getFlag(s.usedFlag) === true) && this.whenHolds(s),
          onInteract: () => this.use(s),
        }));
      } catch (e) {
        // a duplicate id (another thread registered it) or a bad anchor: give up on this prop only, once
        this.failed.add(s.interactableId);
        this.p.warn?.(`props: could not register ${s.interactableId}: ${String(e)}`);
      }
    }
  }

  private whenHolds(s: QuestPropSpec): boolean {
    if (!s.when) return true;
    const env = this.p.env?.();
    if (!env) return false;
    try { return evalCondition(s.when, env); } catch { return false; }
  }

  /** Specs still waiting on an anchor (for tests and diagnostics). */
  pending(): string[] { return this.specs.filter((s) => !this.offs.has(s.interactableId)).map((s) => s.interactableId); }

  dispose(): void {
    this.disposed = true;
    for (const o of this.offs.values()) o();
    this.offs.clear();
  }

  private use(s: QuestPropSpec): void {
    if (this.disposed || !this.whenHolds(s)) return;
    if (s.usedFlag) {
      try { this.p.state.setFlag(s.usedFlag, true); } catch (e) { this.p.warn?.(`props: could not set ${s.usedFlag}: ${String(e)}`); }
    }
    if (s.give) this.p.bus.emit('loot.granted', { sourceId: s.interactableId, items: [s.give] });
  }
}
