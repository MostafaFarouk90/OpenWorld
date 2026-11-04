import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { ASSETS } from '../assets/AssetManifest';
import { CINDERREACH_NPC_DEFS } from '../cinderreach/npcDefs';
import { TOBB_NPC_DEF } from '../companions/CompanionFigure';
import { GAUT_RIDER, HALVARD_RIDER } from '../companions/escort/escort';
import { HROLF_NPC_DEF } from '../companions/hrolfLook';
import { DRAGONSPINE_NPC_DEFS } from '../dragonspine/npcDefs';
import { GREYFEN_NPC_DEFS } from '../greyfen/npcDefs';
import { HARROWMARK_NPC_DEFS } from '../harrowmark/npcDefs';
import { OLDSMOKE_NPC_DEFS } from '../oldsmoke/npcDefs';
import { M17R08_NPC_DEFS } from '../quests/content/act2/oldsmoke/mines/m17r08.npcs';
import { M18M19_NPC_DEFS } from '../quests/content/act2/oldsmoke/mines/m18m19.npcs';
import { M20D04_NPC_DEFS } from '../quests/content/act2/oldsmoke/mines/m20d04.npcs';
import { CARRY_ITEMS } from '../quests/content/carry';
import { ACT2_CARRY } from '../quests/content/act2';
import { TOWNSFOLK_SPOTS } from '../tutorial/Townsfolk';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { createFakeCore } from '../region/testing/fakeCore';
import { NPC_DEFS } from './npcDefs';
import { NpcManager } from './NpcManager';
import { NPC_STRINGS_EN } from './strings.en';
import { loadNpcModel, prepareNpcModel, withTownsfolkClips } from './npcModels';
import { fakeLoader, makeSource } from './npcTestKit';
import {
  KEEP_KAYKIT,
  TOWN_BODY_HEIGHT,
  TOWN_BODY_STANDING_HEIGHT,
  TOWN_TINT_STRENGTH,
  TOWNSFOLK_BODIES,
  townBodyScale,
  withTownsfolkBody,
} from './townsfolkBodies';
import { NPC_TUNING } from './tuning';
import { TOWN_BODY_IDS, type NpcDef, type NpcModelId } from './types';

const files = new Set(Object.keys(import.meta.glob('/public/assets/**/*.glb')));

const ALL_DEFS: NpcDef[] = [
  ...NPC_DEFS, ...HARROWMARK_NPC_DEFS, ...CINDERREACH_NPC_DEFS, ...OLDSMOKE_NPC_DEFS, ...M17R08_NPC_DEFS, ...M18M19_NPC_DEFS,
  ...M20D04_NPC_DEFS, ...GREYFEN_NPC_DEFS, ...DRAGONSPINE_NPC_DEFS, TOBB_NPC_DEF, HROLF_NPC_DEF, GAUT_RIDER, HALVARD_RIDER,
];
const CARRIED = [...CARRY_ITEMS, ...ACT2_CARRY].filter((i) => i.look === 'villager' || i.look === 'wounded');
/** Ids that are not region defs: the Kettlewick tutorial figures and the carried bodies. */
const OTHER_IDS = [...TOWNSFOLK_SPOTS.map((s) => `townsfolk.${s.id}`), ...CARRIED.map((i) => `carry:${i.id}`)];

const def = (id: string, model: NpcModelId = 'barbarian', extra: Partial<NpcDef> = {}): NpcDef => ({
  id, nameKey: '', model, scale: 1, tint: 0x806040, dialogueId: '', idleClip: 'Idle', ...extra,
});

describe('the mapping table', () => {
  it('maps only def ids that exist', () => {
    const ids = new Set([...ALL_DEFS.map((d) => d.id), ...OTHER_IDS]);
    for (const id of Object.keys(TOWNSFOLK_BODIES)) expect(ids.has(id), id).toBe(true);
  });

  it('never maps the named cast, companions, stewards or ghosts', () => {
    for (const id of KEEP_KAYKIT) expect(TOWNSFOLK_BODIES[id], id).toBeUndefined();
    // the coordinator's list and the main cast, by name
    for (const id of ['gaut', 'edda', 'stane', 'aelfreda', 'tobb', 'hrolf', 'rook', 'brand', 'wace', 'pell', 'maud', 'dudda', 'hild', 'pellam', 'grisel', 'ealdred', 'osric', 'redmane']) {
      expect(KEEP_KAYKIT, id).toContain(id);
    }
    const ids = new Set(ALL_DEFS.map((d) => d.id));
    for (const id of KEEP_KAYKIT) expect(ids.has(id), `${id} is not a def id`).toBe(true);
  });

  it('accounts for every region def: mapped or kept', () => {
    for (const d of ALL_DEFS) {
      expect(d.id in TOWNSFOLK_BODIES || KEEP_KAYKIT.includes(d.id), `${d.id} is neither mapped nor kept`).toBe(true);
    }
  });

  it('maps no def with extras or decorate hooks (they are written for KayKit node names)', () => {
    for (const d of ALL_DEFS) if (d.id in TOWNSFOLK_BODIES) expect(!!(d.extras || d.decorate), d.id).toBe(false);
  });

  it('gives every carried body a generated body, and a carried miner the body he stands in after delivery', () => {
    for (const i of CARRIED) expect(TOWNSFOLK_BODIES[`carry:${i.id}`], i.id).toBeDefined();
    expect(TOWNSFOLK_BODIES['carry:m17-miner-1']).toBe(TOWNSFOLK_BODIES['miner-hale']);
    expect(TOWNSFOLK_BODIES['carry:m17-miner-2']).toBe(TOWNSFOLK_BODIES['miner-brig']);
  });

  it('uses only known bodies', () => {
    for (const b of Object.values(TOWNSFOLK_BODIES)) expect(TOWN_BODY_IDS).toContain(b);
  });
});

