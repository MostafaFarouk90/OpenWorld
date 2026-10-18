import * as THREE from 'three';
import type { ActorId, InteractableLike, MercyEventLike } from './ports';
import { MERCY } from './tuning';
import type { EnemyDef } from './types';

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
  return def.mercy.verb === 'release' ? 'interact.release' : 'interact.spare';
}

/**
 * The hold-T mercy interactable (requests-round-1 item 8: `action: 'mercy'`, 3 m, 90 degree cone).
 * The core interaction system does the focus, hold and prompt; the lock-on target wins through
 * `priority`. Enabled only while that verb is unlocked and the enemy is open to it.
 */
export function makeMercyInteractable(
  subject: MercySubject,
  deps: {
    unlocked(verb: 'release' | 'spare'): boolean;
    lockOnTarget(): ActorId | null;
    complete(subject: MercySubject): void;
  },
): InteractableLike {
  return {
    id: mercyInteractableId(subject.slug),
    kind: 'release',
    action: 'mercy',
    position: (out) => {
      subject.feet(out);
      out.y += 1;
      return out;
    },
    radius: MERCY.radius,
    coneDegrees: MERCY.coneDegrees,
    holdSeconds: MERCY.holdSeconds,
    promptKey: mercyPromptKey(subject.def),
    get priority() {
      return deps.lockOnTarget() === subject.actorId ? MERCY.lockOnPriority : 0;
    },
    enabled: () => deps.unlocked(subject.def.mercy.verb) && subject.mercyOpen(),
    onInteract: () => {
      // The hold may complete on the tick the window closes; check again.
      if (!deps.unlocked(subject.def.mercy.verb) || !subject.mercyOpen()) return;
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

/** One `mercy` event per covered enemy; a Release pulse shares one `pulseId` so Burn is charged once. */
export function mercyEvents(targets: readonly MercySubject[]): MercyEventLike[] {
  if (!targets.length) return [];
  const pulseId = targets[0].def.mercy.verb === 'release' ? `pulse-${++pulseCounter}` : undefined;
  return targets.map((t) => ({
    verb: t.def.mercy.verb,
    tier: t.def.mercy.tier,
    track: t.def.mercy.track,
    creature: t.def.kind,
    actorId: t.actorId,
    ...(pulseId ? { pulseId } : {}),
  }));
}
