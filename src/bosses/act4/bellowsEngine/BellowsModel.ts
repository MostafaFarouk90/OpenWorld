// The Bellows-Engine's procedural model (plans/act4-L6.md section 5): a riveted copper boiler on an iron turntable, a firebox
// with a glowing door, two piston arms with hammer heads, a head plate with three vent nozzles, a flywheel, two small gears and
// twin chimney stacks. No glb, so it is always ready. Plain colours only (nothing samples world position: the Crucible floats far
// from the origin). Glow is set on whatever material each glowing mesh carries at the time (the telegraph and hit-flash code
// clones materials), so it reaches the clones.
import * as THREE from 'three';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { HurtboxDef } from '../../../combat/types';
import { LOOK } from './tuning';

export const BOILER_BONE = 'bellows-boiler';
export const HEAD_BONE = 'bellows-head';
export const ARM_BONES = ['bellows-arm-l', 'bellows-arm-r'] as const;

export interface BellowsModel {
  /** Origin = the floor under the engine's centre; yaw 0 faces -Z. */
  readonly root: THREE.Group;
  /** The turning body (the turntable stays). */
  readonly body: THREE.Group;
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  /** 0..1: the pistons draw back (the punch telegraph). */
  setDraw(t: number): void;
  /** 0..1: the nozzles flare orange (the jet telegraph and the jet). */
  setFlash(t: number): void;
  /** The firebox door hangs open and glows hot (a vent). */
  setVented(v: boolean): void;
  /** The punch: the pistons slam out for a moment. */
  slam(): void;
  /** The body's yaw (radians, yaw 0 faces -Z). */
  readonly yaw: number;
  setYaw(yaw: number): void;
  /** The dead wreck: glow out, pistons slumped, the body tilted. */
  setWrecked(): void;
  setOpacity(o: number): void;
  /** World position of the nozzles (the jet origin). */
  nozzleWorld(out: THREE.Vector3): THREE.Vector3;
  update(dt: number): void;
  dispose(): void;
}

