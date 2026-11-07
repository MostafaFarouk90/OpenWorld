import type { Act5SfxKey } from './act5Sfx';

// The Act 5 sound tables (N8): each kind of trigger in one place, so a rename by N3, N4, N5 or N6 is a one-line change.

/** Telegraphed move ids to sounds, played at the attacker (proposals until N4 and N6 name theirs). */
export const MOVE_SFX_ACT5: Readonly<Record<string, Act5SfxKey>> = {
  'dragon.breath': 'sfx.dragon.breath',
  'vey.clash': 'sfx.vey.clash',
  'ulthred.hammer': 'sfx.ulthred.hammer',
};

/** The siege's ram events (proposed ids, `{ siegeId }`; N4 names its own) to sounds. */
export const RAM_SFX_ACT5: Readonly<Record<string, Act5SfxKey>> = {
  'siege.ram.creak': 'sfx.ram.creak',
  'siege.ram.hit': 'sfx.ram.hit',
  'siege.ram.stall': 'sfx.ram.stall',
};

/** Arena pieces (`arena.piece`) that sound: the Hammer Hall's floor dropping. A piece whose state is one of `ARENA_REST_STATES` has not moved. */
export const ARENA_DROP_PIECE = /floor/;
export const ARENA_REST_STATES: readonly string[] = ['up', 'start', 'raised', 'closed', 'rest', 'idle'];

/** The gate's health, as a percentage remaining, at which a crack (not a hit) plays when it is crossed on the way down. */
export const GATE_CRACK_PCT: readonly number[] = [50, 20];

/** How close (metres) the player must be to lava or an open vent for its loop to run. */
export const LAVA_LOOP_RANGE_M = 12;
export const VENT_LOOP_RANGE_M = 14;
/** Seconds between the proximity checks. */
export const LOOP_POLL_S = 0.25;

/** Siege dragons announce themselves with a flyby when their `siege.ally.arrived` id mentions a dragon. */
export const DRAGON_ALLY_ID = /dragon|wyrm|ysmeryth/i;
