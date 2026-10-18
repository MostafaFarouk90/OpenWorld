export const WARDEN_STRINGS_EN: Record<string, string> = {
  'skill.warden.cleavingSwing.name': 'Cleaving Swing',
  'skill.warden.cleavingSwing.desc': 'Attack 1 hits every enemy in front of you, not only the one under the blade. Passive.',
  'skill.warden.deepWound.name': 'Deep Wound',
  'skill.warden.deepWound.desc': 'Axe hits cause bleeding for 5 seconds. Passive.',
  'skill.warden.whirlingHew.name': 'Whirling Hew',
  'skill.warden.whirlingHew.desc': 'A spin attack with a full circle of reach.',
  'skill.warden.skullsplitter.name': 'Skullsplitter',
  'skill.warden.skullsplitter.desc': 'A heavy overhead chop that does double damage to staggered targets.',
  'skill.warden.wyrmbreaker.name': 'Wyrmbreaker',
  'skill.warden.wyrmbreaker.desc': 'A charged chop that cracks armour and splits the ground.',

  'skill.warden.thickSkin.name': 'Thick Skin',
  'skill.warden.thickSkin.desc': 'Your maximum health is 10% higher. Passive.',
  'skill.warden.boulderShoulder.name': 'Boulder Shoulder',
  'skill.warden.boulderShoulder.desc': 'Charge with your shoulder. Enemies in the way are shoved and their guards are broken. Costs Ember.',
  'skill.warden.gritTeeth.name': 'Grit Teeth',
  'skill.warden.gritTeeth.desc': 'For 4 seconds after a stagger you take half damage.',
  'skill.warden.earthroot.name': 'Earthroot',
  'skill.warden.earthroot.desc': 'Plant the axe to become immovable and return a shockwave when struck.',
  'skill.warden.mountainUnmoved.name': 'Mountain Unmoved',
  'skill.warden.mountainUnmoved.desc': 'For 10 seconds you cannot be knocked back or staggered.',

  'skill.warden.warHowl.name': 'War Howl',
  'skill.warden.warHowl.desc':
    'When a blow takes you below half health you howl, staggering weak enemies (those with little poise left) within 6 metres. Once every 30 seconds; it comes again after you recover above half health. Passive.',
  'skill.warden.emberRage.name': 'Ember Rage',
  'skill.warden.emberRage.desc': 'Taking a hit stokes your Ember. Passive.',
  'skill.warden.bloodChant.name': 'Blood Chant',
  'skill.warden.bloodChant.desc': 'For 20 seconds every ally hit leaves a bleed on the target.',
  'skill.warden.frenziedHearth.name': 'Frenzied Hearth',
  'skill.warden.frenziedHearth.desc': 'Below 30% health you cannot be staggered and each hit restores a sliver of health.',
  'skill.warden.voiceOfTheMountain.name': 'Voice of the Mountain',
  'skill.warden.voiceOfTheMountain.desc': 'A huge howl that stuns every enemy within 12 metres.',

  'buff.warden.axeIgnite': 'Burning axe',

  'classes.drill.warden.attack1': 'Swing the slice, attack 1 ({key}), twice.',
  'classes.drill.warden.attack2': 'Sweep with attack 2 ({key}) twice. It is the quick one.',
  'classes.drill.warden.attack3': 'Bring the axe down with the heavy attack 3 ({key}) twice. It costs stamina.',
  'classes.drill.warden.attack4': 'Finish with the thrust, attack 4 ({key}).',
  'classes.drill.warden.block': 'Hold the line: block ({key}) the sparring soldier twice.',
  'classes.drill.warden.dodge': 'A Warden is slow, so dodge ({key}) early: through the wraith sweep three times.',
  'classes.drill.warden.skills': 'Open your skills ({key}) and learn one. Thick Skin is a good first choice.',
  'classes.drill.warden.ability': 'Use the skill from your ability bar ({key}).',
};

/** Codex how-to entries for the Warden's skills, as data for thread 8's registration point (the codex has none yet). */
export const WARDEN_CODEX_ENTRIES: ReadonlyArray<{ id: string; skillId: string; nameKey: string; bodyKey: string }> = [
  { id: 'howto.warden-boulder-shoulder', skillId: 'warden.boulderShoulder', nameKey: 'codex.howto.warden-boulder-shoulder.name', bodyKey: 'codex.howto.warden-boulder-shoulder.body' },
  { id: 'howto.warden-war-howl', skillId: 'warden.warHowl', nameKey: 'codex.howto.warden-war-howl.name', bodyKey: 'codex.howto.warden-war-howl.body' },
];

export const WARDEN_CODEX_STRINGS_EN: Record<string, string> = {
  'codex.howto.warden-boulder-shoulder.name': 'Boulder Shoulder',
  'codex.howto.warden-boulder-shoulder.body':
    'Put a skill on the ability bar and press its key to charge five metres. Everything in the way takes a shove, and a raised guard breaks. It costs 10 Ember and rests for 10 seconds. It is a gentle player\'s tool: broken guards open enemies to Spare and Calm.',
  'codex.howto.warden-war-howl.name': 'War Howl',
  'codex.howto.warden-war-howl.body':
    'When you drop below half health the Warden howls by itself. Enemies close by whose poise is already low are staggered. It rests for 30 seconds and returns once you are above half health again.',
};
