// Fog walls (design 5.9; data since contracts v0.6 item 4): ash-fall walls that stand until their condition opens
// them. The first is the slice gate across the Dead Road at x 1100 (`fog.harrowmark`); A1 adds the Act 2 faces. Each
// wall is the visible face where a road crosses a closed edge; the containment service does the holding elsewhere. The wall is a translucent mesh with drifting ash, one long collider across the valley, a push-back for anyone
// who gets past it and the trigger the HUD toasts on, all of which exist only while it stands. The state is derived
// through ctx.gates, so a loaded save applies it with no listener of our own.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d';
import { heightAt as terrainHeight } from '../terrain/heightfield';
import { flagConditionHolds, conditionKeys, type FlagCondition, type FlagReader } from '../core/flagCondition';
import type { CoreContext } from './coreTypes';

/**
 * The wall stands until M05 is complete (thread 6 writes `story.m05.complete`, and Phase A saves already carry it).
 */
export const FOG_OPEN_FLAGS: readonly string[] = ['story.m05.complete'];

/** Whether the slice wall (`fog.harrowmark`) is down for this state: the check for the map marker and the card. */
export function fogOpen(state: { getFlag(key: string): unknown }): boolean {
  return FOG_OPEN_FLAGS.some((k) => Boolean(state.getFlag(k)));
}
export const FOG_TRIGGER_ID = 'trg.fog.harrowmark';
export const FOG_WALL_HALF_LENGTH = 500;
const COLLIDER_HALF_THICKNESS = 1.5;
const COLLIDER_SAMPLE_STEP = 20;
const COLLIDER_BELOW = 6;
const COLLIDER_ABOVE = 30;
const VISIBLE_HALF_WIDTH = 40;
const WALL_HEIGHT = 30;
const ASH_COUNT = 400;
/** A player found this far past the wall while it stands is put back (design 5.9's push-back). */
export const PUSH_BACK_PAST = 2;
export const PUSH_BACK_TO = 4;

/**
 * A fog wall as data (v0.6). `axis` is the wall's normal: 'x' means the wall spans z and pushes on x. The blocked side
 * is the one `blockedSide` points to along that axis; the push-back sends the player toward the other side.
 */
export interface FogWallDef {
  id: string;
  /** The anchor the wall stands on (its position is the wall's centre). */
  anchorId: string;
  axis: 'x' | 'z';
  /** Half the wall's length along the other axis, in metres. */
  halfLength: number;
  blockedSide: 1 | -1;
  openWhen: FlagCondition;
  /** HUD toast on walking into the wall while it stands. */
  toastKey: string;
  /**
   * Metres before the wall a pushed-back player lands (default PUSH_BACK_TO). A1's Act 2 faces use 1, so the whole
   * move stays under the mount's 5 m ride break and a rider stays mounted.
   */
  pushBackTo?: number;
  /**
   * Beyond this distance (metres, from the wall's segment) the wall is hidden and its ash not animated; unset draws it
   * at every distance (the slice wall). The Act 2 faces stand far from the play area for most of the game.
   */
  cullBeyond?: number;
}

/** Horizontal distance from `feet` to the wall's segment (its line, clamped to its length). Pure. */
export function distanceToWall(def: FogWallDef, feet: { x: number; z: number }, wall: { x: number; z: number }): number {
  const n = def.axis === 'x' ? feet.x - wall.x : feet.z - wall.z;
  const t = def.axis === 'x' ? feet.z - wall.z : feet.x - wall.x;
  const over = Math.max(0, Math.abs(t) - def.halfLength);
  return Math.sqrt(n * n + over * over);
}

/** The slice wall, unchanged since v0.4: across the Dead Road, closed toward the east until M05. */
export const FOG_HARROWMARK: FogWallDef = {
  id: 'fog.harrowmark',
  anchorId: 'fog.harrowmark',
  axis: 'x',
  halfLength: FOG_WALL_HALF_LENGTH,
  blockedSide: 1,
  openWhen: { any: FOG_OPEN_FLAGS },
  toastKey: 'hud.fog.toast',
};

const walls = new Map<string, FogWallDef>([[FOG_HARROWMARK.id, FOG_HARROWMARK]]);

/** Adds a wall def (A1's Act 2 faces). Throws on a duplicate id; returns an undo. */
export function registerFogWall(def: FogWallDef): () => void {
  if (walls.has(def.id)) throw new Error(`fogWall: "${def.id}" is already registered`);
  walls.set(def.id, def);
  return () => {
    if (walls.get(def.id) === def) walls.delete(def.id);
  };
}

/** Every registered wall, the slice wall first. */
export function fogWalls(): readonly FogWallDef[] {
  return [...walls.values()];
}

