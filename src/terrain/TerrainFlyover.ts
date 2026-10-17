import * as THREE from 'three';

/**
 * Placeholder camera that glides over the terrain so the dev server shows LOD streaming
 * before input and the player character exist (the ?scene=terrain demo). Replaced by the player camera later.
 */
export class TerrainFlyover {
  private prevTime = 0;
  private time = 0;
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly speed = 45,
    private readonly altitude = 70,
  ) {}

  fixedUpdate(dt: number): void {
    this.prevTime = this.time;
    this.time += dt;
  }

  render(alpha: number): void {
    const t = this.prevTime + (this.time - this.prevTime) * alpha;
    this.pathPoint(t, this.camera.position);
    this.pathPoint(t + 4, this.target);
    // Keep the camera clear of the ground ahead as well as below.
    const ground = Math.max(
      this.heightAt(this.camera.position.x, this.camera.position.z),
      this.heightAt(this.target.x, this.target.z),
    );
    this.camera.position.y = Math.max(this.camera.position.y, ground + this.altitude * 0.5);
    this.target.y = this.camera.position.y - this.altitude * 0.6;
    this.camera.lookAt(this.target);
  }

  /** A wandering loop around the origin, at a smoothed altitude above the terrain. */
  private pathPoint(t: number, out: THREE.Vector3): THREE.Vector3 {
    const baseRadius = 1400;
    const angle = (t * this.speed) / baseRadius;
    const radius = baseRadius + Math.sin(angle * 3) * 600;
    out.x = Math.cos(angle) * radius;
    out.z = Math.sin(angle) * radius;
    // Average a few samples so the camera does not follow every bump.
    let h = 0;
    for (const [ox, oz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]]) {
      h += this.heightAt(out.x + ox, out.z + oz);
    }
    out.y = h / 5 + this.altitude;
    return out;
  }
}
