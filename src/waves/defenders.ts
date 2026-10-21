import * as THREE from 'three';
import type { Actor, ActorId } from '../actors/Actor';
import { HurtboxSet } from '../combat/HurtboxSet';
import { KNIGHT_HURTBOX_DEFS } from '../combat/hurtboxLayout';
import type { HurtboxDef } from '../combat/types';
import type { GameContext } from '../core/Game';
import { EnemyAnimator } from '../enemies/EnemyAnimator';
import { ENEMY_CLIPS } from '../enemies/clips';
import { prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../npcs/types';
import type { Vec3 } from '../physics/PhysicsWorld';
import { DEFENDER } from './tuning';

export type DefenderHost = Pick<GameContext, 'scene' | 'actors' | 'combat' | 'damage' | 'events' | 'services'>;

export type DefenderAnim = 'idle' | 'swing' | 'down' | 'rise';

/** A militiaman's body behind a port, so tests need no model. */
export interface DefenderBody {
  root: THREE.Object3D;
  hurtboxDefs: HurtboxDef[];
  play(anim: DefenderAnim): void;
  /** One fixed tick of the animation. */
  update(dt: number): void;
  /** Called when a swing's clip ends (back to idle). */
  onSwingEnd: (() => void) | null;
  dispose(): void;
}

export type DefenderBodyFactory = () => DefenderBody;

const SWING_CLIP = '1H_Melee_Attack_Slice_Horizontal';

/** Osgar's militia wear the Knight rig, pulled toward leather brown, empty-handed (the NPC factory does both). */
const MILITIA_NPC: NpcDef = { id: 'militia', nameKey: 'waves.militia', model: 'knight', scale: 1, tint: 0x8a5a3a, dialogueId: '', idleClip: ENEMY_CLIPS.idle };

/** A capsule and a nose, for headless runs and before the Knight has loaded. */
function placeholderBody(): DefenderBody {
  const root = new THREE.Group();
  root.name = 'militia-placeholder';
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a });
  const geo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
  const body = new THREE.Mesh(geo, mat);
  body.name = 'militia-torso';
  body.position.y = 0.9;
  root.add(body);
  const self: DefenderBody = {
    root,
    hurtboxDefs: [{ name: 'torso', bone: 'militia-torso', start: { x: 0, y: -0.4, z: 0 }, end: { x: 0, y: 0.4, z: 0 }, radius: DEFENDER.hurtRadius }],
    play(a) {
      body.rotation.x = a === 'down' ? Math.PI / 2 : 0;
      body.position.y = a === 'down' ? 0.3 : 0.9;
    },
    update() {},
    onSwingEnd: null,
    dispose() {
      root.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
  return self;
}

function knightBody(loader: NpcModelLoader): DefenderBody {
  const { model, clips } = prepareNpcModel(loader, MILITIA_NPC);
  const root = new THREE.Group();
  root.name = 'militia';
  root.add(model);
  const animator = new EnemyAnimator(root, clips, { warn: (m) => console.warn(`[waves] ${m}`) });
  animator.play(ENEMY_CLIPS.idle, { loop: true, fade: 0 });
  const owned = new Set<THREE.Material>();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) owned.add(mm);
  });
  const self: DefenderBody = {
    root,
    hurtboxDefs: KNIGHT_HURTBOX_DEFS,
    play(a) {
      if (a === 'idle') animator.play(ENEMY_CLIPS.idle, { loop: true });
      else if (a === 'swing') animator.play(SWING_CLIP);
      else if (a === 'down') animator.play(ENEMY_CLIPS.death);
      else animator.play(ENEMY_CLIPS.rise);
    },
    update(dt) {
      animator.fixedUpdate(dt);
    },
    onSwingEnd: null,
    dispose() {
      animator.dispose();
      root.removeFromParent();
      // The cloned materials are ours (prepareNpcModel clones before tinting); the geometry is the loader's.
      owned.forEach((m) => m.dispose());
    },
  };
  animator.onClipEnd = (clip, interrupted) => {
    if (clip === SWING_CLIP && !interrupted) self.onSwingEnd?.();
  };
  return self;
}

/** The real factory: the Knight rig when the loader has it, else the placeholder. */
export function defenderBodyFactory(loader: NpcModelLoader | null): DefenderBodyFactory {
  return () => {
    if (loader) {
      try {
        return knightBody(loader);
      } catch {
        // not loaded (yet), or the clips are missing: stand in
      }
    }
    return placeholderBody();
  };
}

export type DefenderState = 'post' | 'down';

/** One militiaman: ally team, hurtboxes, a post. Lethal damage is caught by `Defenders`' handler and knocks him down. */
export class Defender {
  readonly actor: Actor;
  private readonly hurtboxes: HurtboxSet;
  private readonly body: DefenderBody;
  private readonly removers: Array<() => void> = [];
  private _state: DefenderState = 'post';
  private downLeft = 0;
  private cooldown = 0;
  private scan = 0;
  private rising = false;

  constructor(
    private readonly host: DefenderHost,
    makeBody: DefenderBodyFactory,
    readonly post: Vec3,
    readonly yaw: number,
  ) {
    this.body = makeBody();
    const root = this.body.root;
    host.scene.add(root);
    root.position.set(post.x, post.y, post.z);
    root.rotation.set(0, yaw, 0);
    root.updateMatrixWorld(true);
    let hurtboxes: HurtboxSet | null = null;
    let actor: Actor | null = null;
    try {
      hurtboxes = new HurtboxSet(root, this.body.hurtboxDefs, root);
      // Untargetable for AI and lock-on picks; a tracer that overlaps him still hits him.
      actor = host.actors.spawn({ kind: DEFENDER.kind, team: 'ally', maxHealth: DEFENDER.maxHealth, maxPoise: 0, root, owner: root, untargetable: true });
      actor.data['audio'] = { material: 'metal' };
      this.removers.push(host.combat.addTarget(hurtboxes, actor.id));
    } catch (err) {
      for (const r of this.removers.splice(0)) r();
      if (actor) host.actors.despawn(actor.id);
      hurtboxes?.dispose();
      this.body.dispose();
      throw err;
    }
    this.hurtboxes = hurtboxes;
    this.actor = actor;
    this.body.onSwingEnd = () => {
      if (this._state === 'post') this.body.play('idle');
    };
  }