/** The wall's trigger id: `trg.<wall id>` (so the slice wall keeps `trg.fog.harrowmark`). */
export function fogTriggerId(def: Pick<FogWallDef, 'id'>): string {
  return `trg.${def.id}`;
}

/** The wall whose trigger this is, or undefined. */
export function fogWallForTrigger(triggerId: string): FogWallDef | undefined {
  for (const def of walls.values()) if (fogTriggerId(def) === triggerId) return def;
  return undefined;
}

/** Whether the wall `id` is down for this state; an unknown id is never open. */
export function fogOpenById(id: string, state: FlagReader): boolean {
  const def = walls.get(id);
  return def ? flagConditionHolds(def.openWhen, state) : false;
}

export type FogWallDeps = Pick<CoreContext, 'scene' | 'physics' | 'gates' | 'triggers' | 'systems' | 'player'> & {
  rapier: Pick<typeof RAPIER, 'ColliderDesc'>;
};

export interface FogWallHandle {
  readonly standing: boolean;
  dispose(): void;
}

/** Engine (x, z) for a point `n` metres along the wall's normal and `t` along its length, from its centre. */
function toWorld(axis: 'x' | 'z', c: { x: number; z: number }, n: number, t: number): { x: number; z: number } {
  return axis === 'x' ? { x: c.x + n, z: c.z + t } : { x: c.x + t, z: c.z + n };
}

/**
 * The collider's vertical extent: from below the lowest ground along its whole length to well above the highest, so
 * no dip in the valley floor lets anyone walk under it. Pure.
 */
