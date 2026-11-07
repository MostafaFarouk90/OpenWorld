// N3 dev rig (plans/act5-N3.md 1.7), dev builds only: `?lavarig` (with any start, e.g. `?act5=m48&new&lavarig`) builds
// a test set 15 m north of where the player stands once the ground is ready: a profiled channel with a wheel vent and
// a Surge crossing, a pool with rising lava, a breaking-floor patch and two turning platforms (8 and 14 m from a pivot)
// over a lava gap, on a test `bossArena` registration, with haze. Imported only behind `import.meta.env.DEV`, so a
// production build never contains it (lava.plugin.ts; the production-bundle test).
//
// Console (`__lavarig`): info(), set(piece, state), reset(), wheel(), goto(piece), gap(), haze().
import type RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { Vec3 } from '../../physics/PhysicsWorld';
import { heightAt } from '../../terrain/heightfield';
import { BreakingFloor, RisingLava, TurningPlatforms, kitSystem, type PlatformsLike } from '../arenaKit';
import { lavaMaterial, makeLavaUniforms } from './lavaMaterial';

export const RIG_ARENA = 'dev.lavarig';
const RIG_BOSS = 'dev-rig';

interface RigInfo {
  pieces: Record<string, Vec3>;
}

/** `now`: build at once (tests), instead of waiting for the ground round the player. */
export function installLavaRig(ctx: GameContext, opts: { now?: boolean } = {}): () => void {
  const offs: Array<() => void> = [];
  let built = false;
  let waited = 0;
  let gap = 0;
  const prevLocal = new Map<string, { x: number; z: number }>();
  const info: RigInfo = { pieces: {} };
  let platformsKit: TurningPlatforms | null = null;
  let slabs: { id: string; body: RAPIER.RigidBody; mesh: THREE.Object3D; r: number }[] = [];

  const g = (x: number, z: number): number => heightAt(x, z);
  const at = (x: number, z: number, dy = 0.05): Vec3 => ({ x, y: g(x, z) + dy, z });

  const build = (): void => {
    const lava = ctx.services.get('lava');
    const arenas = ctx.services.get('bossArena');
    const plats = ctx.services.get('platforms') as unknown as PlatformsLike | undefined;
    if (!lava) return console.warn('[lavarig] no lava service');
    const f = ctx.player.feet;
    const ox = f.x;
    const oz = f.z - 15; // 15 m ahead (yaw 0 faces -Z)

    // 1. A 30 m channel running east-west, 4.4 m wide, its surface 0.6 m over the ground (sloped with it).
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) pts.push([ox - 15 + i * 5, oz]);
    const lips: Vec3[] = [];
    for (let i = 0; i <= 6; i++) {
      lips.push(at(ox - 15 + i * 5, oz - 3.2), at(ox - 15 + i * 5, oz + 3.2));
    }
    offs.push(lava.add({ id: 'dev.channel', shape: { kind: 'ribbon', points: pts, halfWidth: 2.2 }, surfaceY: g(ox, oz) + 0.6, profile: pts.map(([x, z]) => g(x, z) + 0.6), damagePctPerS: 15, safeLips: lips }));
    info.pieces.channel = at(ox, oz + 4);
    // the vent: a 4 m crust across the channel at its middle; the wheel on the south bank
    offs.push(lava.addVent({ id: 'dev.vent', at: at(ox, oz), openS: 6, closedS: 10, wheel: 'dev.wheel', volumeId: 'dev.channel', crust: { kind: 'ribbon', points: [[ox - 2, oz], [ox + 2, oz]], halfWidth: 2.3 } }));
    offs.push(lava.registerWheel('dev.vent', at(ox + 3, oz + 3.6, 1)));
    info.pieces.wheel = at(ox + 3, oz + 4.2);
    // the crossing: 10 m east of the vent, lips 2.7 m either side (a 5.4 m span)
    offs.push(lava.addCrossing({ id: 'dev.crossing', from: at(ox + 10, oz + 2.7), to: at(ox + 10, oz - 2.7) }));
    info.pieces.crossing = at(ox + 10, oz + 2.7);
    const stakeMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
    for (const p of [at(ox + 10, oz + 2.7), at(ox + 10, oz - 2.7)]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2), stakeMat);
      s.position.set(p.x + 0.6, p.y + 0.6, p.z);
      ctx.scene.add(s);
      offs.push(() => s.removeFromParent());
    }

    // 2. A pool 20 m west with rising lava: low just over the ground, level:1 a metre higher.
    const px = ox - 28;
    const pz = oz;
    const gp = g(px, pz);
    const ring = (r: number, dy: number) => Array.from({ length: 8 }, (_, k) => at(px + r * Math.cos((k * Math.PI) / 4), pz + r * Math.sin((k * Math.PI) / 4), dy));
    offs.push(lava.add({ id: 'dev.pool', shape: { kind: 'circle', x: px, z: pz, r: 6 }, surfaceY: gp + 0.3, damagePctPerS: 15, safeLips: ring(7, 0.05) }));
    const rising = new RisingLava({ lava, volumeId: 'dev.pool', levels: { low: { y: gp + 0.3, lips: [...ring(7, 0.05), { x: px, y: gp + 0.85, z: pz }] }, 'level:1': { y: gp + 1.3, lips: ring(10, 0.05) } } });
    // an island at the pool's centre, dry at 'low' (its top 0.8 m up), flooded at 'level:1'
    const islandTop = gp + 0.8;
    const islandMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a3230 }));
    islandMesh.position.set(px, islandTop - 1, pz);
    ctx.scene.add(islandMesh);
    offs.push(() => islandMesh.removeFromParent());
    const islandCol = ctx.physics.addStaticCollider(ctx.physics.rapier.ColliderDesc.cuboid(1.2, 1, 1.2).setTranslation(px, islandTop - 1, pz));
    offs.push(() => ctx.physics.removeCollider(islandCol));
    info.pieces.pool = at(px + 8, pz);
    info.pieces.island = { x: px, y: islandTop + 0.05, z: pz };

    // 3. A breaking floor: two 3 x 3 m tiles a metre up, 12 m south-west.
    const fx = ox - 12;
    const fz = oz + 12;
    const tileMat = new THREE.MeshStandardMaterial({ color: 0x5a4a40 });
    const tiles = [0, 1].map((k) => {
      const x = fx + k * 3.2;
      const top = g(x, fz) + 1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 3), tileMat);
      mesh.position.set(x, top - 0.2, fz);
      ctx.scene.add(mesh);
      offs.push(() => mesh.removeFromParent());
      const col = ctx.physics.addStaticCollider(ctx.physics.rapier.ColliderDesc.cuboid(1.5, 0.2, 1.5).setTranslation(x, top - 0.2, fz));
      offs.push(() => ctx.physics.removeCollider(col));
      return { mesh, colliders: [col] };
    });
    const floor = new BreakingFloor({ tiles, warn: (m) => console.warn(`[lavarig] ${m}`) });
    info.pieces.floor = at(fx, fz + 2.5);

    // 4. Two turning platforms over a lava gap, 40 m east: a 16 m pool under a pivot, slabs at 8 and 14 m.
    const cx = ox + 40;
    const cz = oz;
    let top = -Infinity;
    for (let a = 0; a < 16; a++) for (const r of [0, 8, 14, 17]) top = Math.max(top, g(cx + r * Math.cos(a), cz + r * Math.sin(a)));
    const deck = top + 0.8;
    offs.push(lava.add({ id: 'dev.gap', shape: { kind: 'circle', x: cx, z: cz, r: 16.5 }, surfaceY: top + 0.1, damagePctPerS: 15, safeLips: Array.from({ length: 12 }, (_, k) => at(cx + 18 * Math.cos((k * Math.PI) / 6), cz + 18 * Math.sin((k * Math.PI) / 6))) }));
    const slabMat = lavaMaterial(makeLavaUniforms({ x: 0, z: 0 }, { swell: 0, cool: 1 }));
    if (plats && arenas) {
      slabs = [8, 14].map((r, k) => {
        const id = `dev.lavarig.ring.${k + 1}`;
        const body = ctx.physics.world.createRigidBody(ctx.physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, deck - 0.25, cz));
        const col = ctx.physics.world.createCollider(ctx.physics.rapier.ColliderDesc.cuboid(3, 0.25, 4).setTranslation(r, 0, 0), body);
        offs.push(() => {
          ctx.physics.world.removeCollider(col, false);
          ctx.physics.world.removeRigidBody(body);
        });
        const mesh = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 8), slabMat);
        slab.position.set(r, 0, 0);
        mesh.add(slab);
        mesh.position.set(cx, deck - 0.25, cz);
        ctx.scene.add(mesh);
        offs.push(() => mesh.removeFromParent());
        return { id, body, mesh, r };
      });
      platformsKit = new TurningPlatforms({ platforms: plats, pivot: { x: cx, y: deck, z: cz }, degPerS: 10, items: slabs, start: 'turning', warn: (m) => console.warn(`[lavarig] ${m}`) });
      offs.push(() => platformsKit?.dispose());
      offs.push(arenas.register(RIG_ARENA, { bossId: RIG_BOSS, pieces: { floor, platforms: platformsKit, lava: rising } }));
      offs.push(ctx.systems.add(kitSystem(RIG_ARENA, [floor, platformsKit, rising])));
      // a step up onto the near slab's path: a block on the west shore at deck height
      const stepX = cx - 17;
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), tileMat);
      stepMesh.position.set(stepX, deck - 0.5, cz);
      ctx.scene.add(stepMesh);
      offs.push(() => stepMesh.removeFromParent());
      const stepCol = ctx.physics.addStaticCollider(ctx.physics.rapier.ColliderDesc.cuboid(1, 0.5, 1).setTranslation(stepX, deck - 0.5, cz));
      offs.push(() => ctx.physics.removeCollider(stepCol));
      info.pieces.platforms = { x: cx + 8, y: deck + 0.05, z: cz };
      info.pieces.platformsFar = { x: cx + 14, y: deck + 0.05, z: cz };
    } else console.warn('[lavarig] no platforms or bossArena service: platforms and arena pieces skipped');
    offs.push(() => slabMat.dispose());
    built = true;
    console.info('[lavarig] built', JSON.stringify(info.pieces));
  };

  if (opts.now) build();
  offs.push(
    ctx.systems.add({
      id: 'caldera.lava.devRig',
      fixedPhase: 'late',
      fixedUpdate(dt) {
        if (built) return;
        waited += dt;
        const f = ctx.player.feet;
        if (waited > 2 && ctx.terrain.isResident(f.x, f.z - 15, 60)) {
          try {
            build();
          } catch (e) {
            built = true;
            console.warn('[lavarig] build failed', e);
          }
        }
      },
    }),
  );
  // the render gap: while the player stands still on a slab, how far their drawn feet move in the slab's drawn frame
  offs.push(
    ctx.systems.add({
      id: 'caldera.lava.devRig.gap',
      renderPhase: 'afterCamera',
      render() {
        if (!built || slabs.length === 0) return;
        const p = ctx.world.player.mesh.position;
        const still = !ctx.player.moving && ctx.world.player.controller.grounded;
        for (const s of slabs) {
          const a = -s.mesh.rotation.y;
          const dx = p.x - s.mesh.position.x;
          const dz = p.z - s.mesh.position.z;
          const lx = dx * Math.cos(a) + dz * Math.sin(a);
          const lz = -dx * Math.sin(a) + dz * Math.cos(a);
          const on = still && Math.abs(lx - s.r) < 3 && Math.abs(lz) < 4 && Math.abs(p.y - s.mesh.position.y - 0.25) < 0.3;
          const prev = prevLocal.get(s.id);
          if (on && prev) gap = Math.max(gap, Math.hypot(lx - prev.x, lz - prev.z));
          if (on) prevLocal.set(s.id, { x: lx, z: lz });
          else prevLocal.delete(s.id);
        }
      },
    }),
  );

  const api = {
    info: () => ({ built, ...info }),
    set: (piece: string, state: string) => ctx.services.get('bossArena')?.set(RIG_ARENA, piece, state) ?? false,
    reset: () => ctx.services.get('bossArena')?.reset(RIG_ARENA),
    wheel: () => ctx.services.get('lava')?.turnWheel('dev.vent'),
    goto: async (piece: string) => {
      const p = info.pieces[piece];
      if (!p) return `unknown piece; one of ${Object.keys(info.pieces).join(', ')}`;
      const ws = ctx.services.get('waystones');
      return ws ? (await ws.safeTeleport(p, 0)).ok : (ctx.player.teleport(p, 0), true);
    },
    gap: () => {
      const cm = gap * 100;
      gap = 0;
      return Math.round(cm * 100) / 100;
    },
    haze: () => ctx.services.get('heatHaze')?.stats() ?? null,
  };
  (globalThis as { __lavarig?: unknown }).__lavarig = api;
  offs.push(() => {
    delete (globalThis as { __lavarig?: unknown }).__lavarig;
  });
  return () => {
    for (const o of offs.splice(0).reverse()) {
      try {
        o();
      } catch (e) {
        console.warn('[lavarig] teardown step failed', e);
      }
    }
  };
}
