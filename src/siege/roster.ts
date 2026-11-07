// The snapshot readers (plan 2.4, plans/act5-N4.md section 10): who stands at the siege, read from the M52 favour
// snapshot and the choice flags. Pure: exported for N9's chips and recap, N10's war table and N6 PR 2's spirit-flames.
import type { AllySquadRole } from '../caldera/siege';
import { bandAt, type FavourBand, type FavourTrack } from '../state/favour';

export type SiegeId = 'm52' | 'r27';
export const SIEGE_IDS: readonly SiegeId[] = ['m52', 'r27'];

/** How a squad's bodies look (a tint on the shipped Knight-rig NPC body, or a named NPC's own def). */
export type SquadLook = 'halvard' | 'grisel' | 'watch' | 'ashwalker' | 'steward' | 'named';

export interface RosterSquad {
  /** Stable squad id (`hud.siege.ally.<id>` names it). */
  id: string;
  role: AllySquadRole;
  members: number;
  /** The post anchor the squad forms on (formation offsets round it). */
  post: string;
  look: SquadLook;
  /** NPC ids of named members, first members first (Rook, Edric, Wulfhild, Wenna). */
  named?: readonly string[];
  /** On a wall or in the back rank: no shadow on Low and Medium, never a taunter. */
  wall?: boolean;
  /** Edric's light blade: the duellist's faster swing. */
  duellist?: boolean;
  /** The favour track that set its size (absent: a choice flag did). */
  track?: FavourTrack;
}

export type DragonId = 'ysmeryth' | 'hathren' | 'orsk' | 'hill-wyrm';

export interface RosterDragon {
  id: DragonId;
  /** 1-based wave it arrives on. */
  arriveWave: number;
}

export interface SiegeRoster {
  siegeId: SiegeId;
  squads: RosterSquad[];
  dragons: RosterDragon[];
  /** Hearthbound dragons: a breath strike on the first ram. */
  firstRamBreath: boolean;
  /** Wystan's mounted sally in wave 3. */
  sally: boolean;
  /** R19's engineers mend the gate between waves. */
  engineers: boolean;
  /** Ashwalkers at Hearthbound: no siege storm. */
  stormCover: boolean;
  /** Oswin's supply band (undefined: no Oswin banner, no crates) and R26's road. */
  supply: { band: FavourBand; road: 'fast' | 'long' } | null;
  /** Houses whose banner holds at the gate (F3). */
  banners: ('halvard' | 'oswin' | 'grisel')[];
  /** The bands read (for the HUD and tests); undefined when no snapshot was taken (read as Cold). */
  bands: Record<FavourTrack, FavourBand>;
  /** True when the M52 snapshot was missing (never in play: M52 takes it at its start). */
  snapshotMissing: boolean;
}

export interface RosterFlags {
  getFlag(key: string): unknown;
}

export const ROSTER_FLAGS = {
  delegate: (house: 'halvard' | 'oswin' | 'grisel') => `story.m36.delegate.${house}`,
  m31: 'story.m31.choice',
  r10: 'story.r10.choice',
  r11: 'story.r11.choice',
  r19: 'story.r19.choice',
  r21: 'story.r21.choice',
  r22: 'story.r22.choice',
  r23: 'story.r23.choice',
  r24: 'story.r24.choice',
  r26: 'story.r26.choice',
} as const;

/** R19's four companies; `story.r19.choice` is a sorted pair joined with '-' (L2's r19Pair). */
export const R19_COMPANY_IDS = ['archers', 'pikes', 'horse', 'engineers'] as const;
export type R19Company = (typeof R19_COMPANY_IDS)[number];

export function r19Pair(choice: unknown): R19Company[] {
  if (typeof choice !== 'string') return [];
  const parts = choice.split('-');
  if (parts.length !== 2 || parts[0] === parts[1]) return [];
  return parts.every((p) => (R19_COMPANY_IDS as readonly string[]).includes(p)) ? (parts as R19Company[]) : [];
}

