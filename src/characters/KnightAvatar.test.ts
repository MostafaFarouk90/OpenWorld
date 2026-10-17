import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KNIGHT } from '../config/constants';
import { KnightAvatar, type KnightAssetSource } from './KnightAvatar';
import { KNIGHT_ATTACKS, KNIGHT_BONES, KNIGHT_CLIPS } from './knightClips';

afterEach(() => vi.restoreAllMocks());

interface RigOptions {
  skinned?: boolean;
  hasSlotR?: boolean;
  embeddedSword?: boolean;
  idle?: boolean;
}

function makeRig(opts: RigOptions = {}) {
  const { skinned = true, hasSlotR = true, embeddedSword = true, idle = true } = opts;
  const model = new THREE.Group();
  const bone = (name: string, parent?: THREE.Object3D) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.y = 0.1;
    parent?.add(b);
    return b;
  };
  const root = bone('root');
  const hips = bone('hips', root);
  const spine = bone('spine', hips);
  const chest = bone('chest', spine);
  const head = bone('head', chest);
  head.position.y = 0.8;
  const chain = (side: 'l' | 'r', slot: boolean) => {
    const upper = bone(`upperarm${side}`, chest);
    const lower = bone(`lowerarm${side}`, upper);
    const wrist = bone(`wrist${side}`, lower);
    const hand = bone(`hand${side}`, wrist);
    return slot ? bone(`handslot${side}`, hand) : hand;
  };
  const slotL = chain('l', true);
  const slotR = chain('r', hasSlotR);
  const bones = [root, hips, spine, chest, head];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && !bones.includes(o as THREE.Bone)) bones.push(o as THREE.Bone);
  });

  const embeddedWeapon = (name: string, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshBasicMaterial());
    m.name = name;
    parent.add(m);
    return m;
  };
  const emb: Record<string, THREE.Mesh> = {};
  if (embeddedSword) emb.sword = embeddedWeapon('1H_Sword', slotR);
  emb.sword2 = embeddedWeapon('2H_Sword', slotR);
  emb.round = embeddedWeapon('Round_Shield', slotL);
  emb.badge = embeddedWeapon('Badge_Shield', slotL);
  if (emb.sword) {
    emb.sword.position.set(0.1, 0.2, 0.3);
    emb.sword.quaternion.setFromEuler(new THREE.Euler(0.4, 0.5, 0.6));
    emb.sword.scale.setScalar(1.1);
  }
  emb.round.position.set(-0.2, 0.1, 0.05);
  emb.round.quaternion.setFromEuler(new THREE.Euler(1, 0, 0.3));

  if (skinned) {
    const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(24 * 4).fill(0), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(24).fill([1, 0, 0, 0]).flat(), 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    mesh.add(root);
    model.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
  } else {
    model.add(root);
  }

  const clips = idle
    ? Object.values(KNIGHT_CLIPS).map(
        (name) => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.1, 0, 0, 0.2, 0])]),
      )
    : [new THREE.AnimationClip('Other', 1, [])];

  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1).translate(0, 0.7, 0), new THREE.MeshBasicMaterial());
  sword.add(blade);
  const shield = new THREE.Group();
  shield.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), new THREE.MeshBasicMaterial()));
  return { model, clips, sword, shield, emb, slotL, slotR, head, blade };
}

const quiet = { warn: () => {} };
const grounded = { grounded: true, horizontalSpeed: 0, verticalSpeed: 0 };

