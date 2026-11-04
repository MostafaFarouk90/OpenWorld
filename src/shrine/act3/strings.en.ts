// K9 PR 1 strings, one table per plugin (a StringTable refuses a duplicate key, so no table is registered twice).
export const MERE_STRINGS_EN = {
  'mere.rest.ignite': 'The cold of the Mere takes the burning out of you.',
  'mere.scale.eased': 'Hathren\'s scale warms in your hand. {count} of the shard\'s Scars ease.',
  'mere.scale.none': 'Hathren\'s scale lies cool and still. You carry no Scars for it to ease.',
} as const;

export const LAST_ANVIL_STRINGS_EN = {
  'lastAnvil.sweep.prompt': 'Sweep the ash from the anvil',
  'lastAnvil.relight.prompt': 'Relight the anvil\'s lamp',
  'lastAnvil.sound.prompt': 'Sound the anvil',
  'lastAnvil.sweep.done': 'Ash and old slag fall away. The face of the anvil is bare iron.',
  'lastAnvil.relight.done': 'The lamp takes a flame, small and steady.',
  'lastAnvil.sound.done': 'You strike once. The note carries over the ridge and does not fade soon.',
  'lastAnvil.rubbing.prompt': 'Take a rubbing of the carving',
  'codex.lore.rubbing-anvil-1.name': 'Rubbing: the crowned smith',
  'codex.lore.rubbing-anvil-1.body': 'A smith in a crown of iron stands at the anvil with his hammer raised. The carver cut no face, only the crown and the light the forge throws on it.',
  'codex.lore.rubbing-anvil-2.name': 'Rubbing: the keepers',
  'codex.lore.rubbing-anvil-2.body': 'Winged fire-bearers kneel at the four corners of the anvil, named in the old tongue as the Forge\'s keepers. Their wings are drawn open like banners.',
  'codex.lore.rubbing-anvil-3.name': 'Rubbing: the fire and the hammer',
  'codex.lore.rubbing-anvil-3.body': 'The keepers did not forge. They fed the fire, and the smith shaped what it gave. A line beneath says the anvil rings only when both stand at it together.',
  'codex.lore.rubbing-anvil-4.name': 'Rubbing: the first hunters',
  'codex.lore.rubbing-anvil-4.body': 'Hunters come up the road with torches and chains. The carving shows them breaking a smith-shrine from its base while the keepers rise out of the ash.',
  'codex.lore.rubbing-anvil-5.name': 'Rubbing: the lifted stones',
  'codex.lore.rubbing-anvil-5.body': 'The first hunters carried the shrine stones down into the valleys as trophies. Where a stone was lifted, the ground beside it cooled and did not warm again.',
  'codex.lore.rubbing-anvil-6.name': 'Rubbing: the hammer laid down',
  'codex.lore.rubbing-anvil-6.body': 'The last carving is one stroke, a hammer laid across the anvil. Below it, in a smaller hand: the fire is not gone, only waiting to be asked.',
} as const;

export const RUBBING_STRINGS_EN = {
  'rubbing.locked': 'You take the rubbing. The old tongue, unreadable for now.',
  'rubbing.taken': 'Rubbing taken: {title}',
  'codex.lore.anvil-rubbings.name': 'The anvil rubbings',
  'codex.lore.anvil-rubbings.body': 'Twelve carvings are said to survive in the old tongue of the smiths: six on the Last Anvil\'s ridge and six across the Dragonspine, at the hawk nest crags, the hunter cairn, the frozen camp, the glass vein, the vista above the Last Anvil and a ledge reached only by a Leap. Each rubbing you take waits here until the old tongue can be read.',
} as const;

export const WAYSIDE_STRINGS_EN = {
  'wayside.prompt': 'Light the wayside candle',
  'wayside.lit': 'The candle catches and holds.',
} as const;
