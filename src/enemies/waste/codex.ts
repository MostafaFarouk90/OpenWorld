/**
 * The Waste creatures' bestiary data (Act 4 L5). L9's `codex-act4` plugin registers these rows through the codex service
 * and unlocks them on the bestiary's rule (first seen or killed); this module only owns the data, and its keys appear in no
 * other strings table. `kind` is the enemy kind and the unlock id; `slug` names the keys `codex.bestiary.<slug>.name` and
 * `.body`, both carried in `strings` (English).
 */
export interface WasteCodexRow {
  kind: string;
  slug: string;
  strings: Record<string, string>;
}

const row = (kind: string, name: string, body: string): WasteCodexRow => ({
  kind,
  slug: kind,
  strings: { [`codex.bestiary.${kind}.name`]: name, [`codex.bestiary.${kind}.body`]: body },
});

export const WASTE_CODEX_ROWS: readonly WasteCodexRow[] = [
  row(
    'waste-strider',
    'Waste Strider',
    'A tall ash-eater that picks over the dunes on four long legs, clicking as it goes. It keeps its distance and fights from there: it draws a foreleg back with a puff of sand, then stabs along a line or kicks a cloud of sand at you. A bolt, a spell or a heavy blow on a leg trips it; two quick cuts on the same leg do too. Tripped, or before it has seen you, pour a Rain Flask on the sand (hold {key}) and it drinks and walks away. The Ashwalkers remember it.',
  ),
  row(
    'husk-knight',
    'Husk Knight',
    'A knight of the old cathedral guard, long dead and still in his armour, with a greatsword and a shield. When he raises the sword or the shield an ember glows in his chest and a low gong sounds: strike the ember then and he breaks. Broken, he can be released (hold {key}). Cut down unreleased, he lies in his ash a moment and rises once more.',
  ),
  row(
    'cinder-gnat-swarm',
    'Cinder Gnats',
    'A cloud of burning gnats from the glass flats. It draws in tight and bright with a rising buzz before it washes over you and sets you alight. Blades only thin it; fire or anything that strikes all around you scatters it at once.',
  ),
];
