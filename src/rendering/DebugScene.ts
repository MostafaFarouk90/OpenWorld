import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';

/**
 * Placeholder test level: flat ground plus boxes, slopes and stairs that exercise the character
 * controller's step, slope-climb and slide limits. Each piece gets a matching static collider.
 * Press F3 to overlay Rapier's collider wireframes.
 * Replaced by terrain, props and characters in later steps.
 */
export class DebugScene {
  /** Rapier's collider wireframes, toggled with F3. */
  private readonly debugLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true }),
  );

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
  ) {
    scene.background = new THREE.Color(0x87a9c9);
    scene.fog = new THREE.Fog(0x87a9c9, 50, 300);

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.8));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2);
    sun.position.set(20, 40, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
    scene.add(sun);

    // Ground at y = 0. Its collider is a flat heightfield: one huge cuboid lets the player sink
    // through when walking diagonally (see flatGround).
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x5c7a3a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    physics.addHeightfield(flatGround(200));

    // Boxes in a row at increasing heights: 0.2 m and 0.35 m auto-step (limit 0.4 m), the rest block.
    [0.2, 0.35, 0.6, 1.0, 2.0].forEach((h, i) => {
      this.box({ x: -8 + i * 3, y: h / 2, z: -8 }, { x: 1, y: h / 2, z: 1 }, 0x9c6b3c);
    });

    // Ramps: 20° walkable, 40° climbable, 55° steeper than maxSlopeClimbAngle (45°) so it blocks.
    [20, 40, 55].forEach((deg, i) => {
      this.ramp({ x: 8 + i * 5, z: 4 }, deg, 0x8a8f99);
    });

    // Stairs with 0.25 m risers, climbable through auto-step.
    for (let i = 0; i < 8; i++) {
      const h = 0.25 * (i + 1);
      this.box({ x: -10, y: h / 2, z: 6 + i * 0.5 }, { x: 1.5, y: h / 2, z: 0.25 }, 0xb39c7d);
    }

    this.debugLines.visible = false;
    this.debugLines.frustumCulled = false;
    scene.add(this.debugLines);
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.debugLines.geometry.dispose();
  }

  /** Refreshes the physics wireframe when it is visible. Call once per frame. */
  render(): void {
    if (!this.debugLines.visible) return;
    const { vertices, colors } = this.physics.world.debugRender();
    const geometry = this.debugLines.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (position && position.array.length === vertices.length) {
      // Same collider set as last frame: update in place instead of reallocating GPU buffers.
      (position.array as Float32Array).set(vertices);
      (geometry.getAttribute('color').array as Float32Array).set(colors);
      position.needsUpdate = true;
      geometry.getAttribute('color').needsUpdate = true;
    } else {
      // Collider count changed; dispose() frees the old GPU buffers before new attributes go in.
      geometry.dispose();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    this.debugLines.visible = !this.debugLines.visible;
  };

  private box(centre: Vec, half: Vec, color: number, rotation?: THREE.Quaternion): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(centre.x, centre.y, centre.z);
    if (rotation) mesh.quaternion.copy(rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const desc = this.physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(
      centre.x,
      centre.y,
      centre.z,
    );
    if (rotation) desc.setRotation(rotation);
    this.physics.addStaticCollider(desc);
  }

  /** A slab tilted `deg` degrees about X, rising towards -Z, with its low edge flush with the ground. */
  private ramp(at: { x: number; z: number }, deg: number, color: number): void {
    const angle = THREE.MathUtils.degToRad(deg);
    const half = { x: 1.5, y: 0.1, z: 4 };
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    // Place the slab so the low end of its top face touches y = 0 at z = at.z.
    const lowEdgeTop = new THREE.Vector3(0, half.y, half.z).applyQuaternion(rotation);
    this.box({ x: at.x, y: -lowEdgeTop.y, z: at.z - lowEdgeTop.z }, half, color, rotation);
  }
}

type Vec = { x: number; y: number; z: number };
