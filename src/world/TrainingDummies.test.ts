import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDummies } from './TrainingDummies';

const models = (n: number) => Array.from({ length: n }, () => new THREE.Object3D());

describe('TrainingDummies', () => {
  it('applies spots requested before the models exist once they arrive', () => {
    const d = new TrainingDummies(vi.fn());
    d.place([{ feet: { x: 1, y: 2, z: 3 }, yaw: 0.5 }]);
    const m = models(2);
    d.setModels(m);
    expect(m[0].position.toArray()).toEqual([1, 2, 3]);
    expect(m[0].rotation.y).toBe(0.5);
    expect(m[1].position.toArray()).toEqual([0, 0, 0]);
    expect(d.count).toBe(2);
  });

  it('moves existing models at once and ignores extra spots with a warning', () => {
    const warn = vi.fn();
    const d = new TrainingDummies(warn);
    const m = models(1);
    d.setModels(m);
    d.place([
      { feet: { x: 5, y: 0, z: 5 }, yaw: 1 },
      { feet: { x: 9, y: 0, z: 9 }, yaw: 0 },
    ]);
    expect(m[0].position.x).toBe(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('extra spots'));
  });

  it('drops invalid spots', () => {
    const warn = vi.fn();
    const d = new TrainingDummies(warn);
    const m = models(1);
    d.setModels(m);
    d.place([{ feet: { x: NaN, y: 0, z: 0 }, yaw: 0 }]);
    expect(m[0].position.x).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid spot'));
  });
});
