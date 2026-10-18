import type * as THREE from 'three';
import { FIXED_TIMESTEP, WORLD } from '../config/constants';
import type { InputSnapshot } from '../input/InputManager';
import type { PhysicsWorld, Vec3 } from '../physics/PhysicsWorld';
import { Player, type PlayerOptions } from '../characters/Player';
import type { KnightAvatar } from '../characters/KnightAvatar';
import type { Foot } from '../characters/knightClips';
import { heightAt as terrainHeightAt } from '../terrain/heightfield';
import { TerrainColliders } from './TerrainColliders';
import { WorldCombat } from './WorldCombat';

/** Where gameplay sounds go; the browser scene plays them through AudioManager. */
export interface WorldSounds {
  footstep(foot: Foot, position: Vec3): void;
  land(fallSpeed: number, position: Vec3): void;
  /** A sword hit landed at `position`. */
  hit?(position: Vec3, damage: number): void;
}

export interface WorldOptions {
  heightAt?: (x: number, z: number) => number;
  colliders?: TerrainColliders;
  sounds?: WorldSounds;
  /** Forwarded to the Player (the game core's move modifiers). */
  moveModifier?: PlayerOptions['moveModifier'];
}

/** Points in the fixed tick where the game core runs its system phases (contracts/game-events-and-flags.md §2). */
export interface WorldTickHooks {
  /** After the player avatar's fixed update, before combat tracing: enemy and NPC mixers. */
  beforeCombat?(): void;
}

/** Attack clip per input slot (InputSnapshot.attack 1-4): left mouse or key 1 is the horizontal slice. */
export const ATTACK_SLOTS: readonly string[] = [
  '1H_Melee_Attack_Slice_Horizontal',
  '1H_Melee_Attack_Slice_Diagonal',
  '1H_Melee_Attack_Chop',
  '1H_Melee_Attack_Stab',
];

/**
 * The open-world simulation without rendering: player on the streamed terrain colliders, the
 * avatar's animation and its sound events. The browser scene (startWorld) adds the renderer,
 * visual terrain, camera, audio and asset loading around it; tests drive it directly.
 *
 * Fixed tick order (contracts/animation-events.md): attack request, player move, collider
 * streaming, physics step, respawn check, then the avatar at the simulated pose.
 */
export class World {
  readonly player: Player;
  readonly colliders: TerrainColliders;
  readonly spawn: Vec3;
  /** Player sword against training dummies; runs after the avatar each tick. */
  readonly combat: WorldCombat;
  private _avatar: KnightAvatar | null = null;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  private readonly feet = { x: 0, y: 0, z: 0 };

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly options: WorldOptions = {},
  ) {
    const heightAt = options.heightAt ?? terrainHeightAt;
    this.spawn = { x: WORLD.spawnX, y: heightAt(WORLD.spawnX, WORLD.spawnZ), z: WORLD.spawnZ };
    this.colliders = options.colliders ?? new TerrainColliders(physics);
    // New colliders are only visible to the character controller after a step.
    this.colliders.update(this.spawn.x, this.spawn.z);
    physics.step();

    this.combat = new WorldCombat(scene, {
      hit: (position, damage) => options.sounds?.hit?.(position, damage),
    });
    this.player = new Player(scene, physics, this.spawn, {
      movementLocked: () => this._avatar?.controller.movementLocked ?? false,
      onRespawn: (at) => this.colliders.update(at.x, at.z),
      moveModifier: options.moveModifier,
    });
  }

  get avatar(): KnightAvatar | null {
    return this._avatar;
  }

  /** Swaps the placeholder capsule for the Knight and routes its footsteps to the sounds. */
  setAvatar(avatar: KnightAvatar): void {
    if (this._avatar) throw new Error('World: the avatar is already set');
    this._avatar = avatar;
    this.player.setAvatar(avatar.root);
    this.player.syncSimulatedPose();
    this.combat.attachPlayer(avatar);
    const sounds = this.options.sounds;
    if (!sounds) return;
    this.unsubscribe = avatar.events.subscribe((e) => {
      if (e.type === 'footstep') sounds.footstep(e.foot, this.simulatedFeet());
      else if (e.type === 'land') sounds.land(e.fallSpeed, this.simulatedFeet());
    });
  }

  /** `move` is the camera-relative input already rotated into world space. */
  fixedUpdate(input: InputSnapshot, move: { x: number; z: number }, hooks?: WorldTickHooks): void {
    const attack = this._avatar?.controller.attackClip(input.attack) ?? ATTACK_SLOTS[input.attack - 1];
    if (attack && this._avatar) this._avatar.controller.playAttack(attack);

    this.player.fixedUpdate(input, move.x, move.z);
    const t = this.player.controller.body.translation();
    this.colliders.update(t.x, t.z);
    this.physics.step();
    this.player.postStep();

    if (this._avatar) {
      this.player.syncSimulatedPose();
      this._avatar.fixedUpdate(this.player.locomotion());
    }
    hooks?.beforeCombat?.();
    if (this._avatar) this.combat.fixedUpdate(FIXED_TIMESTEP);
  }

  render(alpha: number, frameTime: number): void {
    this.player.render(alpha, frameTime);
  }

  /** Frees the avatar, colliders and player body. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.combat.dispose();
    this._avatar?.dispose();
    this.colliders.dispose();
    this.player.controller.dispose();
    this.player.mesh.removeFromParent();
  }

  private simulatedFeet(): Vec3 {
    return this.player.controller.interpolatedFeet(1, this.feet);
  }
}