describe('KnightAvatar constructor', () => {
  it('turns the model to face -Z and scales it under root', () => {
    const rig = makeRig();
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet);
    expect(rig.model.parent).toBe(a.root);
    expect(a.model).toBe(rig.model);
    expect(rig.model.rotation.y).toBeCloseTo(Math.PI);
    expect(rig.model.scale.x).toBeCloseTo(KNIGHT.modelScale);
    expect(rig.model.scale.y).toBeCloseTo(KNIGHT.modelScale);
    expect(rig.model.scale.z).toBeCloseTo(KNIGHT.modelScale);
  });

  it('hides every embedded weapon when separate ones are given', () => {
    const rig = makeRig();
    new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet);
    for (const m of Object.values(rig.emb)) expect(m.visible).toBe(false);
  });

  it('mounts the sword and shield on the hand slots with the embedded poses', () => {
    const rig = makeRig();
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet);
    expect(a.weapon).toBe(rig.sword);
    expect(rig.sword.parent).toBe(rig.slotR);
    expect(rig.sword.position.toArray()).toEqual(rig.emb.sword.position.toArray());
    expect(rig.sword.quaternion.angleTo(rig.emb.sword.quaternion)).toBeCloseTo(0);
    expect(rig.sword.scale.toArray()).toEqual(rig.emb.sword.scale.toArray());
    expect(a.shield).toBe(rig.shield);
    expect(rig.shield.parent).toBe(rig.slotL);
    expect(rig.shield.position.toArray()).toEqual(rig.emb.round.position.toArray());
    expect(rig.shield.quaternion.angleTo(rig.emb.round.quaternion)).toBeCloseTo(0);
  });

  it('puts the hilt at the grip and the tip at the top of the blade', () => {
    const rig = makeRig();
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet);
    expect(a.weaponHilt.parent).toBe(a.weapon);
    expect(a.weaponTip.parent).toBe(a.weapon);
    expect(a.weaponHilt.position.length()).toBe(0);
    expect(a.weaponTip.position.y).toBeCloseTo(1.4);
    expect(a.weaponTip.position.x).toBe(0);
  });

  it('enables castShadow on meshes, including the mounted weapons', () => {
    const rig = makeRig();
    new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet);
    expect(rig.blade.castShadow).toBe(true);
    rig.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) expect(o.castShadow).toBe(true);
    });
  });

  it('uses the embedded sword and shield when none are given', () => {
    const rig = makeRig();
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: null, shield: null }, quiet);
    expect(a.weapon).toBe(rig.emb.sword);
    expect(a.weapon.visible).toBe(true);
    expect(a.shield).toBe(rig.emb.round);
    expect(a.shield.visible).toBe(true);
    expect(rig.emb.sword2.visible).toBe(false);
    expect(rig.emb.badge.visible).toBe(false);
  });

  it('falls back per item: separate sword with embedded shield', () => {
    const rig = makeRig();
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: null }, quiet);
    expect(a.weapon).toBe(rig.sword);
    expect(a.shield).toBe(rig.emb.round);
    expect(rig.emb.sword.visible).toBe(false);
  });

  it('throws mentioning the sword when none is available', () => {
    const rig = makeRig({ embeddedSword: false });
    expect(() => new KnightAvatar({ model: rig.model, clips: rig.clips, sword: null, shield: null }, quiet)).toThrow(/sword/);
  });

  it('mounts a separate sword even when the model embeds none', () => {
    const rig = makeRig({ embeddedSword: false });
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: null }, quiet);
    expect(a.weapon).toBe(rig.sword);
    expect(rig.sword.position.length()).toBe(0);
  });

  it('throws mentioning handslotr when the bone is missing', () => {
    const rig = makeRig({ hasSlotR: false });
    expect(() => new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet)).toThrow(/handslotr/);
  });

  it('throws mentioning the skinned mesh when the model has none', () => {
    const rig = makeRig({ skinned: false });
    expect(() => new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet)).toThrow(/skinned mesh/);
  });

  it('throws mentioning Idle when the clip is missing', () => {
    const rig = makeRig({ idle: false });
    expect(() => new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet)).toThrow(/Idle/);
  });
});

describe('KnightAvatar bones, update and dispose', () => {
  const build = () => {
    const rig = makeRig();
    const a = new KnightAvatar({ model: rig.model, clips: rig.clips, sword: rig.sword, shield: rig.shield }, quiet);
    return { rig, a };
  };

  it('bone() returns bones and throws with the name for unknown ones', () => {
    const { rig, a } = build();
    expect(a.bone('head')).toBe(rig.head);
    expect(a.bone('handslotr')).toBe(rig.slotR);
    expect(() => a.bone('tail')).toThrow(/tail/);
  });

  it('fixedUpdate advances the mixer by one fixed tick', () => {
    const { a } = build();
    expect(a.controller.mixer.time).toBe(0);
    a.fixedUpdate(grounded);
    expect(a.controller.mixer.time).toBeCloseTo(1 / 60);
    a.fixedUpdate(grounded);
    expect(a.controller.mixer.time).toBeCloseTo(2 / 60);
  });

  it('dispose removes the root from its parent and stops the mixer', () => {
    const { a } = build();
    const parent = new THREE.Group();
    parent.add(a.root);
    a.fixedUpdate(grounded);
    expect((a.controller.mixer as any)._nActiveActions).toBeGreaterThan(0);
    a.dispose();
    expect(a.root.parent).toBeNull();
    expect(parent.children).not.toContain(a.root);
    expect((a.controller.mixer as any)._nActiveActions).toBe(0);
  });

  it('dispose works without a parent and twice', () => {
    const { a } = build();
    expect(() => {
      a.dispose();
      a.dispose();
    }).not.toThrow();
  });
});

