// Where a companion waits instead of following (companions.md section 8, plans/slice-2-tobb-phase-b.md and its review).
// Waits are derived from quest objectives and the current interior only, never from flags or stealth/chase events, so a
// load re-derives them and a chase retry does not release him.
import type { Vec3 } from './FollowModel';

export type WaitReason = 'gate' | 'keep' | 'stealth' | 'chase' | 'party';

/**
 * A wait holds while its quest is active and `until` is not done, or while the player is inside `interior`, or (A5's
 * party rule, applied by the controller ahead of the def's own waits) while the companion is joined but not active.
 */
export type WaitRule =
  | { reason: WaitReason; anchorId: string; quest: string; until: string }
  | { reason: WaitReason; anchorId: string; interior: string }
  | { reason: 'party'; anchorId: string; inactive: true };

export interface WaitView {
  /** Quest state, or undefined when there is no quests service. */
  questState(questId: string): string | undefined;
  objectiveDone(questId: string, objectiveId: string): boolean;
  interior: string | null;
  /** True while the companion is joined but not in the party (A5); absent reads as active. */
  inactive?: boolean;
  /** False for an anchor no layout defines (the rule is skipped). */
  anchorExists(anchorId: string): boolean;
}

export interface Wait {
  reason: WaitReason;
  anchorId: string;
}

export function ruleHolds(rule: WaitRule, view: WaitView): boolean {
  if ('inactive' in rule) return view.inactive === true;
  if ('interior' in rule) return view.interior === rule.interior;
  return view.questState(rule.quest) === 'active' && !view.objectiveDone(rule.quest, rule.until);
}

/** The first rule (in priority order) that holds and whose anchor exists; null means follow. */
export function deriveWait(rules: readonly WaitRule[], view: WaitView): Wait | null {
  for (const r of rules) {
    if (ruleHolds(r, view) && view.anchorExists(r.anchorId)) return { reason: r.reason, anchorId: r.anchorId };
  }
  return null;
}

export const sameWait = (a: Wait | null, b: Wait | null): boolean =>
  a === b || (a !== null && b !== null && a.reason === b.reason && a.anchorId === b.anchorId);

/** What the player can see, for deciding whether a relocation would pop in view. */
export interface ViewPorts {
  player: Vec3;
  playerYaw: number;
  /** True when a camera exists and `p` (a chest point) is inside its frustum; undefined without a camera. */
  inFrustum?(p: Vec3): boolean | undefined;
  /** The interior containing `p`, or null outdoors; undefined when interiors are unknown (treated as the same space). */
  interiorAt?(p: Vec3): string | null | undefined;
  current: string | null;
}

export const VIEW_DISTANCE = 60;
/** Half-angle of the facing cone used when there is no camera. */
export const VIEW_HALF_ANGLE = (70 * Math.PI) / 180;

export function sameSpace(v: ViewPorts, p: Vec3): boolean {
  const at = v.interiorAt?.(p);
  return at === undefined ? true : at === v.current;
}

/** True when `p` could be on screen: same space, within 60 m, and in the camera frustum (or the facing cone). */
export function inView(v: ViewPorts, p: Vec3): boolean {
  if (!sameSpace(v, p)) return false;
  const dx = p.x - v.player.x;
  const dz = p.z - v.player.z;
  if (Math.hypot(dx, p.y - v.player.y, dz) > VIEW_DISTANCE) return false;
  const f = v.inFrustum?.({ x: p.x, y: p.y + 1.2, z: p.z });
  if (f !== undefined) return f;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  // Yaw 0 faces -Z: forward is (-sin yaw, -cos yaw).
  const cos = (dx * -Math.sin(v.playerYaw) + dz * -Math.cos(v.playerYaw)) / len;
  return cos >= Math.cos(VIEW_HALF_ANGLE);
}