describe('withTownsfolkBody', () => {
  it('swaps a mapped def onto its body, scaled to the standing height, lightly tinted, the KayKit def as fallback', () => {
    const kaykit = def('stallholder-1', 'barbarian', { scale: 0.9 });
    const d = withTownsfolkBody(kaykit);
    expect(d.model).toBe('town-merchant-a');
    expect(d.scale).toBeCloseTo(townBodyScale('town-merchant-a', 0.9));
    expect(d.tintStrength).toBe(TOWN_TINT_STRENGTH);
    expect(d.tint).toBe(kaykit.tint);
    expect(d.fallback).toBe(kaykit);
    expect(withTownsfolkBody(d)).toBe(d);
  });

  it('leaves unmapped defs and defs with hooks alone', () => {
    const rook = def('rook', 'knight');
    expect(withTownsfolkBody(rook)).toBe(rook);
    const hooked = def('sexton', 'mage', { decorate: () => {} });
    expect(withTownsfolkBody(hooked)).toBe(hooked);
  });

  it('brings every body to the standing height at the KayKit base scale', () => {
    for (const id of TOWN_BODY_IDS) {
      expect(TOWN_BODY_HEIGHT[id] * NPC_TUNING.modelBaseScale * townBodyScale(id), id).toBeCloseTo(TOWN_BODY_STANDING_HEIGHT, 6);
    }
  });
});

describe('withTownsfolkClips', () => {
  it('loads a generated body together with Knight.glb and animates it with the Knight clips', async () => {
    const knightClips = [new THREE.AnimationClip('Idle', 1, [])];
    const base = { ...fakeLoader(), animations: (id: NpcModelId) => (id === 'knight' ? knightClips : []) };
    const l = withTownsfolkClips(base);
    await l.load('town-miner-a');
    expect(base.loads.sort()).toEqual(['knight', 'town-miner-a']);
    expect(l.animations('town-miner-a')).toBe(knightClips);
    expect(l.animations('mage')).toEqual([]);
    expect(withTownsfolkClips(l)).toBe(l);
  });

  it('passes KayKit ids straight through', async () => {
    const base = fakeLoader();
    await withTownsfolkClips(base).load('rogue');
    expect(base.loads).toEqual(['rogue']);
  });

  it('rejects when either file fails', async () => {
    const base = fakeLoader();
    base.load = async (id) => { if (id === 'knight') throw new Error('no knight'); };
    await expect(withTownsfolkClips(base).load('town-guard-a')).rejects.toThrow('no knight');
  });
});

describe('loadNpcModel with a generated body', () => {
  it('falls back to the KayKit def when the body fails, and reports which def it built', async () => {
    const base = fakeLoader();
    base.load = async (id) => { if (id.startsWith('town-')) throw new Error('404'); base.loads.push(id); };
    const d = withTownsfolkBody(def('sexton', 'mage'));
    const out = await loadNpcModel(base, d);
    expect(out.def.model).toBe('mage');
    expect(base.loads).toContain('mage');
  });

  it('rejects when the fallback fails too', async () => {
    const base = fakeLoader();
    base.load = () => Promise.reject(new Error('offline'));
    await expect(loadNpcModel(base, withTownsfolkBody(def('sexton', 'mage')))).rejects.toThrow('offline');
  });

  it('keeps the generated Item and Offhand visible, still hides KayKit held items, and uses the def tint strength', () => {
    const src = makeSource();
    const item = new THREE.Mesh(src.geo, src.mat);
    item.name = 'Item';
    const off = new THREE.Group();
    off.name = 'Offhand';
    src.root.add(item, off);
    const d = withTownsfolkBody(def('armourer', 'barbarian', { tint: 0x000000 }));
    const { model } = prepareNpcModel(fakeLoader(src), d);
    expect(model.getObjectByName('Item')!.visible).toBe(true);
    expect(model.getObjectByName('Offhand')!.visible).toBe(true);
    expect(model.getObjectByName('1H_Sword')!.visible).toBe(false);
    const body = model.getObjectByName('Body') as THREE.Mesh;
    // white pulled a quarter of the way to black
    expect((body.material as THREE.MeshStandardMaterial).color.r).toBeCloseTo(1 - TOWN_TINT_STRENGTH, 5);
  });
});

