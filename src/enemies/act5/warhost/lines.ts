// The Warhost's shield lines (plans/act5-N5.md section 3): one `ShieldLine` per line id (the spawner `tag`, shared across the
// spawners of a mixed line), members joined on spawn and removed on death, spare or despawn. A break kneels every staggered
// member through `Brain.offerYield()`, the shipped packmate rule.
import type { ActorId } from '../../ports';
import { ShieldLine } from '../../shieldLine';
import type { WarhostRole } from '../../types';

export interface LineMember {
  /** Kneel now (Spare open for a fresh window). Returns whether it is kneeling. */
  kneel(): boolean;
  readonly role: WarhostRole;
}

interface LineEntry {
  line: ShieldLine;
  members: Map<ActorId, LineMember>;
}

const LINES = new Map<string, LineEntry>();

/** One game clock for every line (seconds): members spawn at different times and sleep separately, so a member's own clock cannot time a window. Advanced by the creatures plugin's fixed system. */
let clock = 0;
export function tickLines(dt: number): void {
  clock += dt;
}
export function lineNow(): number {
  return clock;
}

function entry(lineId: string): LineEntry {
  let e = LINES.get(lineId);
  if (!e) LINES.set(lineId, (e = { line: new ShieldLine(lineId), members: new Map() }));
  return e;
}

export function joinLine(lineId: string, actorId: ActorId, member: LineMember): void {
  const e = entry(lineId);
  e.members.set(actorId, member);
  e.line.join(actorId, member.role);
}

export function leaveLine(lineId: string, actorId: ActorId): void {
  const e = LINES.get(lineId);
  if (!e) return;
  e.members.delete(actorId);
  e.line.leave(actorId);
  if (e.members.size === 0) LINES.delete(lineId);
}

/**
 * A member was staggered at `t` seconds. Kneels every member the line returns; returns their ids (empty when the line
 * did not break now). A broken line answers each later stagger with that member alone.
 */
export function lineStaggered(lineId: string, actorId: ActorId, t: number): { kneel: ActorId[]; brokeNow: boolean } {
  const e = LINES.get(lineId);
  if (!e) return { kneel: [], brokeNow: false };
  const was = e.line.broken;
  const ids = e.line.staggered(actorId, t);
  const kneel: ActorId[] = [];
  for (const id of ids) if (e.members.get(id)?.kneel()) kneel.push(id);
  return { kneel, brokeNow: !was && e.line.broken };
}

export function lineBroken(lineId: string): boolean {
  return LINES.get(lineId)?.line.broken ?? false;
}

export function lineSize(lineId: string): number {
  return LINES.get(lineId)?.line.size ?? 0;
}

/** Back to whole (a rest, a load). */
export function resetLines(): void {
  for (const e of LINES.values()) e.line.reset();
}

/** Tests. */
export function clearLines(): void {
  LINES.clear();
  clock = 0;
}
