import type { Act4SfxKey } from './act4Sfx';

// What plays each Act 4 sound. The move ids, kinds and the husk skin are L8's proposals to the threads that build the
// creatures and bosses (L5, L6); a rename there is a one-line change here. Keys others play by name (the glass pillars,
// the Last Gong, the M38 sting, Ebba's music box and the dream hum) are not in these tables.

/** `telegraph` move ids and the wind-up sound each plays. */
export const MOVE_SFX_ACT4: Readonly<Record<string, Act4SfxKey>> = {
  'bellows.punch': 'sfx.engine.piston',
  'bellows.steam': 'sfx.engine.steam',
  'bellows.volley': 'sfx.engine.coalshot',
  'huskknight.raise': 'sfx.huskknight.raise',
  'huskknight.rush': 'sfx.huskknight.rush',
  'strider.lunge': 'sfx.strider.lunge',
  'gnats.sting': 'sfx.gnats.sting',
  'eormen.blades': 'sfx.eormen.blades',
  'eormen.toll': 'sfx.eormen.toll',
};

/** `actor.died` kinds and their death cue. */
export const DIED_SFX_ACT4: Readonly<Record<string, Act4SfxKey>> = {
  'waste-strider': 'sfx.strider.die',
  'husk-knight': 'sfx.husk.collapse',
  'cinder-gnat-swarm': 'sfx.gnats.scatter',
};

/** Kinds that carry a loop while alive (attached to the actor, stopped when it dies or despawns). */
export const LOOP_BY_KIND_ACT4: Readonly<Record<string, Act4SfxKey>> = {
  'waste-strider': 'sfx.strider.click',
  'cinder-gnat-swarm': 'sfx.gnats.buzz',
  'bellows-engine': 'sfx.engine.idle',
};

/** The enemy skin whose actors are husks (L0's `EnemySkinId`): they rise, rasp on every telegraph and crumble. */
export const HUSK_SKIN = 'wraith-husk';

export const HUSK_SFX = {
  rise: 'sfx.husk.rise',
  rasp: 'sfx.husk.rasp',
  collapse: 'sfx.husk.collapse',
} as const satisfies Record<string, Act4SfxKey>;

/** Boss ids whose poise breaks (`boss.phase`) and releases play a cue: the engine vents, Eormen's toll rises away. */
export const BOSS_PHASE_SFX_ACT4: Readonly<Record<string, Act4SfxKey>> = { 'bellows-engine': 'sfx.engine.vent' };
export const BOSS_RELEASED_SFX_ACT4: Readonly<Record<string, Act4SfxKey>> = { eormen: 'sfx.eormen.release' };

/** The storm, rope-line and shelter cues (L0 weather events). */
export const WEATHER_SFX = {
  loop: 'sfx.storm.loop',
  muffled: 'sfx.storm.muffled',
  onset: 'sfx.storm.onset',
  warning: 'sfx.storm.warning',
  gust: 'sfx.storm.gust',
  creak: 'sfx.rope.creak',
  flap: 'sfx.shelter.flap',
} as const satisfies Record<string, Act4SfxKey>;

/** Seconds between storm gusts (a seeded pick in this range); a rope creak rides every third gust. */
export const GUST_MIN_S = 4;
export const GUST_MAX_S = 9;
export const CREAK_EVERY_GUSTS = 3;
