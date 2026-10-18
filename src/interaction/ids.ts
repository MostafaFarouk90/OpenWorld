/** Interactable ids are `<kind>:<name>` (contracts/world-layout-and-npcs.md section 1). */
const ID = /^([a-z]+):([a-zA-Z0-9_-]+)$/;

export function parseInteractableId(id: string): { kind: string; name: string } {
  const m = typeof id === 'string' ? ID.exec(id) : null;
  if (!m) throw new Error(`Invalid interactable id "${String(id)}": expected <kind>:<name> (kind a-z, name [a-zA-Z0-9_-]+)`);
  return { kind: m[1], name: m[2] };
}

/** `door:bakery`, `open` -> `door.bakery.open`. */
export function flagKeyFor(id: string, suffix: string): string {
  const { kind, name } = parseInteractableId(id);
  return `${kind}.${name}.${suffix}`;
}
