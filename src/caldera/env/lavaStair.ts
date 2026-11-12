// Act 5 N1 PR 3: the Lava Stair's six channels for M48 (plan 2.7; N10's quest, N3's lava). Pure: the defs from N10's agreed points
// (src/quests/content/act5/rim/anchors.ts: the lips 2.5 m either side of each channel's centre, the wheels and levers off the road's
// edges) and a height function. The plugin (calderaSet.plugin.ts) registers them with the `lava` service.
//
// Each channel is a ribbon of lava across the stair, 3.6 m wide along it (a 5 m Leap from lip to lip, inside N3's 5.4 m), 9 m across it
// (the road's 6 m, the ribbon's round ends reaching 1.8 m onto each verge), its surface 0.35 m over the ground at its centre, so the whole width burns
// on the stair's 0.18 grade. Channels 1, 3, 4 and 6 have a vent (`vent.stair.<v>`, wheel `m48-<v>`: N10's wheel prop turns it) whose
// crust covers the channel while open; 2 and 5 have a gantry that N10's lever lowers (`story.m48.lever.<l>`): it lies lip to lip and
// the channel's surface drops under it. Every channel is a Surge crossing both ways. The lava is live until M48 completes ("the vents
// roar"); then the volumes go and the gantries stay down.
import type { Vec3 } from '../../physics/PhysicsWorld';
import type { CrustVentDef, LavaFieldDef } from '../lava/types';
import type { SurgeCrossingDef } from '../lava';
import { LAVA_DAMAGE_PCT_PER_S, VENT_CLOSED_S, VENT_OPEN_S } from '../lava';
import { LAVA_STAIR } from '../calderaSites';
import { alongPath } from '../../quests/content/act5/rim/anchors';
import { M48_CHANNEL_S, M48_LIP_M } from '../../quests/content/act5/rim/anchors';
import { M48_LEVER_CHANNELS, M48_LEVER_PULLED, M48_VENT_CHANNELS, M48_VENT_ID } from '../../quests/content/act5/rim/m48.quest';

/** Half the channel's width along the stair (the lips stand at M48_LIP_M, 0.7 m clear). */
export const CHANNEL_HALF_ALONG = 1.8;
/** Half its length across the stair, centreline to each end (a ribbon's round ends add CHANNEL_HALF_ALONG). */
export const CHANNEL_HALF_ACROSS = 3.2;
/** The surface over the ground at the channel's centre. */
export const CHANNEL_SURFACE_LIFT = 0.35;
/** Where a gantry, once down, drops the channel's surface to (under the ground at its centre): the sluice drains it, lip to lip. */
export const GANTRY_SURFACE_DROP = -0.6;
/** The gantry's deck: width, and its top over each lip's ground. */
export const GANTRY_WIDTH = 2.4;
export const GANTRY_DECK_LIFT = 0.08;
/** The flag that ends the live lava. */
export const M48_COMPLETE = 'story.m48.complete';

export const stairChannelVolume = (n: number): string => `lava.stair.chan.${n}`;
export const stairCrossing = (n: number): string => `crossing.stair.${n}`;

type H = (x: number, z: number) => number;
type XZ = readonly [number, number];

export interface StairChannel {
  n: number;
  s: number;
  centre: XZ;
  /** Unit direction down the stair, and across it toward the upslope. */
  dir: XZ;
  up: XZ;
  near: Vec3;
  far: Vec3;
  volume: LavaFieldDef;
  vent?: CrustVentDef;
  crossing: SurgeCrossingDef;
  /** The lever's index (1, 2) when the channel has a gantry. */
  lever?: number;
}

const v3 = (p: XZ, h: H): Vec3 => ({ x: p[0], y: h(p[0], p[1]), z: p[1] });
const add = (p: XZ, d: XZ, k: number): [number, number] => [p[0] + d[0] * k, p[1] + d[1] * k];

/** The six channels, in order down the stair. */
export function stairChannels(h: H): StairChannel[] {
  return M48_CHANNEL_S.map((s, i) => {
    const n = i + 1;
    const { p, dir, up } = alongPath(LAVA_STAIR.points, s);
    const centre: XZ = [p[0], p[1]];
    // The line across, in 0.8 m steps: the surface follows the ground's cross-fall point by point.
    const across: [number, number][] = [];
    const steps = Math.round((2 * CHANNEL_HALF_ACROSS) / 0.8);
    for (let k = 0; k <= steps; k++) across.push(add(centre, up, CHANNEL_HALF_ACROSS - (2 * CHANNEL_HALF_ACROSS * k) / steps));
    const surfaceY = h(centre[0], centre[1]) + CHANNEL_SURFACE_LIFT;
    const near = v3(add(centre, dir, -M48_LIP_M), h);
    const far = v3(add(centre, dir, M48_LIP_M), h);
    const volume: LavaFieldDef = {
      id: stairChannelVolume(n),
      shape: { kind: 'ribbon', points: across, halfWidth: CHANNEL_HALF_ALONG },
      surfaceY,
      // The surface over the ground on the channel's centreline across the stair; along the stair the 0.18 grade moves it 0.32 m.
      profile: across.map(([x, z]) => h(x, z) + CHANNEL_SURFACE_LIFT),
      depth: 2,
      damagePctPerS: LAVA_DAMAGE_PCT_PER_S,
      safeLips: [near, far],
    };
    const v = (M48_VENT_CHANNELS as readonly number[]).indexOf(n);
    const l = (M48_LEVER_CHANNELS as readonly number[]).indexOf(n);
    const vent: CrustVentDef | undefined =
      v >= 0
        ? {
            id: M48_VENT_ID(v + 1),
            at: v3(add(centre, up, CHANNEL_HALF_ACROSS + 1), h),
            openS: VENT_OPEN_S,
            closedS: VENT_CLOSED_S,
            wheel: `m48-${v + 1}`,
            volumeId: volume.id,
            crust: { kind: 'ribbon', points: across, halfWidth: CHANNEL_HALF_ALONG + 0.2 },
          }
        : undefined;
    return {
      n,
      s,
      centre,
      dir,
      up,
      near,
      far,
      volume,
      ...(vent ? { vent } : {}),
      crossing: { id: stairCrossing(n), from: near, to: far },
      ...(l >= 0 ? { lever: l + 1 } : {}),
    };
  });
}

export const gantryLowered = (getBool: (k: string) => boolean, lever: number): boolean => getBool(M48_LEVER_PULLED(lever));
