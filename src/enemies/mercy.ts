import * as THREE from 'three';
import type { ActorId, InteractableLike, MercyEventLike } from './ports';
import { MERCY } from './tuning';
import type { EnemyDef, MercyDef, UnlockVerb } from './types';

/** A def that has a mercy row (the watch guard has none and is never a mercy subject). */
export type MercyEnemyDef = EnemyDef & { mercy: MercyDef };

/** What the mercy interactable needs to know about its enemy. */
export interface MercySubject {
  readonly actorId: ActorId;
  readonly def: MercyEnemyDef;
  /** Interactable name part: `<kind>-<n>` (ids are `release:<name>`, name `[a-zA-Z0-9_-]+`). */
  readonly slug: string;
  feet(out: THREE.Vector3): THREE.Vector3;
  /** Staggered (Release) or yielding (Spare) right now. */
  mercyOpen(): boolean;
}

/** Interaction id of a boss's mercy hold. */
export function bossMercyInteractableId(bossId: string): string {
  return `release:boss-${bossId}`;
}

/** Interaction id for an enemy's mercy hold. */
export function mercyInteractableId(slug: string): string {
  return `release:${slug}`;
}

/** String key of the prompt: "Hold {key}: Release ({cost} Burn)", "Hold {key}: Calm ({offering})" or "Hold {key}: Spare". */
export function mercyPromptKey(def: MercyEnemyDef): string {
  if (def.mercy.verb === 'release') return 'enemies.mercy.release';
  if (def.mercy.verb === 'calm') return def.mercy.calmForm === 'layToRest' ? 'enemies.mercy.layToRest' : 'enemies.mercy.calm';
  return 'enemies.mercy.spare';
}

/** The verbs whose completion `completeMercy` handles by the shared pulse path (Calm has its own, `completeCalm`). */
export type HoldVerb = 'release' | 'spare';

export function isHoldVerb(verb: UnlockVerb): verb is HoldVerb {
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
    /** Calm only: the offering the prompt shows, or null when the player can pay nothing (no prompt). */
    calmLabel?(): string | null;
  },
): InteractableLike {
  const calm = subject.def.mercy.verb === 'calm';
  const open = () => deps.unlocked(subject.def.mercy.verb) && subject.mercyOpen() && (!calm || deps.calmLabel?.() != null);
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
    promptParams: () => mercyPromptParams(subject.def.mercy.verb, MERCY.releaseBurn, deps.calmLabel?.() ?? ''),
    enabled: open,
    onInteract: () => {
      // The hold may complete on the tick the window closes; check again.
      if (!open()) return;
      deps.complete(subject);
    },
  };
}

/** `{cost}` of a Release prompt and `{offering}` of a Calm prompt (the core's `promptParams`, v0.5). */
export function mercyPromptParams(verb: UnlockVerb, burn: number, offering: string): Record<string, string | number> {
  if (verb === 'release') return { cost: burn };
  return verb === 'calm' ? { offering } : {};
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

/** The prompt string of a boss hold: Release, Calm, or (v0.6, Redmane) Spare. */
export function bossMercyPromptKey(verb: UnlockVerb): string {
  return verb === 'calm' ? 'enemies.mercy.calm' : verb === 'spare' ? 'enemies.mercy.spare' : 'enemies.mercy.release';
}

/** What the boss hold needs to know about the boss. */
export interface BossMercySubject {
  readonly bossId: string;
  readonly actorId: ActorId;
  /** The verb of the hold ('release' for the Prior, 'calm' for Grimtooth) and its Burn cost. */
  readonly verb: UnlockVerb;
  readonly burn: number;
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
    /** Calm only: the offering the prompt shows, or null when the player can pay nothing (no prompt). */
    calmLabel?(): string | null;
  },
): InteractableLike {
  return {
    id: bossMercyInteractableId(subject.bossId),
    kind: 'release',
    action: 'mercy',
    position: (out) => subject.feet(out),
    radius: MERCY.radius,
    coneDegrees: MERCY.coneDegrees,
    holdSeconds: MERCY.holdSeconds,
    promptKey: bossMercyPromptKey(subject.verb),
    promptParams: () => mercyPromptParams(subject.verb, subject.burn, deps.calmLabel?.() ?? ''),
    get priority() {
      return deps.lockOnTarget() === subject.actorId ? MERCY.lockOnPriority : 0;
    },
    enabled: () => deps.unlocked() && deps.windowOpen() && (subject.verb !== 'calm' || deps.calmLabel?.() != null),
    onInteract: () => {
      if (!deps.unlocked() || !deps.windowOpen()) return;
      deps.complete(subject);
    },
  };
}
