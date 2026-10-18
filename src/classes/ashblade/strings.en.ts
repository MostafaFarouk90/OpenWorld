import { ASH_CLOUD, ASH_DRIFT, BLEEDING_EMBER, SPARK_DODGE } from './tuning';

/** Ashblade strings: skills, K-menu branches, the drill and the how-to entry (`ctx.strings.register('en', …)`). */
export const ASHBLADE_STRINGS_EN: Record<string, string> = {
  'hud.skills.branch.duskedge': 'Duskedge',
  'hud.skills.branch.smokecloak': 'Smokecloak',
  'hud.skills.branch.flicker': 'Flicker',

  'skill.ashblade.backSlit.name': 'Back-Slit',
  'skill.ashblade.backSlit.desc': 'Dagger hits from behind an enemy deal double damage.',
  'skill.ashblade.bleedingEmber.name': 'Bleeding Ember',
  'skill.ashblade.bleedingEmber.desc': `Your daggers leave a glowing wound: ${BLEEDING_EMBER.dps} ignite damage a second for ${BLEEDING_EMBER.seconds} seconds.`,
  'skill.ashblade.twinFangs.name': 'Twin Fangs',
  'skill.ashblade.twinFangs.desc': 'A rapid dual strike. Not yet available.',
  'skill.ashblade.cinderMark.name': 'Cinder Mark',
  'skill.ashblade.cinderMark.desc': 'Mark an enemy so every attack crits. Not yet available.',
  'skill.ashblade.deathByAThousandSparks.name': 'Death by a Thousand Sparks',
  'skill.ashblade.deathByAThousandSparks.desc': 'A three second flurry of teleporting strikes. Not yet available.',

  'skill.ashblade.quietSoles.name': 'Quiet Soles',
  'skill.ashblade.quietSoles.desc': 'Your footsteps do not alert guards.',
  'skill.ashblade.ashCloud.name': 'Ash Cloud',
  'skill.ashblade.ashCloud.desc': `Throw a smoke bomb ahead of you. Its cloud blocks sight for ${ASH_CLOUD.seconds} seconds. Costs ${ASH_CLOUD.emberCost} Ember.`,
  'skill.ashblade.sootCloak.name': 'Soot Cloak',
  'skill.ashblade.sootCloak.desc': 'Turn invisible for 5 seconds after a dodge. Not yet available.',
  'skill.ashblade.decoyFootprints.name': 'Decoy Footprints',
  'skill.ashblade.decoyFootprints.desc': 'Leave a decoy footprint. Not yet available.',
  'skill.ashblade.ghostOfTheHearth.name': 'Ghost of the Hearth',
  'skill.ashblade.ghostOfTheHearth.desc': 'Vanish for 12 seconds. Not yet available.',

  'skill.ashblade.quickSlip.name': 'Quick Slip',
  'skill.ashblade.quickSlip.desc': 'Your dodge carries you 20% further.',
  'skill.ashblade.sparkDodge.name': 'Spark Dodge',
  'skill.ashblade.sparkDodge.desc': `A dodge that avoids a hit throws fire sparks: enemies within ${SPARK_DODGE.radius} metres ignite for ${SPARK_DODGE.seconds} seconds.`,
  'skill.ashblade.wallSkitter.name': 'Wall Skitter',
  'skill.ashblade.wallSkitter.desc': 'Run along walls briefly. Not yet available.',
  'skill.ashblade.phoenixRoll.name': 'Phoenix Roll',
  'skill.ashblade.phoenixRoll.desc': 'Dodging through fire clears Burn. Not yet available.',
  'skill.ashblade.flickerStrike.name': 'Flicker Strike',
  'skill.ashblade.flickerStrike.desc': 'Dash through enemies. Not yet available.',

  'classes.drill.ashblade.attack1': 'Gerta: "Quick and quiet. Key 1, a slash from both blades."',
  'classes.drill.ashblade.attack2': 'Gerta: "Follow it up. Key 2, a second slash from the other side."',
  'classes.drill.ashblade.attack3': 'Gerta: "Cross them. Key 3 is the heavy chop, and it costs stamina."',
  'classes.drill.ashblade.attack4': 'Gerta: "Finish it. Key 4, a double stab."',
  'classes.drill.ashblade.block': 'Gerta: "Daggers are poor shields, so block late and block seldom. Hold the block key against the dummy."',
  'classes.drill.ashblade.dodge': 'Gerta: "You live by your feet. Dodge the sweep."',
  'classes.drill.ashblade.skills': 'Gerta: "Open the skills menu and learn something. Duskedge cuts, Smokecloak hides, Flicker moves."',
  'classes.drill.ashblade.ability': 'Gerta: "If you learned an active skill, put it on the bar and use it."',

  'codex.howto.ashblade-craft.name': "The Ashblade's craft",
  'codex.howto.ashblade-craft.body': [
    `Ashblades fight with two daggers and win by being where the enemy is not. Strike from behind for double damage (Back-Slit).`,
    `Press G for the Heartshard Surge: you turn to drifting ash for ${ASH_DRIFT.seconds} seconds and cannot be hurt, then step out behind an enemy and strike it. Deeper into the Blaze, the drift strikes two.`,
    `Smokecloak keeps you unseen: Quiet Soles silences your steps and Ash Cloud hides you for a few seconds.`,
  ].join(' '),
};
