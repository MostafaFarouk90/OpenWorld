import * as THREE from 'three';
import type { ActorId, InteractableLike, MercyEventLike } from './ports';
import { MERCY } from './tuning';
import type { EnemyDef, UnlockVerb } from './types';

/** What the mercy interactable needs to know about its enemy. */
export interface MercySubject {
  readonly actorId: ActorId;
  readonly def: EnemyDef;
  /** Interactable name part: `<kind>-<n>` (ids are `release:<name>`, name `[a-zA-Z0-9_-]+`). */
  readonly slug: string;
  feet(out: THREE.Vector3): THREE.Vector3;
  /** Staggered (Release) or yielding (Spare) right now. */
  mercyOpen(): boolean;
}

/** Interaction id for an enemy's mercy hold. */
export function mercyInteractableId(slug: string): string {
  return `release:${slug}`;
}

/** String key of the prompt: "Hold {key}: Release (10 Burn)" or "Hold {key}: Spare". */
export function mercyPromptKey(def: EnemyDef): string {
  if (def.mercy.verb === 'release') return 'enemies.mercy.release';
  return def.mercy.verb === 'calm' ? 'enemies.mercy.calm' : 'enemies.mercy.spare';
}

/** The verbs of the hold-T interactable built here; Calm's interactable is thread 1's. */
export type HoldVerb = 'release' | 'spare';

export function isHoldVerb(verb: EnemyDef['mercy']['verb']): verb is HoldVerb {
  return verb === 'release' || verb === 'spare';
}

/**
 * The hold-T mercy interactable (requests-round-1 item 8: `action: 'mercy'`, 3 m, 90 degree cone).
 * The core interaction system does the focus, hold and prompt; the lock-on target wins through
 * `priority`. Enabled only while that verb is unlocked and the enemy is open to it.
 */
export function makeMercyInteractable(
  subject: MercySubject,
  deps: {
    unlocked(verb: UnlockVerb): boolean;
    lockOnTarget(): ActorId | null;
    complete(subject: MercySubject): void;
  },
): InteractableLike {
  return {
    id: mercyInteractableId(subject.slug),
    kind: 'release',
    action: 'mercy',
    position: (out) => {
      // At the feet: the core measures 3D distance from the player's feet, so a raised point shrinks the radius.
      return subject.feet(out);
    },
    radius: MERCY.radius,
    coneDegrees: MERCY.coneDegrees,
    holdSeconds: MERCY.holdSeconds,
    promptKey: mercyPromptKey(subject.def),
    get priority() {
      return deps.lockOnTarget() === subject.actorId ? MERCY.lockOnPriority : 0;
    },
    enabled: () => deps.unlocked(subject.def.mercy.verb as HoldVerb) && subject.mercyOpen(),
    onInteract: () => {
      // The hold may complete on the tick the window closes; check again.
      if (!deps.unlocked(subject.def.mercy.verb as HoldVerb) || !subject.mercyOpen()) return;
      deps.complete(subject);
    },
  };
}

/**
 * Who a completed mercy hold covers. Spare covers the one enemy. Release is a 4 m pulse around the
 * initiator that takes every other mercy-open undead (same verb) as well.
 */
export function mercyTargets(initiator: MercySubject, all: Iterable<MercySubject>): MercySubject[] {
  if (initiator.def.mercy.verb !== 'release') return [initiator];
  const centre = initiator.feet(new THREE.Vector3());
  const p = new THREE.Vector3();
  const out = [initiator];
  for (const s of all) {
    if (s === initiator || s.def.mercy.verb !== 'release' || !s.mercyOpen()) continue;
    if (s.feet(p).distanceTo(centre) <= MERCY.pulseRadius) out.push(s);
  }
  return out;
}

let pulseCounter = 0;

export function nextPulseId(): string {
  return `pulse-${++pulseCounter}`;
}

/**
 * One `mercy` event per covered enemy; a Release pulse shares one `pulseId` (other consumers dedupe by
 * it; the Burn is charged once per hold by `EnemyManager`, not per event). `pulseId` lets a boss hold
 * put its own event into the same pulse.
 */
export function mercyEvents(targets: readonly MercySubject[], pulseId?: string): MercyEventLike[] {
  if (!targets.length) return [];
  const id = pulseId ?? (targets[0].def.mercy.verb === 'release' ? nextPulseId() : undefined);
  return targets.map((t) => ({
    verb: t.def.mercy.verb,
    tier: t.def.mercy.tier,
    track: t.def.mercy.track,
    creature: t.def.kind,
    actorId: t.actorId,
    ...(id ? { pulseId: id } : {}),
  }));
}

/** What the boss hold needs to know about the boss. */
export interface BossMercySubject {
  readonly bossId: string;
  readonly actorId: ActorId;
  feet(out: THREE.Vector3): THREE.Vector3;
}

/**
 * The hold-T interactable of a boss whose release window is open. Registered on `boss.releaseWindow`
 * and removed when the window closes, so `enabled` only has to check the verb is unlocked and the
 * registry still says the window is open.
 */
export function makeBossMercyInteractable(
  subject: BossMercySubject,
  deps: {
    unlocked(): boolean;
    windowOpen(): boolean;
    lockOnTarget(): ActorId | null;
    complete(subject: BossMercySubject): void;
  },
): InteractableLike {
  return {
    id: `release:boss-${subject.bossId}`,
    kind: 'release',
    action: 'mercy',
    position: (out) => subject.feet(out),
    radius: MERCY.radius,
    coneDegrees: MERCY.coneDegrees,
    holdSeconds: MERCY.holdSeconds,
    // Stop-gap until Interactable.promptParams (v0.5) lets one key carry the cost.
    promptKey: 'enemies.mercy.release.boss',
    get priority() {
      return deps.lockOnTarget() === subject.actorId ? MERCY.lockOnPriority : 0;
    },
    enabled: () => deps.unlocked() && deps.windowOpen(),
    onInteract: () => {
      if (!deps.unlocked() || !deps.windowOpen()) return;
      deps.complete(subject);
    },
  };
}
