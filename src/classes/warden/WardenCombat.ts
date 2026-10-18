import * as THREE from 'three';
import type { StatusSpec } from '../../actors/status';
import { COMBAT } from '../../config/constants';
import { actorsInCone, actorsInRadius } from '../../spells/areas';
import type { ActorId, ActorsLike, EventsLike, Vec3 } from '../../vfx/ports';
import {
  AXE_ATTACK_IDS,
  CLEAVE,
  CLEAVE_ATTACK_ID,
  DEEP_WOUND,
  EMBER_RAGE,
  SKILL_IDS,
  SURGE_AXE,
  WAR_HOWL,
  WARDEN_CLIPS,
} from './tuning';

/** What the Warden's passives need from the game; the plugin binds the real services (looked up at use time, so a late or absent one is fine). */
export interface WardenCombatPorts {
  events: EventsLike;
  actors: ActorsLike;
  damage: {
    apply(req: {
      attackerId: ActorId | null;
      targetId: ActorId;
      amount: number;
      poise: number;
      kind: 'melee';
      attackId: string;
      swingId?: number;
      direction?: THREE.Vector3;
    }): unknown;
    stagger(id: ActorId, byId: ActorId, poise: number): boolean;
  };
  /** Simulated seconds. */
  now(): number;
  feet(): Vec3;
  /** Yaw of the player's facing (the player looks along (-sin yaw, -cos yaw)). */
  facingYaw(): number;
  learned(skillId: string): boolean;
  status(): { apply(actorId: ActorId, spec: StatusSpec): boolean } | undefined;
  spells(): { restoreEmber?(n: number): void } | undefined;
  /** The player's current attack, from the animation controller. */
  attack(): { clip: string; swingId: number; active: boolean } | null;
  /** The player is dead or staggered: a swing in progress does not cleave. */
  interrupted(): boolean;
  reportTrigger(skillId: string): void;
  /** Visual hooks; optional. */
  fx?: { howl?(at: Vec3): void; cleave?(at: Vec3, yaw: number): void };
  warn(message: string): void;
}

interface Swing {
  id: number;
  /** Targets the blade struck, whatever came of it (they take no cleave extra). */
  hit: Set<ActorId>;
  sawActive: boolean;
}

/**
 * The Warden's passive skills and the burning axe: Cleaving Swing, Deep Wound, War Howl, Ember Rage and the 8 s axe ignite
 * of the Surge. Driven by `damage.dealt` and a per-tick `tick`; owns no persistent state (a load resets it).
 */
export class WardenCombat {
  private swing: Swing | null = null;
  private howlArmed = true; // reset() seeds it from the player's health
  private lastHowl = -Infinity;
  private lastRage = -Infinity;
  private igniteUntil = 0;
  private warned = new Set<string>();
  private readonly offs: Array<() => void> = [];

  constructor(private readonly p: WardenCombatPorts, private readonly playerId: () => ActorId) {
    this.offs.push(
      p.events.on('damage.dealt', (e) => this.onDamage(e)),
      p.events.on('actor.died', (e) => {
        if (e.actorId === this.playerId()) this.reset();
      }),
      p.events.on('save.loaded', () => this.reset()),
    );
  }

  get axeBurning(): boolean {
    return this.igniteUntil > 0;
  }

  dispose(): void {
    this.reset();
    for (const off of this.offs.splice(0).reverse()) off();
  }

  /** Forgets the swing, the howl state and the burning axe (a load, a death, a class change away). */
  reset(): void {
    this.swing = null;
    const me = this.p.actors.player;
    // Armed only from above 50% health: a load at 30% must not howl on the first hit (no downward crossing).
    this.howlArmed = me.maxHealth <= 0 || me.health / me.maxHealth >= WAR_HOWL.healthFraction;
    this.lastHowl = -Infinity;
    this.lastRage = -Infinity;
    this.endIgnite();
  }

  /** The Surge's Warm and Blaze forms: the axe burns for 8 s (a second Surge refreshes it). */
  igniteAxe(): void {
    this.igniteUntil = this.p.now() + SURGE_AXE.seconds;
    this.p.events.emit('buff.applied', { id: SURGE_AXE.buffId, nameKey: SURGE_AXE.nameKey, seconds: SURGE_AXE.seconds });
  }

  private endIgnite(): void {
    if (this.igniteUntil <= 0) return;
    this.igniteUntil = 0;
    this.p.events.emit('buff.removed', { id: SURGE_AXE.buffId });
  }

  /** Once per fixed tick. */
  tick(): void {
    const now = this.p.now();
    if (this.igniteUntil > 0 && now >= this.igniteUntil) this.endIgnite();
    const me = this.p.actors.player;
    if (!this.howlArmed && !me.dead && me.maxHealth > 0 && me.health / me.maxHealth >= WAR_HOWL.healthFraction) this.howlArmed = true;

    const a = this.p.attack();
    const cur = a && a.clip === WARDEN_CLIPS.slice ? a : null;
    if (this.swing && (!cur || cur.swingId !== this.swing.id || !cur.active)) {
      const done = this.swing;
      this.swing = null;
      if (done.sawActive && !this.p.interrupted()) this.cleave(done);
    }
    if (cur?.active) this.swingFor(cur.swingId).sawActive = true;
  }