describe('the generated files', () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const parse = async (path: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> => {
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(p: string): Uint8Array };
    const f = readFileSync(path);
    const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    return new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as never, rej));
  };
  const top = (scene: THREE.Object3D): number => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name === 'Item' || p.name === 'Offhand') return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
        if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
        box.expandByPoint(v.applyMatrix4(m.matrixWorld));
      }
    });
    return box.max.y;
  };

  it('every body has a manifest entry and a file', () => {
    for (const id of TOWN_BODY_IDS) {
      const a = (ASSETS as Record<string, { url: string; kind: string }>)[id];
      expect(a, id).toBeDefined();
      expect(a.kind).toBe('character');
      expect(files.has(`/public${a.url}`), a.url).toBe(true);
    }
  });

  it('has the Knight skeleton bone for bone, no clips of its own, and the pinned height', async () => {
    const knight = await parse('public/assets/kaykit-adventurers/characters/Knight.glb');
    const bones = (s: THREE.Object3D) => {
      const out: string[] = [];
      s.traverse((o) => { if ((o as THREE.Bone).isBone) out.push(`${o.parent?.name}>${o.name}`); });
      return out.sort();
    };
    const kb = bones(knight.scene);
    expect(kb.length).toBe(41);
    const knightClipNames = new Set(knight.animations.map((c) => c.name));
    for (const name of ['Idle', 'Walking_A', 'Running_A', 'Sit_Chair_Idle', 'Interact']) expect(knightClipNames, name).toContain(name);
    for (const id of TOWN_BODY_IDS) {
      const g = await parse(`public/assets/embers-townsfolk/${id}.glb`);
      // same bone names under the same parents (the Rig node sits where Knight's Rig does)
      expect(bones(g.scene), id).toEqual(kb);
      expect(g.animations.length, id).toBe(0);
      expect(top(g.scene), id).toBeCloseTo(TOWN_BODY_HEIGHT[id], 2);
    }
  }, 60_000);
});

describe('NpcManager with generated bodies', () => {
  const setup = (load: (id: NpcModelId) => Promise<void>) => {
    const fc = createFakeCore();
    fc.ctx.strings.register('en', NPC_STRINGS_EN);
    for (const n of BRIGHTWATER_LAYOUT.npcs) {
      const a = BRIGHTWATER_LAYOUT.anchors.find((x) => x.id === n.post)!;
      fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 1.5, z: a.z }, yaw: 0 });
    }
    const loader = { ...fakeLoader(), load: vi.fn(load) };
    const warn = vi.fn();
    const m = new NpcManager(fc.ctx, { layoutNpcs: BRIGHTWATER_LAYOUT.npcs, defs: NPC_DEFS, playerPosition: () => null, warn, loader });
    m.spawnAll();
    return { m, loader, warn };
  };

  it('puts the carters on their generated bodies, loaded with Knight.glb', async () => {
    const { m, loader } = setup(async () => {});
    await m.loadModels();
    expect(m.get('carter-1')!.def.model).toBe('town-farmer-a');
    expect(m.get('carter-1')!.hasModel).toBe(true);
    expect(m.get('gaut')!.def.model).toBe('knight');
    const calls = loader.load.mock.calls.map((c) => c[0]);
    expect(calls).toContain('town-farmer-a');
    expect(calls).toContain('knight');
  });

  it('moves an NPC whose body fails onto its KayKit fallback, and builds it once that GLB is in', async () => {
    const { m, warn } = setup(async (id) => { if (id.startsWith('town-')) throw new Error('404'); });
    await m.loadModels();
    for (const id of ['carter-1', 'carter-2', 'carter-3']) {
      const h = m.get(id)!;
      expect(h.def.model, id).toBe(NPC_DEFS.find((d) => d.id === id)!.model);
      expect(h.hasModel, id).toBe(true);
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('town-farmer-a'));
  });

  it('keeps the placeholder when the body and its fallback both fail', async () => {
    const { m } = setup(async (id) => { if (id.startsWith('town-') || id === 'barbarian') throw new Error('404'); });
    await m.loadModels();
    expect(m.get('carter-1')!.def.model).toBe('barbarian');
    expect(m.get('carter-1')!.hasModel).toBe(false);
    expect(m.get('carter-2')!.hasModel).toBe(true); // rogue loaded
  });
});
