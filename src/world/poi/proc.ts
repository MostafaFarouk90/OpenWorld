// Procedural dressing for the pieces no kit covers: bones, eggs, bedrolls, braziers, cages, nets, fire rings, the cave
// mouth and the ember glow. Every geometry is built around the part's own origin (the caller places the group), so no
// shader or pattern samples raw world position (A0's far-coordinate rule). Glow is emissive; no point lights.
import * as THREE from 'three';
import type { ProcKind } from './types';

const mat = (color: number, emissive = 0, intensity = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...(emissive ? { emissive, emissiveIntensity: intensity } : {}) });

const box = (w: number, h: number, d: number, m: THREE.Material, y = 0): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.y = y + h / 2;
  return mesh;
};

export function buildProc(kind: ProcKind, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = `proc:${kind}`;
  switch (kind) {
    case 'bones': {
      const m = mat(0xd8d0bc);
      const a = box(0.9, 0.12, 0.14, m);
      const b = box(0.12, 0.1, 0.6, m);
      b.position.x = 0.3;
      b.rotation.y = 0.6;
      g.add(a, b);
      break;
    }
    case 'eggs': {
      const m = mat(0x7a3b2a, 0x5a1a08, 0.6);
      for (let i = 0; i < 3; i++) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), m);
        e.scale.set(1, 1.35, 1);
        e.position.set(Math.cos(i * 2.1) * 0.45, 0.38, Math.sin(i * 2.1) * 0.45);
        g.add(e);
      }
      break;
    }
    case 'bedroll':
      g.add(box(0.8, 0.14, 1.9, mat(0x6a5a40)));
      break;
    case 'brazier': {
      g.add(box(0.2, 0.9, 0.2, mat(0x2b2b2b)));
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.28, 0.3, 10), mat(0x2b2b2b));
      bowl.position.y = 1.05;
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 8), mat(0xff7a1a, 0xff5a00, 1.6));
      fire.position.y = 1.4;
      g.add(bowl, fire);
      break;
    }
    case 'cage': {
      const bars = mat(0x3a3a3a);
      for (let i = -3; i <= 3; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), bars);
        bar.position.set(i * 0.2, 0.9, 0.9);
        const back = bar.clone();
        back.position.z = -0.9;
        g.add(bar, back);
      }
      g.add(box(1.5, 0.08, 2, bars), box(1.5, 0.08, 2, bars, 1.8));
      break;
    }
    case 'net': {
      const m = mat(0x8a7a52);
      for (let i = 0; i < 4; i++) {
        const strand = box(1.6, 0.05, 0.05, m, 0.05 + i * 0.03);
        strand.rotation.y = i * 0.8;
        g.add(strand);
      }
      break;
    }
    case 'fire-ring': {
      const stones = mat(0x6b6b6b);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = box(0.4, 0.3, 0.4, stones);
        s.position.set(Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9);
        g.add(s);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 8), mat(0xff7a1a, 0xff5a00, 1.4));
      flame.position.y = 0.55;
      g.add(flame);
      break;
    }
    case 'cave-mouth': {
      const dark = mat(0x0b0908);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.8, 14), dark);
      mouth.position.set(0, 1.8, 0.3);
      mouth.scale.set(1, 1.1, 1);
      g.add(mouth);
      break;
    }
    case 'cache': {
      g.add(box(0.9, 0.5, 0.55, mat(0x7a5a3a)), box(0.95, 0.12, 0.6, mat(0x5a4028), 0.5));
      break;
    }
    case 'lore-stone': {
      g.add(box(0.7, 1.6, 0.35, mat(0x8d8d8d)), box(0.55, 0.2, 0.28, mat(0x77746f), 1.6));
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6), mat(0xff8a30, 0xff6a10, 1.2));
      rune.position.set(0, 0.9, 0.18);
      g.add(rune);
      break;
    }
    case 'peat-stack': {
      // Temporary stand-in for the generated `greyfen-peat-stack` (prompt list, Act 3 POIs): cut blocks drying in a stack.
      const m = mat(0x3b2a1c);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3 - i; j++) {
          const block = box(0.5, 0.3, 0.9, m, i * 0.3);
          block.position.x = -0.55 + j * 0.55 + i * 0.27;
          g.add(block);
        }
      }
      break;
    }
    case 'glass-vein': {
      // Temporary stand-in for the generated `dragonspine-glass-vein`: black rock split by a glowing forge-glass seam.
      const rock = mat(0x1d1b1a);
      g.add(box(3.2, 1.4, 1.6, rock));
      const seam = mat(0xffa040, 0xff7010, 1.3);
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5), seam);
        c.position.set(-1.2 + i * 0.6, 1.5, (i % 2 ? 0.2 : -0.2));
        c.rotation.z = (i - 2) * 0.18;
        g.add(c);
      }
      g.add(box(2.8, 0.08, 0.2, seam, 1.35));
      break;
    }
    case 'egg-shells': {
      const m = mat(0xe6e2d4);
      for (let i = 0; i < 4; i++) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), m);
        e.position.set(Math.cos(i * 1.7) * 0.3, 0.05, Math.sin(i * 1.7) * 0.3);
        e.rotation.x = i % 2 ? Math.PI : 0.4;
        g.add(e);
      }
      break;
    }
    case 'ember-glow': {
      const m = mat(0xff8a30, 0xff6a10, 1.2);
      m.transparent = true;
      m.opacity = 0.55;
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 2.6, 8, 1, true), m);
      glow.position.y = 1.5;
      g.add(glow);
      break;
    }
  }
  g.scale.setScalar(scale);
  return g;
}

export function disposeProc(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    }
  });
}