describe('KnightAvatar.load', () => {
  const makeSource = (failures: Partial<Record<'knight' | 'sword' | 'shieldRound', Error>> = {}) => {
    const rig = makeRig();
    const source: KnightAssetSource = {
      load: async (id) => {
        if (failures[id]) throw failures[id];
        return {};
      },
      instantiate: (id) => (id === 'knight' ? rig.model : id === 'sword' ? rig.sword : rig.shield),
      animations: () => rig.clips,
    };
    return { rig, source };
  };

  it('mounts the loaded sword and shield', async () => {
    const { rig, source } = makeSource();
    const warn = vi.fn();
    const a = await KnightAvatar.load(source, { warn });
    expect(a.weapon).toBe(rig.sword);
    expect(a.shield).toBe(rig.shield);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects with the asset id and URL when the knight fails', async () => {
    const msg = 'AssetLoader: failed to load "knight" from /assets/x/Knight.glb: 404';
    const { source } = makeSource({ knight: new Error(msg) });
    const err = await KnightAvatar.load(source, quiet).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('knight');
    expect(err!.message).toContain('/assets/x/Knight.glb');
  });

  it('falls back to the embedded sword with one warning when the sword fails', async () => {
    const { rig, source } = makeSource({ sword: new Error('sword gone: 500') });
    const warn = vi.fn();
    const a = await KnightAvatar.load(source, { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('sword gone: 500');
    expect(a.weapon).toBe(rig.emb.sword);
    expect(a.weapon.name).toBe('1H_Sword');
    expect(a.weapon.visible).toBe(true);
    expect(a.shield).toBe(rig.shield);
  });

  it('falls back to the embedded shield when only the shield fails', async () => {
    const { rig, source } = makeSource({ shieldRound: new Error('shield gone') });
    const warn = vi.fn();
    const a = await KnightAvatar.load(source, { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(a.shield).toBe(rig.emb.round);
    expect(a.weapon).toBe(rig.sword);
  });

  it('warns twice and shows both embedded weapons when both fail', async () => {
    const { rig, source } = makeSource({ sword: new Error('no sword'), shieldRound: new Error('no shield') });
    const warn = vi.fn();
    const a = await KnightAvatar.load(source, { warn });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(a.weapon).toBe(rig.emb.sword);
    expect(a.shield).toBe(rig.emb.round);
    expect(rig.emb.sword.visible && rig.emb.round.visible).toBe(true);
  });

  it('stringifies non-Error rejections in the warning', async () => {
    const { source } = makeSource();
    source.load = async (id) => {
      if (id === 'sword') throw 'plain string';
      return {};
    };
    const warn = vi.fn();
    await KnightAvatar.load(source, { warn });
    expect(warn.mock.calls[0][0]).toContain('plain string');
  });

  it('defaults to console.warn when no warn option is given', async () => {
    const { source } = makeSource({ sword: new Error('boom') });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await KnightAvatar.load(source);
    expect(spy).toHaveBeenCalled();
  });
});

describe('KnightAvatar with the real Knight.glb', () => {
  it('resolves bones, clips, the embedded sword and a plausible head height', async () => {
    (globalThis as any).self ??= globalThis;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The project has no Node typings, so load fs through an untyped dynamic import.
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: string) => Uint8Array & { buffer: ArrayBuffer; byteOffset: number; byteLength: number } };
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf = await new Promise<any>((resolve, reject) =>
      new GLTFLoader().parse(buf, '', resolve, reject),
    );

    const avatar = new KnightAvatar({ model: gltf.scene, clips: gltf.animations, sword: null, shield: null }, quiet);
    for (const name of KNIGHT_BONES) expect(avatar.bone(name).name).toBe(name);

    const names = gltf.animations.map((c: THREE.AnimationClip) => c.name);
    for (const clip of Object.values(KNIGHT_CLIPS)) expect(names).toContain(clip);
    for (const def of KNIGHT_ATTACKS) expect(names).toContain(def.clip);

    expect(avatar.weapon.name).toBe('1H_Sword');

    avatar.fixedUpdate(grounded);
    avatar.root.updateMatrixWorld(true);
    const y = avatar.bone('head').getWorldPosition(new THREE.Vector3()).y;
    // Measured: the head bone origin sits near 0.96 m (scaled); the whole posed model spans 0 to ~1.91 m.
    const bb = new THREE.Box3().setFromObject(avatar.root, true);
    expect(y).toBeGreaterThan(0.8);
    expect(y).toBeLessThan(1.6);
    expect(bb.min.y).toBeCloseTo(0, 1); // feet at the origin
    expect(bb.max.y).toBeGreaterThan(1.6);
    expect(bb.max.y).toBeLessThan(2.1);
  });
});
