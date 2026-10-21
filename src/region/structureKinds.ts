// Open set of structure kinds (v0.6 item 17). The 25 built-ins live in layoutTypes.ts with their own greybox and art;
// a later layout registers an extra kind here with a recipe, and the greybox height and model lookups fall back to it.
import { BUILT_IN_STRUCTURE_KINDS } from './layoutTypes';

export interface StructureRecipe {
  /** Default wall and collider height in metres (a spec's own `height` wins). */
  height: number;
  /** Asset id of a real model for the kind (the `STRUCTURE_MODELS` slot); absent means the greybox. */
  model?: string;
  /** The mode layouts of this kind are meant to use. Advisory: a spec's own `mode` is what builds. */
  collider?: 'solid' | 'enterable' | 'open';
}

const BUILT_IN = new Set<string>(BUILT_IN_STRUCTURE_KINDS);
const registry = new Map<string, StructureRecipe>();

export const isBuiltInStructureKind = (kind: string): boolean => BUILT_IN.has(kind);

/**
 * Adds a kind. Throws on a built-in kind, a duplicate or a bad recipe. Returns an undo that removes it (only the
 * registration it made, so a stale undo does nothing).
 */
export function registerStructureKind(kind: string, recipe: StructureRecipe): () => void {
  if (typeof kind !== 'string' || kind === '') throw new Error('registerStructureKind: kind must be a non-empty string');
  if (BUILT_IN.has(kind)) throw new Error(`registerStructureKind: "${kind}" is a built-in kind`);
  if (registry.has(kind)) throw new Error(`registerStructureKind: "${kind}" is already registered`);
  if (!Number.isFinite(recipe.height) || recipe.height <= 0) throw new Error(`registerStructureKind: "${kind}" needs a positive height`);
  const entry = { ...recipe };
  registry.set(kind, entry);
  return () => {
    if (registry.get(kind) === entry) registry.delete(kind);
  };
}

/** The recipe of a registered kind; undefined for a built-in or unknown kind. */
export function structureRecipe(kind: string): StructureRecipe | undefined {
  return registry.get(kind);
}

export const isKnownStructureKind = (kind: string): boolean => BUILT_IN.has(kind) || registry.has(kind);