  get state(): DefenderState {
    return this._state;
  }

  get id(): ActorId {
    return this.actor.id;
  }

  /** Lethal damage was caught: lie for `knockdownSeconds`, untouchable, then stand. */
  knockDown(): void {
    if (this._state === 'down') return;
    this._state = 'down';
    this.downLeft = DEFENDER.knockdownSeconds;
    this.rising = false;
    this.actor.hittable = false;
    this.body.play('down');
  }

  /** Full health, standing at the post (wave start, restart). */
  revive(): void {
    this._state = 'post';
    this.rising = false;
    this.downLeft = 0;
    this.cooldown = 0;
    if (this.actor.dead) this.host.damage.revive(this.actor.id, 1, 'script');
    this.actor.health = this.actor.maxHealth;
    this.actor.hittable = true;
    this.body.root.position.set(this.post.x, this.post.y, this.post.z);
    this.body.play('idle');
  }

  /** `now`: the swing tries to find a target this tick. */
  fixedUpdate(dt: number): void {
    this.body.update(dt);
    this.body.root.updateMatrixWorld(true);
    if (this._state === 'down') {
      this.downLeft -= dt;
      if (!this.rising && this.downLeft <= DEFENDER.riseSeconds) {
        this.rising = true;
        this.body.play('rise');
      }
      if (this.downLeft <= 0) this.revive();
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.scan -= dt;
    if (this.scan > 0 || this.cooldown > 0) return;
    this.scan = DEFENDER.scanSeconds;
    this.swing();
  }

  dispose(): void {
    for (const r of this.removers.splice(0)) {
      try {
        r();
      } catch {
        // gone with the actor
      }
    }
    this.host.actors.despawn(this.actor.id);
    this.hurtboxes.dispose();
    this.body.dispose();
  }

  /** Hits the nearest hostile in reach that is already fighting the player or an ally, never to the last health point. */
  private swing(): void {
    const engage = this.host.services.get('allyEngagement');
    if (!engage) return;
    const here = this.body.root.position;
    let best: Actor | null = null;
    let bestD: number = DEFENDER.swingRange;
    const p = new THREE.Vector3();
    for (const a of this.host.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.root) continue;
      a.root.getWorldPosition(p);
      const d = Math.hypot(p.x - here.x, p.z - here.z);
      if (d <= bestD && engage.mayEngage(a.id)) {
        best = a;
        bestD = d;
      }
    }
    if (!best) return;
    // Never the killing blow: credit, XP and mercy stay with the player.
    const amount = Math.min(DEFENDER.swingDamage, best.health - 1);
    if (!(amount > 0)) return;
    this.cooldown = DEFENDER.swingCooldown;
    this.body.play('swing');
    this.host.damage.apply({ attackerId: this.actor.id, targetId: best.id, amount, poise: 0, kind: 'melee', attackId: DEFENDER.swingAttackId });
  }
}

/** The militia of one set. The lethal handler exists only while they do. */
export class Defenders {
  private readonly list = new Map<ActorId, Defender>();
  private unhandle: (() => void) | null = null;
  private unhandleNoKill: (() => void) | null = null;

  constructor(
    private readonly host: DefenderHost,
    private readonly makeBody: DefenderBodyFactory,
  ) {}

  get all(): readonly Defender[] {
    return [...this.list.values()];
  }

  get count(): number {
    return this.list.size;
  }

  build(posts: readonly Vec3[], yaw: number): void {
    this.despawnAll();
    for (const post of posts) {
      try {
        const d = new Defender(this.host, this.makeBody, post, yaw);
        this.list.set(d.id, d);
      } catch (err) {
        console.warn(`[waves] could not build a militiaman: ${String(err)}`);
      }
    }
    if (this.list.size === 0) return;
    // Lethal damage never kills a militiaman: 1 HP, down for a while (`actor.saved` carries the handler id).
    this.unhandle = this.host.damage.addLethalHandler(DEFENDER.lethalHandlerId, (target) => {
      const d = this.list.get(target.id);
      if (!d) return false;
      target.health = Math.min(1, target.maxHealth);
      d.knockDown();
      return true;
    });
    // A modifier after the swing (a back-hit multiplier) can lift it past the cap, so the rule is enforced on resolve:
    // a militiaman's hit never kills, credit, XP and mercy stay with the player.
    this.unhandleNoKill = this.host.damage.addLethalHandler(
      DEFENDER.noKillHandlerId,
      (target, r) => {
        if (!r.attackerId || !this.list.has(r.attackerId) || this.list.has(target.id)) return false;
        target.health = Math.min(1, target.maxHealth);
        return true;
      },
      -1,
    );
  }

  /** Everyone stands at their post at full health. */
  reviveAll(): void {
    for (const d of this.list.values()) d.revive();
  }

  fixedUpdate(dt: number): void {
    for (const d of this.list.values()) d.fixedUpdate(dt);
  }

  despawnAll(): void {
    this.unhandle?.();
    this.unhandle = null;
    this.unhandleNoKill?.();
    this.unhandleNoKill = null;
    for (const d of this.list.values()) d.dispose();
    this.list.clear();
  }
}
