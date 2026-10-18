import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ClassAvatar } from '../ClassAvatar';
import { EMBERWRIGHT_KIT } from './kit';
import { EMBERWRIGHT_ATTACK_SET } from './tuning';

describe('the Emberwright kit on the real Mage.glb', () => {
  it('builds the avatar with the staff and the spellbook, and the controller accepts the attack set', async () => {
    (globalThis as { self?: unknown }).self ??= globalThis;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readFileSync: (p: string) => Uint8Array & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    };
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Mage.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf = await new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>((res, rej) => new GLTFLoader().parse(buf, '', res as never, rej));
    const avatar = new ClassAvatar(EMBERWRIGHT_KIT, { model: gltf.scene, clips: gltf.animations, mainhand: null, offhand: null }, { warn: () => undefined });
    expect(avatar.classId).toBe('emberwright');
    expect(avatar.weapon.name).toBe('2H_Staff');
    expect(avatar.offhandVisual?.name).toBe('Spellbook');
    expect(avatar.offhand).toBeNull();
    expect(avatar.controller.setAttackSet(EMBERWRIGHT_ATTACK_SET.attacks)).toBe(true);
    vi.restoreAllMocks();
  });
});