  private swingFor(id: number): Swing {
    if (this.swing?.id !== id) this.swing = { id, hit: new Set(), sawActive: false };
    return this.swing;
  }

  /** Attack 1 at the end of its window: every hostile in the front arc the blade did not hit takes one hit like the blade's own. */
  private cleave(s: Swing): void {
    if (!this.p.learned(SKILL_IDS.cleavingSwing)) return;
    const feet = this.p.feet();
    const yaw = this.p.facingYaw();
    // The weapon's base: the blade's own result is already scaled by bone, back-hit and scarecrow modifiers that run again per target.
    const amount = COMBAT.baseDamage;
    const poise = amount;
    // actorsInCone looks along (sin, cos) of its yaw; the player looks along (-sin, -cos).
    for (const h of actorsInCone(this.p.actors, feet, yaw + Math.PI, CLEAVE.halfAngle, CLEAVE.rangeMetres, { team: 'hostile', alive: true })) {
      if (s.hit.has(h.actor.id)) continue;
      const dx = h.position.x - feet.x;
      const dz = h.position.z - feet.z;
      const d = Math.hypot(dx, dz) || 1;
      this.p.damage.apply({
        attackerId: this.playerId(),
        targetId: h.actor.id,
        amount,
        poise,
        kind: 'melee',
        attackId: CLEAVE_ATTACK_ID,
        swingId: s.id,
        direction: new THREE.Vector3(dx / d, 0, dz / d),
      });
    }
    this.p.fx?.cleave?.(feet, yaw);
  }

  private onDamage(e: {
    attackerId: ActorId | null;
    targetId: ActorId;
    kind: string;
    outcome: string;
    attackId?: string;
    swingId?: number;
    amount: number;
    poise: number;
    dealt: number;
    healthAfter: number;
  }): void {
    const me = this.playerId();
    // A slice the target blocked, parried or was immune to still counts as that target's hit of the swing (no second try by the cleave).
    if (e.attackerId === me && e.kind === 'melee' && e.attackId === WARDEN_CLIPS.slice && e.swingId !== undefined) this.swingFor(e.swingId).hit.add(e.targetId);
    if (e.attackerId === me && e.kind === 'melee' && e.outcome === 'hit' && e.attackId !== undefined && AXE_ATTACK_IDS.has(e.attackId)) {
      this.applyStatuses(e.targetId);
    }
    if (e.targetId === me && e.kind !== 'status' && e.outcome === 'hit') {
      this.emberRage(e.dealt);
      this.warHowl(e.healthAfter);
    }
  }

  private applyStatuses(targetId: ActorId): void {
    const wound = this.p.learned(SKILL_IDS.deepWound);
    const burning = this.axeBurning;
    if (!wound && !burning) return;
    const status = this.p.status();
    if (!status) {
      this.warnOnce('status', 'warden: the status service is missing, so Deep Wound and the burning axe apply nothing');
      return;
    }
    const sourceId = this.playerId();
    if (wound) status.apply(targetId, { id: DEEP_WOUND.id, kind: 'bleed', dps: DEEP_WOUND.dps, seconds: DEEP_WOUND.seconds, sourceId });
    if (burning) {
      const i = SURGE_AXE.ignite;
      status.apply(targetId, { id: i.id, kind: 'ignite', dps: i.dps, seconds: i.seconds, sourceId });
    }
  }

  private emberRage(dealt: number): void {
    if (!(dealt > 0) || !this.p.learned(SKILL_IDS.emberRage)) return;
    const now = this.p.now();
    if (now - this.lastRage < EMBER_RAGE.intervalSeconds) return;
    const spells = this.p.spells();
    if (!spells?.restoreEmber) {
      this.warnOnce('ember', 'warden: spells.restoreEmber is missing, so Ember Rage gives nothing');
      return;
    }
    this.lastRage = now;
    spells.restoreEmber(EMBER_RAGE.ember);
  }

  /** A downward crossing of 50% health fires the howl (30 s apart); going back above 50% re-arms it. */
  private warHowl(healthAfter: number): void {
    const me = this.p.actors.player;
    if (!this.howlArmed || !(healthAfter > 0) || me.maxHealth <= 0 || healthAfter / me.maxHealth >= WAR_HOWL.healthFraction) return;
    if (!this.p.learned(SKILL_IDS.warHowl)) return;
    this.howlArmed = false;
    const now = this.p.now();
    if (now - this.lastHowl < WAR_HOWL.cooldownSeconds) return;
    this.lastHowl = now;
    const feet = this.p.feet();
    for (const h of actorsInRadius(this.p.actors, feet, WAR_HOWL.range, { team: 'hostile', alive: true })) {
      this.p.damage.stagger(h.actor.id, this.playerId(), WAR_HOWL.poise);
    }
    this.p.fx?.howl?.(feet);
    this.p.reportTrigger(SKILL_IDS.warHowl);
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.p.warn(message);
  }
}
