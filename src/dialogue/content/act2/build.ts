// Authoring helper for the Act 2 Cinderreach trees: a tree is a set of named segments, each a run of lines; the
// builder turns them into DialogueNodes and the string table together so prose and wiring stay in one place.
// Node ids: the segment's first line is `<segment>`, line i (i >= 1) is `<segment>-<i+1>`. String keys follow the
// Act 1 pattern `dialogue.<treeId>.<nodeId>` and `<nodeKey>.<choiceId>` for a choice.
import type { Condition, DialogueChoice, DialogueDef, DialogueNode, Effect } from '../../../quests/types';

export interface ChoiceSpec {
  id: string;
  /** the player's line */
  t: string;
  /** segment to continue in, or null to end */
  go: string | null;
  when?: Condition;
  fx?: Effect[];
}

export interface Line {
  /** speaker: an npc id or 'cael' */
  s: string;
  /** text; {name} is the player's name */
  t: string;
  fx?: Effect[];
  /** at most 4; the line then ends the chain */
  choices?: ChoiceSpec[];
  when?: Condition;
}

export interface Segment {
  lines: Line[];
  /** segment to continue in after the last line (default: end). Ignored when the last line has choices. */
  then?: string | null;
}

export interface StartRule { when: Condition; seg: string }

export interface TreeSpec {
  id: string;
  /** first match wins; the last rule should be `{ all: [] }` */
  start: StartRule[];
  segments: Record<string, Segment>;
}

export interface BuiltTree {
  def: DialogueDef;
  strings: Record<string, string>;
}

const nodeId = (seg: string, i: number): string => (i === 0 ? seg : `${seg}-${i + 1}`);

export function buildTree(spec: TreeSpec): BuiltTree {
  const strings: Record<string, string> = {};
  const nodes: DialogueNode[] = [];
  for (const [seg, body] of Object.entries(spec.segments)) {
    if (body.lines.length === 0) throw new Error(`dialogue ${spec.id}: segment "${seg}" is empty`);
    body.lines.forEach((line, i) => {
      const id = nodeId(seg, i);
      const key = `dialogue.${spec.id}.${id}`;
      strings[key] = line.t;
      const node: DialogueNode = { id, speaker: line.s, textKey: key };
      if (line.fx) node.effects = line.fx;
      if (line.when) node.when = line.when;
      const last = i === body.lines.length - 1;
      if (line.choices) {
        node.choices = line.choices.map((c): DialogueChoice => {
          strings[`${key}.${c.id}`] = c.t;
          const out: DialogueChoice = { id: c.id, textKey: `${key}.${c.id}`, next: c.go };
          if (c.when) out.when = c.when;
          if (c.fx) out.effects = c.fx;
          return out;
        });
      } else if (!last) node.next = nodeId(seg, i + 1);
      else node.next = body.then ?? null;
      nodes.push(node);
    });
  }
  return {
    def: { id: spec.id, start: spec.start.map((r) => ({ when: r.when, node: r.seg })), nodes },
    strings,
  };
}

/**
 * Adds an Act 2 extension to an Act 1 tree without editing its file: the extension's start rules go first (the Act 2
 * states are checked before the Act 1 ones), its nodes follow the Act 1 nodes (extension node ids all start `a2-`).
 */
export function extendTree(base: DialogueDef, ext: BuiltTree): { def: DialogueDef; strings: Record<string, string> } {
  if (ext.def.id !== base.id) throw new Error(`extendTree: ${ext.def.id} does not extend ${base.id}`);
  const taken = new Set(base.nodes.map((n) => n.id));
  for (const n of ext.def.nodes) if (taken.has(n.id)) throw new Error(`extendTree: node id "${n.id}" already in ${base.id}`);
  const baseStart = typeof base.start === 'string' ? [{ when: { all: [] } as Condition, node: base.start }] : base.start;
  const extStart = typeof ext.def.start === 'string' ? [{ when: { all: [] } as Condition, node: ext.def.start }] : ext.def.start;
  return { def: { id: base.id, start: [...extStart, ...baseStart], nodes: [...base.nodes, ...ext.def.nodes] }, strings: ext.strings };
}
