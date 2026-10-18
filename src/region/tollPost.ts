// The Hollin Ford toll-post (M04): a mortal structure actor on the scarecrow's pattern. Only heavy hits hurt it (a
// damage modifier turns any other attack into 'immune'), and it is neutral, so a kill pays no XP. Quests listen for
// `actor.died { kind: 'toll-post', spawnTag: 'ford.toll-post' }`; the broken state is the flag below.
import * as THREE from 'three';
import { HurtboxSet } from '../combat/HurtboxSet';
import type { HurtboxDef } from '../combat/types';
import type { ActorLike, Anchor, CoreContext } from './coreTypes';
import { greyMat } from './greybox';

export type TollPostDeps = Pick<CoreContext, 'scene' | 'actors' | 'combat' | 'events' | 'systems' | 'state' | 'damage'>;

export const TOLL_POST_KIND = 'toll-post';
export const TOLL_POST_SPAWN_TAG = 'ford.toll-post';
export const TOLL_POST_BROKEN_FLAG = 'place.hollin.toll-post.broken';
export const TOLL_POST_HEALTH = 120;
/** The attack ids that can hurt it: the heavy chop and the Surge. Light and stab swings bounce off. */
export const TOLL_POST_HEAVY_ATTACKS: readonly string[] = ['1H_Melee_Attack_Chop', 'heartshard-surge'];
export const COLLAPSE_SECONDS = 0.7;

export const TOLL_POST_DEFS: HurtboxDef[] = [
  { name: 'postL', bone: 'tp-post-l', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 2, z: 0 }, radius: 0.3 },
  { name: 'postR', bone: 'tp-post-r', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 2, z: 0 }, radius: 0.3 },
  { name: 'bar', bone: 'tp-bar', start: { x: -1.6, y: 0, z: 0 }, end: { x: 1.6, y: 0, z: 0 }, radius: 0.22 },
];

export interface TollPostHandle {
  /** Null once it is broken (the debris stays). */
  actor: ActorLike | null;
  root: THREE.Object3D;
  dispose(): void;
}

const box = (w: number, h: number, d: number, color: number): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), greyMat(color));
  m.position.y = h / 2;
  return m;
};

function buildMesh(): { root: THREE.Group; rig: THREE.Group; nodes: THREE.Object3D[] } {
  const root = new THREE.Group();
  root.name = 'toll-post';
  const rig = new THREE.Group();
  rig.name = 'tp-rig';
  const nodes: THREE.Object3D[] = [];
  // The barrier runs along local X (the road's direction is across it: the post stands on the bridge's east end).
  for (const [name, x] of [['tp-post-l', -1.7], ['tp-post-r', 1.7]] as const) {
    const n = new THREE.Group();
    n.name = name;
    n.position.x = x;
    n.add(box(0.4, 2.2, 0.4, 0x6b4a2b));
    rig.add(n);
    nodes.push(n);
  }
  const bar = new THREE.Group();
  bar.name = 'tp-bar';
  bar.position.y = 1.5;
  const plank = box(3.4, 0.2, 0.2, 0xb08d57);
  plank.position.y = 0;
  bar.add(plank);
  const stripe = box(0.5, 0.22, 0.22, 0xb02a2a);
  stripe.position.set(-1, 0, 0);
  bar.add(stripe);
  rig.add(bar);
  nodes.push(bar);
  root.add(rig);
  return { root, rig, nodes };
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}

/** The posts after a collapse: toppled, no actor, no hurtboxes. */
function topple(rig: THREE.Group, k: number): void {
  rig.rotation.z = (Math.PI / 2.6) * k * k;
  rig.position.y = -0.35 * k;
}

export function spawnTollPost(deps: TollPostDeps, anchor: Pick<Anchor, 'position' | 'yaw'>, opts: { broken?: boolean } = {}): TollPostHandle {
  const { root, rig } = buildMesh();
  root.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
  root.rotation.y = anchor.yaw ?? 0;
  deps.scene.add(root);
  root.updateMatrixWorld(true);

  if (opts.broken) {
    topple(rig, 1);
    let gone = false;
    return {
      actor: null,
      root,
      dispose() {
        if (gone) return;
        gone = true;
        root.removeFromParent();
        disposeTree(root);
      },
    };
  }

  const actor = deps.actors.spawn({ kind: TOLL_POST_KIND, team: 'neutral', maxHealth: TOLL_POST_HEALTH, hittable: true, root, owner: root, spawnTag: TOLL_POST_SPAWN_TAG });
  actor.data.audio = { material: 'wood' };
  let hurtboxes: HurtboxSet | null = null;
  let removeTarget: (() => void) | null = null;
  let removeModifier: (() => void) | null = null;
  let removeSystem: (() => void) | null = null;
  let offDied: (() => void) | null = null;
  let died = false;
  let disposed = false;
  let actorGone = false;

  const dropHurtboxes = (): void => {
    if (!hurtboxes) return;
    removeTarget?.();
    removeTarget = null;
    hurtboxes.dispose();
    hurtboxes = null;
  };
  const despawn = (): void => {
    if (actorGone) return;
    actorGone = true;
    deps.actors.despawn(actor.id);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    offDied?.();
    removeModifier?.();
    removeSystem?.();
    removeSystem = null;
    dropHurtboxes();
    despawn();
    root.removeFromParent();
    disposeTree(root);
  };

  try {
    // Band 10, before the player's own modifiers: anything but a heavy swing is dropped as 'immune'.
    removeModifier = deps.damage.addModifier(
      `toll-post-heavy-only:${actor.id}`,
      (req, target) => {
        if (target.id !== actor.id || req.outcome !== 'hit') return;
        if (req.attackId === undefined || !TOLL_POST_HEAVY_ATTACKS.includes(req.attackId)) req.outcome = 'immune';
      },
      10,
    );
    hurtboxes = new HurtboxSet(root, TOLL_POST_DEFS, root);
    removeTarget = deps.combat.addTarget(hurtboxes, actor.id);
    offDied = deps.events.on('actor.died', (p: { actorId?: string } | undefined) => {
      if (disposed || died || p?.actorId !== actor.id) return;
      died = true;
      deps.state.setFlag(TOLL_POST_BROKEN_FLAG, true);
      dropHurtboxes();
      removeModifier?.();
      removeModifier = null;
      let t = 0;
      removeSystem = deps.systems.add({
        id: `toll-post-collapse:${actor.id}`,
        fixedPhase: 'animation',
        order: 160,
        fixedUpdate(dt) {
          t = Math.min(COLLAPSE_SECONDS, t + dt);
          topple(rig, t / COLLAPSE_SECONDS);
          if (t >= COLLAPSE_SECONDS) {
            despawn();
            removeSystem?.();
            removeSystem = null;
          }
        },
      });
    });
  } catch (err) {
    dispose();
    throw err;
  }
  return { actor, root, dispose };
}