export function buildBellowsModel(): BellowsModel {
  const made: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(x: T): T => (made.push(x), x);
  const mat = (color: number, metal = 0.6, rough = 0.5, emissive = 0x000000): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive, emissiveIntensity: emissive ? 1 : 0 });
    mats.push(m);
    return m;
  };
  const iron = mat(LOOK.iron, 0.7, 0.55);
  const ironDark = mat(LOOK.ironDark, 0.6, 0.7);
  const copper = mat(LOOK.copper, 0.75, 0.35);
  const brass = mat(LOOK.brass, 0.8, 0.35);
  const mesh = (gm: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
    const me = new THREE.Mesh(gm, m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    return me;
  };

  const root = new THREE.Group();
  root.name = 'bellows-engine';
  // The turntable stays put; the body turns on it.
  const table = mesh(geo(new THREE.CylinderGeometry(3, 3.2, 0.5, 20)), ironDark, 0, 0.25, 0);
  root.add(table);
  const body = new THREE.Group();
  body.name = 'bellows-body';
  root.add(body);

  // Cradle and boiler (lying along Z).
  body.add(mesh(geo(new THREE.BoxGeometry(3.2, 0.7, 4.2)), iron, 0, 0.85, 0));
  const boiler = mesh(geo(new THREE.CylinderGeometry(1.35, 1.35, 3.4, 18)), copper, 0, 2.3, 0.2);
  boiler.rotation.x = Math.PI / 2;
  body.add(boiler);
  for (const z of [-1.3, 0.2, 1.7]) {
    const band = mesh(geo(new THREE.TorusGeometry(1.38, 0.08, 6, 20)), brass, 0, 2.3, z);
    body.add(band);
  }
  // Rivets as one instanced mesh along the bands.
  const rivetGeo = geo(new THREE.SphereGeometry(0.06, 5, 4));
  const rivets = new THREE.InstancedMesh(rivetGeo, brass, 3 * 16);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (const z of [-1.3, 0.2, 1.7]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * 1.45, 2.3 + Math.sin(a) * 1.45, z);
      rivets.setMatrixAt(k++, m4);
    }
  }
  rivets.instanceMatrix.needsUpdate = true;
  body.add(rivets);

  // Firebox at the back with its door (the vent window).
  body.add(mesh(geo(new THREE.BoxGeometry(2.2, 1.6, 1.2)), ironDark, 0, 1.4, 2.3));
  const fireMat = mat(0x2a1006, 0.1, 0.9, LOOK.glow);
  const fire = mesh(geo(new THREE.PlaneGeometry(1.2, 0.9)), fireMat, 0, 1.4, 2.91);
  body.add(fire);
  const door = new THREE.Group();
  door.position.set(-0.6, 1.4, 2.93);
  door.add(mesh(geo(new THREE.BoxGeometry(1.2, 0.9, 0.08)), iron, 0.6, 0, 0.04));
  body.add(door);

  // Chimney stacks.
  const stacks: THREE.Mesh[] = [];
  for (const x of [-0.7, 0.7]) {
    const s = mesh(geo(new THREE.CylinderGeometry(0.32, 0.38, 2.4, 10)), ironDark, x, 4.4, 1.6);
    stacks.push(s);
    body.add(s);
  }

  // Head plate with three nozzles (front, -Z).
  const head = mesh(geo(new THREE.BoxGeometry(2.4, 2.2, 0.5)), iron, 0, 2.3, -1.75);
  head.name = HEAD_BONE;
  body.add(head);
  const nozzleMat = mat(0x3a2418, 0.5, 0.5, LOOK.glow);
  const nozzleGeo = geo(new THREE.CylinderGeometry(0.18, 0.26, 0.6, 8));
  const nozzles = new THREE.Group();
  nozzles.position.set(0, 2.6, -2.1);
  for (const x of [-0.7, 0, 0.7]) {
    const n = mesh(nozzleGeo, nozzleMat, x, 0, 0);
    n.rotation.x = Math.PI / 2;
    nozzles.add(n);
  }
  body.add(nozzles);

  // Piston arms: a sleeve on each side, a rod and a hammer head that slide along -Z.
  const sleeveGeo = geo(new THREE.CylinderGeometry(0.42, 0.42, 1.6, 12));
  const rodGeo = geo(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 8));
  const hammerGeo = geo(new THREE.BoxGeometry(0.9, 0.9, 0.7));
  const arms: THREE.Group[] = [];
  ARM_BONES.forEach((name, i) => {
    const x = i === 0 ? -1.9 : 1.9;
    const sleeve = mesh(sleeveGeo, iron, x, 1.7, -0.9);
    sleeve.rotation.x = Math.PI / 2;
    body.add(sleeve);
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(x, 1.7, -1.7);
    const rod = mesh(rodGeo, brass, 0, 0, -0.5);
    rod.rotation.x = Math.PI / 2;
    arm.add(rod, mesh(hammerGeo, ironDark, 0, 0, -1.4));
    body.add(arm);
    arms.push(arm);
  });

  // Flywheel and gears on the right flank.
  const fly = new THREE.Group();
  fly.position.set(1.75, 2.0, 1.0);
  fly.rotation.y = Math.PI / 2;
  fly.add(mesh(geo(new THREE.TorusGeometry(1.0, 0.12, 6, 20)), iron));
  const spokeGeo = geo(new THREE.BoxGeometry(0.1, 1.9, 0.1));
  for (let i = 0; i < 3; i++) {
    const s = mesh(spokeGeo, iron);
    s.rotation.z = (i * Math.PI) / 3;
    fly.add(s);
  }
  body.add(fly);
  const gears: THREE.Mesh[] = [];
  const gearGeo = geo(new THREE.CylinderGeometry(0.45, 0.45, 0.16, 10));
  for (const [y, z] of [
    [3.1, -0.4],
    [1.2, 1.7],
  ] as const) {
    const gm = mesh(gearGeo, brass, -1.5, y, z);
    gm.rotation.z = Math.PI / 2;
    gears.push(gm);
    body.add(gm);
  }

  // Hurtboxes: the cradle, the boiler, the head and the two arms (plain Object3D bones).
  const boilerBone = new THREE.Object3D();
  boilerBone.name = BOILER_BONE;
  body.add(boilerBone);
  const defs: HurtboxDef[] = [
    // The turntable and cradle, low down where a blade swings (the boiler and head stand above a Knight's reach). Upright and
    // round, so the body's turn does not move it; its rim matches the turntable, just inside the static body.
    { name: 'cradle', bone: BOILER_BONE, start: { x: 0, y: 0.3, z: 0 }, end: { x: 0, y: 1.2, z: 0 }, radius: 3.0 },
    { name: 'boiler', bone: BOILER_BONE, start: { x: 0, y: 2.0, z: 2.4 }, end: { x: 0, y: 2.0, z: -1.2 }, radius: 1.6 },
    { name: 'head', bone: HEAD_BONE, start: { x: -0.8, y: 0, z: 0 }, end: { x: 0.8, y: 0, z: 0 }, radius: 1.1 },
    ...ARM_BONES.map((bone, i) => ({ name: `arm-${i}`, bone, start: { x: 0, y: 0, z: 0.6 }, end: { x: 0, y: 0, z: -1.4 }, radius: 0.6 })),
  ];
  root.updateMatrixWorld(true);
  const hurtboxes = new HurtboxSet(root, defs, body);

  let draw = 0;
  let flash = 0;
  let vented = false;
  let wrecked = false;
  let slamT = 0;
  let clock = 0;
  let opacity = 1;

  /** Glow on whatever material the mesh has now (a clone after a telegraph flash or a hit). */
  const setGlow = (m: THREE.Mesh, intensity: number, color: number): void => {
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of list) {
      const s = x as THREE.MeshStandardMaterial;
      if (!s.emissive) continue;
      s.emissive.setHex(color);
      s.emissiveIntensity = intensity;
    }
  };
  const applyGlow = (): void => {
    if (wrecked) {
      setGlow(fire, 0, 0x000000);
      for (const n of nozzles.children) setGlow(n as THREE.Mesh, 0, 0x000000);
      return;
    }
    setGlow(fire, vented ? 3 : 1 + 0.6 * Math.sin(clock * 3) ** 2, vented ? LOOK.glowHot : LOOK.glow);
    for (const n of nozzles.children) setGlow(n as THREE.Mesh, 0.2 + 2.6 * flash, flash > 0.5 ? LOOK.glowHot : LOOK.glow);
  };
  const layout = (): void => {
    const rest = wrecked ? 0.3 : 0;
    const slamOut = slamT > 0 ? Math.sin((slamT / 0.35) * Math.PI) * 1.1 : 0;
    const bob = wrecked || vented ? 0 : Math.sin(clock * 5) * 0.08;
    arms.forEach((a, i) => {
      a.position.z = -1.7 + draw * 0.9 - slamOut + (i === 0 ? bob : -bob);
      a.position.y = 1.7 - rest;
    });
    door.rotation.y = vented || wrecked ? -1.2 : 0;
  };
  applyGlow();
  layout();
  const nozzleAt = new THREE.Vector3();

  return {
    root,
    body,
    owner: body,
    hurtboxes,
    get yaw() {
      return body.rotation.y;
    },
    setYaw(yaw) {
      if (Number.isFinite(yaw)) body.rotation.y = yaw;
    },
    setDraw(t) {
      draw = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      layout();
    },
    setFlash(t) {
      flash = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      applyGlow();
    },
    setVented(v) {
      vented = !!v;
      applyGlow();
      layout();
    },
    slam() {
      slamT = 0.35;
      draw = 0;
      layout();
    },
    setWrecked() {
      wrecked = true;
      vented = false;
      flash = 0;
      draw = 0;
      body.rotation.z = 0.06;
      body.position.y = -0.15;
      applyGlow();
      layout();
    },
    setOpacity(o) {
      opacity = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      for (const m of mats) {
        const t = opacity < 1;
        if (m.transparent !== t) m.needsUpdate = true;
        m.transparent = t;
        m.opacity = opacity;
      }
    },
    nozzleWorld(out) {
      nozzles.updateWorldMatrix(true, false);
      return nozzles.getWorldPosition(out.copy(nozzleAt));
    },
    update(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      clock += dt;
      slamT = Math.max(0, slamT - dt);
      if (!wrecked) {
        const speed = vented ? 0.3 : 1.6;
        fly.rotation.x += dt * speed;
        gears[0].rotation.x += dt * speed * 2;
        gears[1].rotation.x -= dt * speed * 2;
        for (const s of stacks) s.scale.y = 1 + (vented ? 0 : 0.03 * Math.sin(clock * 6));
      }
      layout();
      applyGlow();
    },
    dispose() {
      hurtboxes.dispose();
      for (const x of made) x.dispose();
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
}
