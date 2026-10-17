// Stub. Rapier3D (@dimforge/rapier3d) world stepped once per fixed tick (FIXED_TIMESTEP).
// Terrain uses static heightfield colliders.
// Reference: Viridia's Rapier + Three.js WASM template.

export class PhysicsWorld {
  async init(): Promise<void> {}

  step(_dt: number): void {}
}
