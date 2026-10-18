// Thread 17 owns this data (contracts/heightfield.md "Terrain shaping"); types only, so the workers can load it.
import type { PlateauDef, RidgeSuppressionDef } from '../shaping';

/** The city's 1.5 x 1.5 km footprint around engine (8500, 2000). 20 m is thread 17's value (the ring wall and every structure sit on it); core's validateShape accepts it. */
export const HARROWMARK_PLATEAU: PlateauDef = {
  id: 'harrowmark',
  box: { minX: 7750, maxX: 9250, minZ: 1250, maxZ: 2750 },
  height: 20,
  blend: 200,
};

/** No mountain ridges inside the Harrowmark region box. */
export const HARROWMARK_RIDGES: RidgeSuppressionDef = {
  id: 'harrowmark-ridges',
  box: { minX: 6500, maxX: 10500, minZ: 0, maxZ: 4000 },
  blend: 400,
  strength: 1,
};
