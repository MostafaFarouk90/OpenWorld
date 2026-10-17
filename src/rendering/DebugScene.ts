import * as THREE from 'three';

/**
 * Placeholder scene proving the render path and fixed-timestep interpolation.
 * Replaced by terrain, props and characters in later steps.
 */
export class DebugScene {
  private readonly cube: THREE.Mesh;
  private prevAngle = 0;
  private angle = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    scene.background = new THREE.Color(0x87a9c9);
    scene.fog = new THREE.Fog(0x87a9c9, 50, 300);

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.8));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2);
    sun.position.set(20, 40, 10);
    sun.castShadow = true;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x5c7a3a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x9c6b3c }),
    );
    this.cube.position.y = 0.5;
    this.cube.castShadow = true;
    scene.add(this.cube);

    camera.position.set(4, 3, 6);
    camera.lookAt(0, 0.5, 0);
  }

  fixedUpdate(dt: number): void {
    this.prevAngle = this.angle;
    this.angle += dt * Math.PI * 0.5;
  }

  render(alpha: number): void {
    this.cube.rotation.y = this.prevAngle + (this.angle - this.prevAngle) * alpha;
  }
}
