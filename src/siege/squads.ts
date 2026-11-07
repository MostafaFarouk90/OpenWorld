// Ally squads on the shipped defenders (plans/act5-N4.md section 5). Every member stands at a post; the brain is per squad:
// melee, pikes and sappers swing in reach (one candidate scan per squad per 0.25 s), archers loose a volley at foes in
// their field, healers mend Cael. Allies never die (the shipped lethal handler, the kneel rule).
import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import { mercyStateOf } from '../actors/DamageResolver';
import type { GameContext } from '../core/Game';
import type { Vec3 } from '../physics/PhysicsWorld';
import type { NpcDef, NpcModelLoader } from '../npcs/types';
import { ENEMY_CLIPS } from '../enemies/clips';
import { Defenders, KNEEL_CLEAR_RADIUS, npcDefenderBodyFactory, type DefenderBodyFactory } from '../waves/defenders';
import type { RosterSquad, SquadLook } from './roster';
import { ALLY_TAUNT_RADIUS, ROLE } from './tuning';
import { HARROWMARK_NPC_DEFS } from '../harrowmark/npcDefs';
import { ACT4_NPC_DEFS } from '../harrowmark/act4/npcDefs';
import { WASTE_A4_NPC_DEFS } from '../quests/content/act4/waste/npcs';
import { CINDERREACH_NPC_DEFS } from '../cinderreach/npcDefs';

export type SquadHost = Pick<GameContext, 'scene' | 'actors' | 'combat' | 'damage' | 'events' | 'services' | 'player'>;

const TINT: Record<Exclude<SquadLook, 'named'>, number> = {
  halvard: 0x8a2a24,
  grisel: 0x3f6b3a,
  watch: 0x6d6f73,
  ashwalker: 0x2a2622,
  steward: 0x7a6a3a,
};

const lookDef = (look: SquadLook): NpcDef => ({
  id: `siege-${look}`,
  nameKey: `siege.ally.${look}`,
  model: 'knight',
  scale: 1,
  tint: look === 'named' ? 0x8a5a3a : TINT[look],
  dialogueId: '',
  idleClip: ENEMY_CLIPS.idle,
});

const NAMED: readonly NpcDef[] = [...HARROWMARK_NPC_DEFS, ...ACT4_NPC_DEFS, ...WASTE_A4_NPC_DEFS, ...CINDERREACH_NPC_DEFS];

/** A named ally's own NPC def (Rook, Edric, Wulfhild, Wenna), without its dialogue; null when no def carries the id. */
export function namedDef(id: string): NpcDef | null {
  const d = NAMED.find((n) => n.id === id);
  return d ? { ...d, dialogueId: '' } : null;
}

/** Member posts: rows of four across the facing, 1.6 m apart, rows 1.8 m behind each other (yaw 0 faces -Z). */
export function formation(at: Vec3, yaw: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const bx = Math.sin(yaw);
  const bz = Math.cos(yaw);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4);
    const inRow = Math.min(4, n - row * 4);
    const col = (i % 4) - (inRow - 1) / 2;
    out.push({ x: at.x + rx * col * 1.6 + bx * row * 1.8, y: at.y, z: at.z + rz * col * 1.6 + bz * row * 1.8 });
  }
  return out;
}

export interface SquadScales {
  /** Every ally hit (the gong's rally boost). */
  damage(): number;
  /** The archers' volley (storm halves, `loose` doubles on its lane). */
  volley(squad: Squad, target: Actor): number;
}

export interface SquadOptions {
  squad: RosterSquad;
  siegeId: string;
  post: Vec3;
  yaw: number;
  loader: NpcModelLoader | null;
  castShadow: boolean;
  scales: SquadScales;
  /** Foes inside the archers' field (engine x, z). */
  inField(x: number, z: number): boolean;
  /** A siege foe (the current wave's members): archers shoot nothing else. */
  isFoe(id: string): boolean;
  /** A hostile (alive, no mercy state) within `r` of `at`: the kneel rule's test. */
  hostileWithin(at: Vec3, r: number): boolean;
  rng(): number;
}

