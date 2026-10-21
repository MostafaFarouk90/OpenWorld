import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PART } from './materials';
import { seeded, WYRM_SHAPE } from './params';

/**
 * Geometry for one wyrm build, in metres at the build's scale. Every scale-role geometry carries `aPart` (which colour
 * and glow) and `aSeg` (the spine index, instanced on the spine) so one program serves all of them. Deterministic:
 * the same scale and seed give the same vertices.
 */

/** Adds a constant `aPart` (and `aSeg` 0) to a geometry; drops `uv` so merged pieces share one attribute set. */
function tag(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

/** A unit sphere for the spine (instanced; `aSeg` comes from the instance attribute set by the rig). */
export function spineGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 8);
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(PART.scale), 1));
  g.deleteAttribute('uv');
  return g;
}

/** A dorsal spike: a five-sided cone, base at the origin, tip at +Y (instanced). */
export function spikeGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.5, 1, 5, 1);
  g.translate(0, 0.5, 0);
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(PART.horn), 1));
  g.deleteAttribute('uv');
  return g;
}

/** A tapered bone from z 0 (radius 1) to z 1 (radius 0.6), six sides (instanced: wing bones, legs). */
export function boneGeometry(part: number = PART.frame): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.6, 1, 1, 6, 1);
  g.translate(0, 0.5, 0);
  g.rotateX(Math.PI / 2);
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  g.deleteAttribute('uv');
  return g;
}

/** A chain link: a thin torus (instanced). */
export function linkGeometry(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.5, 0.14, 4, 8);
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(PART.metal), 1));
  g.deleteAttribute('uv');
  return g;
}

/**
 * The head in head space (origin at the back of the skull, forward -Z, up +Y): skull, wedge snout, two swept horn
 * cones, two emissive eyes, the mouth-glow core, and an optional crest. One merged geometry (one draw call).
 */
export function headGeometry(scale: number, seed: number, crest: boolean): THREE.BufferGeometry {
  const s = scale;
  const L = WYRM_SHAPE.headLength * s;
  const rng = seeded(seed * 7919 + 13);
  const parts: THREE.BufferGeometry[] = [];

  const skull = new THREE.SphereGeometry(1, 10, 8);
  skull.scale(0.3 * s, 0.27 * s, 0.34 * s);
  skull.translate(0, 0, -0.3 * s);
  parts.push(tag(skull, PART.scale));

  // Wedge snout: a four-sided frustum pointing forward, flattened.
  const snout = new THREE.CylinderGeometry(0.07 * s, 0.24 * s, L * 0.62, 4, 1);
  snout.rotateY(Math.PI / 4);
  snout.rotateX(-Math.PI / 2);
  snout.scale(1.15, 0.62, 1);
  snout.translate(0, 0.02 * s, -0.3 * s - L * 0.42);
  parts.push(tag(snout, PART.scale));

  // Horns: swept back and up, a little spread per build.
  const sweep = 0.55 + rng() * 0.2;
  for (const side of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.06 * s, 0.55 * s, 6, 1);
    horn.translate(0, 0.275 * s, 0);
    horn.rotateX(sweep + 0.6);
    horn.rotateZ(-side * (0.25 + rng() * 0.1));
    horn.translate(side * 0.16 * s, 0.17 * s, -0.12 * s);
    parts.push(tag(horn, PART.horn));
  }

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.045 * s, 6, 4);
    eye.translate(side * 0.19 * s, 0.1 * s, -0.5 * s);
    parts.push(tag(eye, PART.eye));
  }

  // The mouth core: inside the jaws at the snout's root, lit by the inhale.
  const core = new THREE.SphereGeometry(0.11 * s, 6, 4);
  core.scale(1.2, 0.6, 1.6);
  core.translate(0, -0.07 * s, -0.55 * s);
  parts.push(tag(core, PART.mouth));

  if (crest) {
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.ConeGeometry(0.05 * s, (0.22 - i * 0.03) * s, 4, 1);
      plate.translate(0, 0.25 * s, (-0.2 + i * 0.12) * s);
      parts.push(tag(plate, PART.eye));
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('wyrm: head geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

/** The lower jaw in jaw space (hinge at the origin, forward -Z): a flat wedge. */
export function jawGeometry(scale: number): THREE.BufferGeometry {
  const s = scale;
  const L = WYRM_SHAPE.headLength * s;
  const jaw = new THREE.CylinderGeometry(0.05 * s, 0.2 * s, L * 0.75, 4, 1);
  jaw.rotateY(Math.PI / 4);
  jaw.rotateX(-Math.PI / 2);
  jaw.scale(1.05, 0.4, 1);
  jaw.translate(0, -0.03 * s, -L * 0.37);
  const g = tag(jaw, PART.scale);
  g.computeBoundingSphere();
  return g;
}

/** Points of one wing in wing space (x out along the span, z back along the chord), before the fold. */
export interface WingFrame {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  tips: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

/** The right wing's frame (the left mirrors x). */
export function wingFrame(scale: number, wingspan: number): WingFrame {
  const L = WYRM_SHAPE.wingLength * scale * wingspan;
  const C = WYRM_SHAPE.wingChord * scale * wingspan;
  return {
    shoulder: new THREE.Vector3(0, 0, 0),
    elbow: new THREE.Vector3(0.22 * L, 0.06 * L, 0.05 * C),
    wrist: new THREE.Vector3(0.45 * L, 0.03 * L, -0.02 * C),
    tips: [new THREE.Vector3(L, 0, 0.12 * C), new THREE.Vector3(0.8 * L, 0, 0.66 * C), new THREE.Vector3(0.52 * L, 0, 0.98 * C)],
  };
}

/** Chord of the membrane at span fraction u: scalloped between the fingers. */
export function membraneChord(u: number, chord: number): number {
  return chord * (1 - 0.6 * u) * (0.78 + 0.22 * Math.abs(Math.cos(u * Math.PI * 2.5)));
}

/** Membrane grid per wing (columns along the span, rows along the chord). */
export const MEMBRANE_GRID = { u: 8, v: 6 } as const;

/**
 * Both membranes in one geometry, in wing space: the right wing at +x, the left mirrored to -x. `aSide` picks the
 * wing's frame in the vertex shader; `aWing` is (span, chord) in 0..1 for the billow.
 */
export function membraneGeometry(scale: number, wingspan: number): THREE.BufferGeometry {
  const L = WYRM_SHAPE.wingLength * scale * wingspan;
  const C = WYRM_SHAPE.wingChord * scale * wingspan;
  const nu = MEMBRANE_GRID.u;
  const nv = MEMBRANE_GRID.v;
  const pos: number[] = [];
  const side: number[] = [];
  const wing: number[] = [];
  const idx: number[] = [];
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const c = membraneChord(u, C);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        // The leading edge bows slightly forward toward the wrist.
        const lead = -0.06 * C * Math.sin(Math.PI * Math.min(1, u / 0.6));
        pos.push(s * u * L, 0, lead + v * (c - lead));
        side.push(s);
        wing.push(u, v);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j;
        const b = a + nv + 1;
        if (s > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Drawn wherever the wings are (the frame is applied in the shader): never culled.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), L * 3);
  return g;
}

/** A flat sector (the spit's cone decal): apex at the origin, opening along -Z, unit radius, lying in the XZ plane. */
export function coneDecalGeometry(halfAngle: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 12, Math.PI / 2 - halfAngle, halfAngle * 2);
  g.rotateX(-Math.PI / 2);
  return g;
}
