// K10: the Act 3 damage bonuses in one place, so they add and then multiply once under one cap: shard-gems (matching
// class only), Frostbrow's Hunting Knife and its R15 hut upgrade, and the R16 keep bonus against dragonkin.
import type { Actor } from '../../actors/Actor';
import type { ModifiableRequest } from '../../actors/DamageResolver';
import type { ClassId } from '../../actors/classes';
import { PLAYER_ID } from '../../actors/teams';
import type { EquipSlot } from '../../hud/ports';
import type { SocketedShard } from '../shardGems';
import type { DamageHost } from '../combat';
import { ACT3_TRINKETS } from '../tier4/catalog';
import { knifeIsKeen } from '../tier4/knifeUpgrade';
import { shardGemDef } from './table';
import { SOCKET_TUNING } from './tuning';

export interface BonusPorts {
  equipped(slot: EquipSlot): string | null;
  has(itemId: string): boolean;
  socketsOf(itemId: string): SocketedShard[];
  classId(): ClassId;
  flag(key: string): unknown;
  /** The target's damage tags (its enemy def's `tags`); the request's own `tags` count too. */
  targetTags(target: Actor): readonly string[];
  /** Metres between two actors, or null when either has no root. */
  distance(a: Actor, b: Actor): number | null;
}

export const ACT3_OUT_MODIFIER = { id: 'gear.act3.out', order: -115 } as const;
export const ACT3_IN_MODIFIER = { id: 'gear.act3.in', order: 55 } as const;

const SLOTS: readonly EquipSlot[] = ['weapon', 'offhand', 'armour', 'trinket'];

/** Every active (matching-class) gem effect on the equipped pieces. */
function activeGems(p: BonusPorts) {
  const cls = p.classId();
  const out = [];
  for (const slot of SLOTS) {
    const id = p.equipped(slot);
    if (!id) continue;
    for (const s of p.socketsOf(id)) {
      const d = shardGemDef(s.shardId);
      if (d && d.classId === cls) out.push(d.effect);
    }
  }
  return out;
}

const half = (a: Actor): boolean => a.maxHealth > 0 && a.health < a.maxHealth / 2;

/** The summed outgoing bonus for this hit, capped at `outCap` (0.25 means x1.25). */
export function outgoingBonus(p: BonusPorts, req: Pick<ModifiableRequest, 'kind' | 'tags'>, target: Actor, attacker: Actor | null): number {
  let sum = 0;
  for (const e of activeGems(p)) {
    if (e.side !== 'out') continue;
    if (e.when === 'spell' && req.kind !== 'spell') continue;
    if (e.when === 'lowTarget' && !half(target)) continue;
    if (e.when === 'far') {
      const d = attacker ? p.distance(attacker, target) : null;
      if (d === null || d <= SOCKET_TUNING.farMetres) continue;
    }
    sum += e.bonus;
  }
  const trinket = p.equipped('trinket');
  if (trinket === ACT3_TRINKETS.knife) sum += knifeIsKeen(p) ? SOCKET_TUNING.knifeKeenBonus : SOCKET_TUNING.knifeBonus;
  else if (trinket === ACT3_TRINKETS.plainKnife) sum += SOCKET_TUNING.plainKnifeBonus;
  if (p.flag('story.r16.choice') === 'keep' && isDragonkin(p, req, target)) sum += SOCKET_TUNING.dragonkinBonus;
  return Math.min(SOCKET_TUNING.outCap, sum);
}

export function isDragonkin(p: BonusPorts, req: Pick<ModifiableRequest, 'tags'>, target: Actor): boolean {
  return (req.tags ?? []).includes('dragonkin') || p.targetTags(target).includes('dragonkin');
}

/** The summed reduction on a hit the player takes, capped at `inCap`. */
export function incomingReduction(p: BonusPorts, req: Pick<ModifiableRequest, 'outcome'>, self: Actor): number {
  let sum = 0;
  for (const e of activeGems(p)) {
    if (e.side !== 'in') continue;
    if (e.when === 'blocked' && req.outcome !== 'blocked') continue;
    if (e.when === 'lowSelf' && !half(self)) continue;
    sum += e.reduce;
  }
  if (p.equipped('trinket') === ACT3_TRINKETS.motherScale) sum += SOCKET_TUNING.motherScaleReduce;
  return Math.min(SOCKET_TUNING.inCap, sum);
}

/** Registers both modifiers (the player's own hits and hits on the player; never status ticks or falls). Returns the undo. */
export function registerAct3Bonuses(damage: DamageHost, ports: BonusPorts, playerId: string = PLAYER_ID): () => void {
  const offs = [
    damage.addModifier(
      ACT3_OUT_MODIFIER.id,
      (req, target, attacker) => {
        if (req.attackerId !== playerId || req.kind === 'status' || req.kind === 'fall') return;
        const b = outgoingBonus(ports, req, target, attacker);
        if (b > 0) req.amount *= 1 + b;
      },
      ACT3_OUT_MODIFIER.order,
    ),
    damage.addModifier(
      ACT3_IN_MODIFIER.id,
      (req, target) => {
        if (target.id !== playerId || req.kind === 'status' || req.kind === 'fall') return;
        const r = incomingReduction(ports, req, target);
        if (r > 0) req.amount *= 1 - r;
      },
      ACT3_IN_MODIFIER.order,
    ),
  ];
  return () => offs.forEach((off) => off());
}
