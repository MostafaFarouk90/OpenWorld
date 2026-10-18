import { CODEX_ENTRIES } from './entries';

const CHROME: Record<string, string> = {
  'codex.title': 'Codex',
  'codex.tab.bestiary': 'Bestiary',
  'codex.tab.lore': 'Lore',
  'codex.tab.howto': 'How it works',
  'codex.locked': '???',
  'codex.lockedBody': 'Not yet discovered.',
  'codex.empty': 'Nothing here yet.',
  'codex.tally': 'Released {release} · Spared {spare} · Calmed {calm}',
  'codex.hint': 'Left/Right: tab · Up/Down: select · L or Esc: close',
};

/** Placeholder greybox text; thread 6 / the writer replace the lore bodies. */
const BODIES: Record<string, [string, string]> = {
  'bestiary.blighted-soldier': ['Blighted Footman', 'A soldier of the old garrison, bound to his post by the Blight. Shield high, he waits for you to tire. Strike when the shield drops.'],
  'bestiary.ash-wraith': ['Ashwalker Wraith', 'What is left of a person the forge-fire took. It claws in wide, slow arcs. When it staggers, it can be Released.'],
  'bestiary.ashen-prior': ['The Ashen Prior', 'Keeper of the vault below the chapel. His grief burns hotter than his flame. He can be broken, or he can be freed.'],
  'lore.leap-a': ['The Leap Stone, North', '[Greybox] A carved stone on the first ridge. It speaks of those who crossed the gap in a single breath.'],
  'lore.leap-b': ['The Leap Stone, South', '[Greybox] A second stone, older. The runes say the gap was never a wall, only a question.'],
  'howto.release': ['Release', 'Hold T near a staggered wraith to Release it. This is a mercy: it costs Burn, and the wraith is freed rather than slain.'],
  'howto.spare': ['Spare', 'Hold T near a yielding foe to Spare it. It stands down and does not fight you again.'],
  'howto.burn-scars': ['Burn and Scars', 'Burn builds as you draw on the forge-fire. Every Scar you take lowers your maximum health for good.'],
  'howto.surge-leap': ['Surge Leap', 'Press V to leap. Burn never blocks it. At 75 or more Burn, a Scar risk is shown.'],
  'howto.rally-cry': ['Rally Cry', 'A shout that steadies allies near you. It is strongest when your companion fights beside you.'],
  'howto.warmth-tier': ['Warmth Tier', 'Each lit forge-shrine raises Warmth. Higher tiers change how the world and its creatures answer you.'],
};

function buildEntryStrings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of CODEX_ENTRIES) {
    const [name, body] = BODIES[e.tab === 'bestiary' ? `bestiary.${e.id}` : e.id] ?? [e.id, ''];
    out[e.nameKey] = name;
    out[e.bodyKey] = body;
  }
  return out;
}

export const CODEX_STRINGS_EN: Readonly<Record<string, string>> = { ...CHROME, ...buildEntryStrings() };