/** Squad sizes by band (plan 2.4). */
export const ROSTER_SIZES = {
  halvardArchers: { cold: 0, banked: 6, stoked: 12, hearthbound: 12 },
  r19Archers: 4,
  r19Pikes: 6,
  griselMiners: { cold: 0, banked: 4, stoked: 8, hearthbound: 8 },
  r21Miners: 4,
  ashwalkers: { cold: 4, banked: 4, stoked: 10, hearthbound: 10 },
  rookWatch: 8,
  tunnelGarrison: 4,
} as const;

export const SIEGE_POSTS = {
  wallLeft: 'caldera.siege.wall.left',
  wallRight: 'caldera.siege.wall.right',
  court: 'caldera.siege.court',
  /** Just inside the gate, at its middle and its two ends: derived from the gate line when N1 places no anchor. */
  gateInner: 'caldera.siege.gate.inner',
  gateLeft: 'caldera.siege.gate.inner.left',
  gateRight: 'caldera.siege.gate.inner.right',
  lee: 'caldera.siege.lee',
  banner: 'caldera.siege.banner',
} as const;

const TRACKS: readonly FavourTrack[] = ['halvard', 'oswin', 'grisel', 'dragons', 'ashwalkers'];

function bandsOf(f: RosterFlags): { bands: Record<FavourTrack, FavourBand>; missing: boolean } {
  let missing = false;
  const out = {} as Record<FavourTrack, FavourBand>;
  for (const t of TRACKS) {
    const b = bandAt(f, 'm52', t);
    if (b === undefined) missing = true;
    out[t] = b ?? 'cold';
  }
  return { bands: out, missing };
}

const won = (f: RosterFlags, house: 'halvard' | 'oswin' | 'grisel') => f.getFlag(ROSTER_FLAGS.delegate(house)) === 'won';

/** M52's roster (plan 2.4). */
export function m52Roster(f: RosterFlags): SiegeRoster {
  const { bands, missing } = bandsOf(f);
  const squads: RosterSquad[] = [];
  const banners: SiegeRoster['banners'] = [];
  const r19 = r19Pair(f.getFlag(ROSTER_FLAGS.r19));

  // Halvard: archers by band; R19's companies only under the banner.
  let sally = false;
  let engineers = false;
  if (won(f, 'halvard')) {
    banners.push('halvard');
    const b = bands.halvard;
    const half = ROSTER_SIZES.halvardArchers[b] / 2;
    if (half > 0) {
      squads.push({ id: 'halvard-archers-left', role: 'archers', members: half, post: SIEGE_POSTS.wallLeft, look: 'halvard', wall: true, track: 'halvard' });
      squads.push({ id: 'halvard-archers-right', role: 'archers', members: half, post: SIEGE_POSTS.wallRight, look: 'halvard', wall: true, track: 'halvard' });
    }
    if (r19.includes('archers')) {
      squads.push({ id: 'r19-archers', role: 'archers', members: ROSTER_SIZES.r19Archers, post: SIEGE_POSTS.wallRight, look: 'halvard', wall: true });
    }
    if (r19.includes('pikes')) squads.push({ id: 'r19-pikes', role: 'pikes', members: ROSTER_SIZES.r19Pikes, post: SIEGE_POSTS.gateInner, look: 'halvard' });
    engineers = r19.includes('engineers');
    sally = b === 'hearthbound' || (b === 'stoked' && r19.includes('horse'));
  }

  // Oswin: the crates (N7's siegeSupply reads band and road).
  let supply: SiegeRoster['supply'] = null;
  if (won(f, 'oswin')) {
    banners.push('oswin');
    if (bands.oswin !== 'cold') supply = { band: bands.oswin, road: f.getFlag(ROSTER_FLAGS.r26) === 'long' ? 'long' : 'fast' };
  }

  // Grisel: miners by band, R21 `all` +4 at any band; sappers at Hearthbound.
  if (won(f, 'grisel')) {
    banners.push('grisel');
    const b = bands.grisel;
    const n = ROSTER_SIZES.griselMiners[b] + (f.getFlag(ROSTER_FLAGS.r21) === 'all' ? ROSTER_SIZES.r21Miners : 0);
    // Sappers stand at the gate (they stall the ram there); miners hold the court.
    const sappers = b === 'hearthbound';
    if (n > 0) squads.push({ id: 'grisel-miners', role: sappers ? 'sappers' : 'melee', members: n, post: sappers ? SIEGE_POSTS.gateInner : SIEGE_POSTS.court, look: 'grisel', track: 'grisel' });
  }

  // Ashwalkers: F8 All only.
  let stormCover = false;
  if (f.getFlag(ROSTER_FLAGS.r24) === 'all') {
    const b = bands.ashwalkers;
    squads.push({ id: 'ashwalkers', role: 'melee', members: ROSTER_SIZES.ashwalkers[b], post: SIEGE_POSTS.gateRight, look: 'ashwalker', named: ['wulfhild'], track: 'ashwalkers' });
    stormCover = b === 'hearthbound';
  }

  // Rook's watch (F7) and Edric (R22).
  const pub = f.getFlag(ROSTER_FLAGS.r23) === 'public';
  squads.push({ id: 'rook-watch', role: 'melee', members: pub ? 1 + ROSTER_SIZES.rookWatch : 1, post: SIEGE_POSTS.gateLeft, look: 'watch', named: ['rook'] });
  const light = f.getFlag(ROSTER_FLAGS.r22) === 'light';
  squads.push(
    light
      ? { id: 'edric', role: 'melee', members: 1, post: SIEGE_POSTS.lee, look: 'named', named: ['edric'], duellist: true }
      : { id: 'edric', role: 'pikes', members: 1, post: SIEGE_POSTS.banner, look: 'named', named: ['edric'] },
  );

  // Dragons (F2 sets the wave, the dragons' band who comes, R11 the hill wyrm).
  const arrive = f.getFlag(ROSTER_FLAGS.m31) === 'yielded' ? 2 : 3;
  const d = bands.dragons;
  const who: DragonId[] = d === 'cold' ? ['ysmeryth'] : d === 'banked' ? ['ysmeryth', 'hathren'] : ['ysmeryth', 'hathren', 'orsk'];
  if (f.getFlag(ROSTER_FLAGS.r11) === 'spared') who.push('hill-wyrm');
  const dragons = who.map((id) => ({ id, arriveWave: arrive }));

  return { siegeId: 'm52', squads, dragons, firstRamBreath: d === 'hearthbound', sally, engineers, stormCover, supply, banners, bands, snapshotMissing: missing };
}

