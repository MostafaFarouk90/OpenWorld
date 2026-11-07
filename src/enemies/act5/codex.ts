/**
 * The Caldera creatures' bestiary data (Act 5 N5), for N9 to register. Same shape as `WASTE_CODEX_ROWS`; `kind` is the unlock
 * id (a skin row shares its base kind, so N9 decides the unlock rule) and `skin` names the skin that tells the rows apart.
 */
export interface CalderaCodexRow {
  kind: string;
  slug: string;
  skin?: string;
  strings: Record<string, string>;
}

const row = (kind: string, slug: string, name: string, body: string, skin?: string): CalderaCodexRow => ({
  kind,
  slug,
  ...(skin ? { skin } : {}),
  strings: { [`codex.bestiary.${slug}.name`]: name, [`codex.bestiary.${slug}.body`]: body },
});

export const CALDERA_CODEX_ROWS: readonly CalderaCodexRow[] = [
  row(
    'warhost-soldier',
    'warhost-soldier',
    'Warhost Soldier',
    "One of Morcant Vey's soldiers in black and gold. They stand in lines of shield, pike and torch. The shield takes a chop and shoves you back. The pike lowers for a breath, then thrusts from three paces. The torch lifts overhead and throws a burning brand. Break two shields in the same breath and the whole line kneels: hold {key} to spare them. Halvard's men remember it.",
  ),
  row(
    'warhost-guard',
    'warhost-guard',
    'Household Guard',
    "Vey's sworn guard, taller and plumed in black. They hit harder and give less ground than the common warhost, and they stand in a line like any soldier. A guard who kneels may be spared (hold {key}); Halvard counts it twice.",
  ),
  row(
    'blighted-soldier',
    'grisel-loyalist',
    "Grisel's Loyalist",
    "A guard in House Grisel's green who still holds the old oath to Aldous. He fights as a Charred Footman does. Knock him down and he will yield: hold {key} to spare him.",
    'footman-grisel',
  ),
  row(
    'ash-wraith',
    'stoker-wraith',
    'Stoker Wraith',
    "The rim's own dead: stokers who never left the fires, black with soot and a low ember where the green should be. They claw as any wraith does. Stagger one and hold {key} to release it. The Ashwalkers remember it.",
    'wraith-stoker',
  ),
  row(
    'cinder-golem',
    'forge-thrall',
    'Forge-Thrall',
    "A golem of cooled crust set to work the old foundry, black outside and white-hot at the seams. It fights as a Cinder Golem does; when the core shows, hold {key} to let it be still.",
    'golem-lava',
  ),
];