export function fogColliderExtent(
  heightAt: (x: number, z: number) => number,
  wall: { x: number; z: number },
  axis: 'x' | 'z' = 'x',
  halfLength = FOG_WALL_HALF_LENGTH,
): { bottom: number; top: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = -halfLength; t <= halfLength; t += COLLIDER_SAMPLE_STEP) {
    for (const n of [-COLLIDER_HALF_THICKNESS, 0, COLLIDER_HALF_THICKNESS]) {
      const p = toWorld(axis, wall, n, t);
      const h = heightAt(p.x, p.z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return { bottom: lo - COLLIDER_BELOW, top: hi + COLLIDER_ABOVE };
}

/** True when `x` is past the slice wall by enough to be pushed back. Pure. */
export function needsPushBack(playerX: number, wallX: number, playerZ = 0, wallZ = 0): boolean {
  return Number.isFinite(playerX) && Number.isFinite(playerZ) && playerX > wallX + PUSH_BACK_PAST && Math.abs(playerZ - wallZ) <= FOG_WALL_HALF_LENGTH;
}

/** True when `feet` is on the wall's blocked side by enough to be pushed back, within its length. Pure. */
export function needsPushBackDef(def: FogWallDef, feet: { x: number; z: number }, wall: { x: number; z: number }): boolean {
  if (!Number.isFinite(feet.x) || !Number.isFinite(feet.z)) return false;
  const n = def.axis === 'x' ? feet.x - wall.x : feet.z - wall.z;
  const t = def.axis === 'x' ? feet.z - wall.z : feet.x - wall.x;
  return n * def.blockedSide > PUSH_BACK_PAST && Math.abs(t) <= def.halfLength;
}

/** The slice wall at `wall` (v0.5 API); `openFlags` replaces its open flags (tests). */
export function buildFogWall(
  deps: FogWallDeps,
  wall: { x: number; z: number; y: number },
  openFlags: readonly string[] = FOG_OPEN_FLAGS,
  heightAt: (x: number, z: number) => number = terrainHeight,
): FogWallHandle {
  return buildFogWallDef(deps, { ...FOG_HARROWMARK, openWhen: { any: openFlags } }, wall, heightAt);
}

/**
 * Builds the wall `def` centred on `wall` (its anchor's position). It stands while `def.openWhen` does not hold,
 * derived through `ctx.gates`, so a loaded save applies it with no listener of our own.
 */
export function buildFogWallDef(
  deps: FogWallDeps,
  def: FogWallDef,
  wall: { x: number; z: number; y: number },
  heightAt: (x: number, z: number) => number = terrainHeight,
): FogWallHandle {
  let standing = false;
  let group: THREE.Group | null = null;
  let collider: ReturnType<FogWallDeps['physics']['addStaticCollider']> | null = null;
  let removeTrigger: (() => void) | null = null;
  let removeSystem: (() => void) | null = null;
  let ash: THREE.Points | null = null;
  const disposables: Array<{ dispose(): void }> = [];
  // Like containment, the Act 2 faces leave a player alone inside an interior, while a save loads and during waystone
  // travel (the slice wall keeps its v0.4 behaviour exactly).
  const services = (deps as { services?: { get(name: string): unknown } }).services;
  const exempt = (): boolean => {
    if (def.id === FOG_HARROWMARK.id || !services) return false;
    const busy = (name: string, key: string) => Boolean((services.get(name) as Record<string, unknown> | undefined)?.[key]);
    return busy('interiors', 'current') || busy('interiors', 'transitioning') || busy('save', 'loading') || busy('waystones', 'travelling');
  };

  const raise = (): void => {
    if (standing) return;
    standing = true;
    group = new THREE.Group();
    group.name = def.id === FOG_HARROWMARK.id ? 'fog-wall' : `fog-wall:${def.id}`;
    group.position.set(wall.x, wall.y, wall.z);
    const veilMat = new THREE.MeshBasicMaterial({ color: 0x8a8378, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const veilGeo = new THREE.PlaneGeometry(VISIBLE_HALF_WIDTH * 2, WALL_HEIGHT);
    const veil = new THREE.Mesh(veilGeo, veilMat);
    veil.rotation.y = def.axis === 'x' ? Math.PI / 2 : 0; // spans the wall's length, faces along its normal
    veil.position.y = WALL_HEIGHT / 2 - 2;
    veil.name = 'veil';
    group.add(veil);
    const pos = new Float32Array(ASH_COUNT * 3);
    for (let i = 0; i < ASH_COUNT; i++) {
      const p = toWorld(def.axis, { x: 0, z: 0 }, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * VISIBLE_HALF_WIDTH * 2);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = Math.random() * WALL_HEIGHT;
      pos[i * 3 + 2] = p.z;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ashMat = new THREE.PointsMaterial({ color: 0xcfc8bc, size: 0.5, transparent: true, opacity: 0.8, depthWrite: false });
    ash = new THREE.Points(ashGeo, ashMat);
    ash.frustumCulled = false;
    ash.name = 'ash';
    group.add(ash);
    disposables.push(veilGeo, veilMat, ashGeo, ashMat);
    deps.scene.add(group);

    // One long box across the valley, sunk below the lowest ground along it. Its ends are not cliffs, so the
    // push-back below is what holds anyone who walks round them.
    const ext = fogColliderExtent(heightAt, wall, def.axis, def.halfLength);
    const halfY = (ext.top - ext.bottom) / 2;
    const desc = (def.axis === 'x'
      ? deps.rapier.ColliderDesc.cuboid(COLLIDER_HALF_THICKNESS, halfY, def.halfLength)
      : deps.rapier.ColliderDesc.cuboid(def.halfLength, halfY, COLLIDER_HALF_THICKNESS)
    ).setTranslation(wall.x, (ext.top + ext.bottom) / 2, wall.z);
    collider = deps.physics.addStaticCollider(desc);

    // The trigger stands 12 m in front of the wall, on the open side.
    const front = toWorld(def.axis, wall, -12 * def.blockedSide, 0);
    removeTrigger = deps.triggers.add({
      id: fogTriggerId(def),
      who: 'player',
      shape: { type: 'sphere', center: { x: front.x, y: wall.y, z: front.z }, radius: 8 },
    });
    removeSystem = deps.systems.add({
      id: def.id === FOG_HARROWMARK.id ? 'fog-wall' : `fog-wall:${def.id}`,
      fixedPhase: 'intent',
      order: -80,
      fixedUpdate(dt) {
        const feet = deps.player.feet;
        if (needsPushBackDef(def, feet, wall) && !exempt()) {
          const to = def.pushBackTo ?? PUSH_BACK_TO;
          const back = def.axis === 'x' ? { x: wall.x - to * def.blockedSide, z: feet.z } : { x: feet.x, z: wall.z - to * def.blockedSide };
          deps.player.teleport({ x: back.x, y: Math.max(feet.y, heightAt(back.x, back.z)) + 0.1, z: back.z });
        }
        if (def.cullBeyond !== undefined && group) {
          group.visible = distanceToWall(def, feet, wall) <= def.cullBeyond;
          if (!group.visible) return;
        }
        if (ash) {
          const p = ash.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < ASH_COUNT; i++) {
            const y = p.getY(i) + dt * 1.2;
            p.setY(i, y > WALL_HEIGHT ? 0 : y);
          }
          p.needsUpdate = true;
        }
      },
    });
  };

  const lower = (): void => {
    if (!standing) return;
    standing = false;
    removeSystem?.();
    removeSystem = null;
    removeTrigger?.();
    removeTrigger = null;
    if (collider) deps.physics.removeCollider(collider);
    collider = null;
    disposables.splice(0).forEach((d) => d.dispose());
    group?.removeFromParent();
    group?.clear();
    group = null;
    ash = null;
  };

  const off = deps.gates.watch(
    (s) => flagConditionHolds(def.openWhen, s),
    (open) => (open ? lower() : raise()),
    { keys: conditionKeys(def.openWhen) },
  );
  return {
    get standing() {
      return standing;
    },
    dispose() {
      off();
      lower();
    },
  };
}