export const TUNNEL_POSTS = {
  posts: (n: number) => `caldera.int.tunnel.post.${n}`,
} as const;

/** R27's garrison (plan 2.7: F5 miners, stewards or both two each; Wenna always). */
export function r27Roster(f: RosterFlags): SiegeRoster {
  const { bands, missing } = bandsOf(f);
  const r10 = f.getFlag(ROSTER_FLAGS.r10);
  const squads: RosterSquad[] = [{ id: 'wenna', role: 'melee', members: 1, post: TUNNEL_POSTS.posts(1), look: 'named', named: ['wenna'] }];
  const n = ROSTER_SIZES.tunnelGarrison;
  if (r10 === 'miners') squads.push({ id: 'tunnel-miners', role: 'melee', members: n, post: TUNNEL_POSTS.posts(2), look: 'grisel' });
  else if (r10 === 'stewards') squads.push({ id: 'tunnel-stewards', role: 'healers', members: n, post: TUNNEL_POSTS.posts(5), look: 'steward' });
  else if (r10 === 'compromise') {
    squads.push({ id: 'tunnel-miners', role: 'melee', members: n / 2, post: TUNNEL_POSTS.posts(2), look: 'grisel' });
    squads.push({ id: 'tunnel-stewards', role: 'healers', members: n / 2, post: TUNNEL_POSTS.posts(5), look: 'steward' });
  }
  return { siegeId: 'r27', squads, dragons: [], firstRamBreath: false, sally: false, engineers: false, stormCover: false, supply: null, banners: [], bands, snapshotMissing: missing };
}

/** The roster of a siege (pure). */
export function siegeRoster(f: RosterFlags, siegeId: SiegeId): SiegeRoster {
  return siegeId === 'm52' ? m52Roster(f) : r27Roster(f);
}

/** Bodies the roster stands (the frame budget's count). */
export function rosterBodies(r: SiegeRoster): number {
  return r.squads.reduce((n, s) => n + s.members, 0);
}
