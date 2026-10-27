// The art layer for Greyfen's structures: the generated models of public/assets/env, one per kind (src/env/envStructureArt.ts).
// Kinds the manifest lacks, and any model that fails to load, stay greybox (this layer returns null for them). Colliders come from
// the layout spec in StructureBuilder, so none of this changes where anything blocks.
import type { ModelLibrary } from '../assets/swap/ModelLibrary';
import { createEnvStructureArt, type EnvEntry } from '../env/envStructureArt';
import type { StructureSpec } from '../region/layoutTypes';
import type { StructureArt } from '../region/structureArt';

/** Kinds drawn by the model of the same id; they fill their footprint within the 15% rule. */
const FILL = [
  'greyfen-stilt-house',
  'greyfen-boathouse',
  'greyfen-ranger-platform',
  'greyfen-reed-bed',
  'greyfen-reed-bed-charred',
  'greyfen-stocks',
  'greyfen-stilt-hut',
  'greyfen-herb-bed',
  'greyfen-chapel-ruin',
  'greyfen-bell-tower',
  'greyfen-monastery-ruin',
  'greyfen-marker',
] as const;

/** The ferry jetties are the built-in `bridge` kind, told apart by id (the M23 bridge decks are not jetties). */
export const JETTY_ID = /^greyfen-jetty-/;

/**
 * The model entry of a Greyfen structure, or undefined. The plank walk (4 m long) and the jetty (4 x 3 m) are repeated along their
 * footprint rather than stretched: a 52 m walk is 13 planks, the 16 x 16 deck a grid of them.
 */
export function greyfenEnvEntry(spec: StructureSpec): EnvEntry | undefined {
  if (spec.kind === 'greyfen-plank-walk') return { mode: 'tile' };
  if (spec.kind === 'bridge' && JETTY_ID.test(spec.id)) return { id: 'greyfen-jetty', mode: 'tile' };
  return (FILL as readonly string[]).includes(spec.kind) ? {} : undefined;
}

/** `envLib` is the library that loads `env/<id>` files (see envModelLibraryFor). */
export function createGreyfenArt(envLib: ModelLibrary): StructureArt {
  return createEnvStructureArt(envLib, greyfenEnvEntry);
}
