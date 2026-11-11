// Act 5 N1 PR 2: the Caldera's structure art. PR 1's structures (caldera.layout.ts) are greyboxes with colliders; each one named
// below is drawn by its env model (calderaEnvIds.ts, use 'structure') once public/assets/env/<id>.glb is in the manifest, and stays
// greybox until then (createEnvStructureArt gives null for an id the manifest lacks). Colliders always come from the layout spec.
import * as THREE from 'three';
import type { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { createEnvStructureArt, type EnvEntry } from '../../env/envStructureArt';
import type { StructureSpec } from '../../region/layoutTypes';
import type { StructureArt } from '../../region/structureArt';

/**
 * How each structure is drawn. `quarter`: the model's front (+Z) turns to +X (a stall's counter faces its vendor's customers, who stand
 * east of it); the model is fitted to the footprint with its sides swapped first. `mirror`: the model is mirrored in x (the east gate
 * tower's plain inner face is then at -X, toward the leaf, its postern still on the court side).
 */
export interface CalderaArtEntry extends EnvEntry {
  id: string;
  quarter?: boolean;
  mirror?: boolean;
}

/** The structure's env entry by its layout id (null: not an art piece). */
export function calderaArtEntry(spec: Pick<StructureSpec, 'id'>): CalderaArtEntry | null {
  const id = spec.id;
  if (id === 'caldera.rim-gate.tower.w') return { id: 'rim-gate-tower-a' };
  if (id === 'caldera.rim-gate.tower.e') return { id: 'rim-gate-tower-a', mirror: true };
  if (id === 'caldera.rim-gate.winch.drum') return { id: 'gate-winch-a' };
  // Tents 1 to 4 stand north of the fire, 5 and 6 south: every door flap faces the fire.
  const tent = /^caldera\.camp\.tent\.(\d+)$/.exec(id);
  if (tent) return { id: 'rim-camp-tent-a', frontNegZ: Number(tent[1]) <= 4 };
  if (id === 'caldera.camp.war-table.top') return { id: 'war-table-a' };
  if (/^caldera\.camp\.shop\.[\w-]+\.stall$/.test(id)) return { id: 'rim-stall-a', quarter: true };
  if (id === 'caldera.stokers.hut') return { id: 'stokers-hut-a' };
  if (/^caldera\.inner-gate\.pillar\.\d+$/.test(id)) return { id: 'inner-gate-pillar-a' };
  return null;
}

/** `envLib` loads the `env/<id>` models (envModelLibraryFor). */
export function createCalderaArt(envLib: ModelLibrary): StructureArt {
  const env = createEnvStructureArt(envLib, (spec) => {
    const e = calderaArtEntry(spec);
    return e ? { id: e.id, ...(e.frontNegZ ? { frontNegZ: true } : {}) } : undefined;
  });
  return async (spec) => {
    const e = calderaArtEntry(spec);
    if (!e) return null;
    const fitSpec: StructureSpec = e.quarter ? { ...spec, footprint: [spec.footprint[1], spec.footprint[0]] } : spec;
    const obj = await env(fitSpec);
    if (!obj || (!e.quarter && !e.mirror)) return obj;
    // The turn and the mirror live on an inner holder: the builder places and turns the returned root.
    const holder = new THREE.Group();
    if (e.quarter) holder.rotation.y = Math.PI / 2;
    if (e.mirror) holder.scale.x = -1;
    holder.add(obj);
    const root = new THREE.Group();
    root.name = `caldera-art:${spec.id}`;
    root.add(holder);
    return root;
  };
}