/** One squad: a defenders set with its role's rule, plus the volley or the healing. */
export class Squad {
  readonly def: RosterSquad;
  readonly set: Defenders;
  private clock = 0;
  private readonly streaks: Array<{ line: THREE.Line; left: number }> = [];
  private readonly streakGeo: THREE.BufferGeometry[] = [];
  private readonly streakMat = new THREE.LineBasicMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0.8 });

  constructor(
    private readonly host: SquadHost,
    private readonly opts: SquadOptions,
  ) {
    const s = opts.squad;
    this.def = s;
    const rule = s.role === 'pikes' ? ROLE.pikes : s.duellist ? ROLE.duellist : s.role === 'sappers' ? ROLE.sappers : ROLE.melee;
    const swings = s.role === 'melee' || s.role === 'pikes' || s.role === 'sappers';
    this.set = new Defenders(host, this.bodyFor(lookDef(s.look)), {
      lethalHandlerId: `siege.${opts.siegeId}.${s.id}.floor`,
      noKillHandlerId: `siege.${opts.siegeId}.${s.id}.nokill`,
      kind: `siege-ally`,
      kneel: { clearRadius: KNEEL_CLEAR_RADIUS, hostileWithin: (at, r) => opts.hostileWithin(at, r) },
      swing: swings
        ? { range: rule.range, cooldown: rule.cooldown, hit: (t) => t.maxHealth * rule.hitPct * opts.scales.damage(), kills: true, attackId: `siege.${s.role}` }
        : { range: 0, cooldown: 1, hit: () => 0, kills: true },
      castShadow: s.wall ? opts.castShadow : true,
      ...(s.wall || !swings ? {} : { taunt: { radius: ALLY_TAUNT_RADIUS } }),
    });
    const posts = formation(opts.post, opts.yaw, s.members);
    const bodies = posts.map((_, i) => {
      const named = s.named?.[i];
      const d = named ? namedDef(named) : null;
      return d ? this.bodyFor(d) : undefined;
    });
    this.set.build(posts, opts.yaw, bodies);
  }

  private bodyFor(def: NpcDef): DefenderBodyFactory {
    return npcDefenderBodyFactory(this.opts.loader, def);
  }

  get standing(): number {
    return this.set.standing;
  }

  get kneeling(): number {
    return this.set.count - this.set.standing;
  }

  /** Full health at the posts (each wave start). */
  reviveAll(): void {
    this.set.reviveAll();
  }

  fixedUpdate(dt: number): void {
    this.set.fixedUpdate(dt);
    this.clock += dt;
    if (this.def.role === 'archers' && this.clock >= ROLE.archers.volleyS) {
      this.clock = 0;
      this.volley();
    } else if (this.def.role === 'healers' && this.clock >= ROLE.healers.everyS) {
      this.clock = 0;
      this.heal();
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.left -= dt;
      if (s.left <= 0) {
        s.line.removeFromParent();
        s.line.geometry.dispose();
        this.streaks.splice(i, 1);
      }
    }
  }

  /** One arrow per standing archer at a foe in the field (allies never pick a foe in a mercy state). */
  volley(): number {
    const engage = this.host.services.get('allyEngagement');
    const foes: { a: Actor; p: THREE.Vector3 }[] = [];
    const p = new THREE.Vector3();
    for (const a of this.host.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.root || !a.hittable) continue;
      if (!this.opts.isFoe(a.id) || mercyStateOf(a) !== 'none' || (engage && !engage.mayEngage(a.id))) continue;
      a.root.getWorldPosition(p);
      if (this.opts.inField(p.x, p.z)) foes.push({ a, p: p.clone() });
    }
    if (foes.length === 0) return 0;
    let shots = 0;
    for (const d of this.set.all) {
      if (d.state !== 'post') continue;
      const f = foes[Math.floor(this.opts.rng() * foes.length)];
      if (f.a.dead) continue;
      const amount = f.a.maxHealth * ROLE.archers.arrowPct * this.opts.scales.volley(this, f.a) * this.opts.scales.damage();
      if (!(amount > 0)) continue;
      this.host.damage.apply({ attackerId: d.id, targetId: f.a.id, amount, poise: 0, kind: 'melee', attackId: 'siege.arrow' });
      this.streak(d.position, f.p);
      shots++;
    }
    return shots;
  }

  /** Mends Cael within reach of a standing healer (kneeling allies rise by the shipped kneel rule, not the healers). */
  heal(): void {
    const feet = this.host.player.feet;
    const pl = this.host.player.actor;
    const near = this.set.all.some((d) => d.state === 'post' && Math.hypot(d.post.x - feet.x, d.post.z - feet.z) <= ROLE.healers.radius);
    if (near && !pl.dead && pl.health < pl.maxHealth) this.host.damage.heal(pl.id, pl.maxHealth * ROLE.healers.healPct);
  }

  private streak(from: Vec3, to: THREE.Vector3): void {
    if (this.streaks.length > 24) return;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y + 2.2, from.z), new THREE.Vector3(to.x, to.y + 1.2, to.z)]);
    const line = new THREE.Line(g, this.streakMat);
    line.name = 'siege-arrow';
    this.host.scene.add(line);
    this.streaks.push({ line, left: 0.18 });
  }

  dispose(): void {
    for (const s of this.streaks) {
      s.line.removeFromParent();
      s.line.geometry.dispose();
    }
    this.streaks.length = 0;
    for (const g of this.streakGeo) g.dispose();
    this.streakMat.dispose();
    this.set.despawnAll();
  }
}
