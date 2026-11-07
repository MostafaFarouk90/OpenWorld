// `?siege=m52|r27[&favour=marshal|keepers|worst]` (or `?act5=m52&new&favour=marshal&siege=m52&siegeFavour=worst` on N1's
// layout, where the Caldera is only open in Act 5): dev only (the `?waves=` pattern, plans/act5-N4.md section 15).
// Writes the preset's choice flags and M52 snapshot when none was taken, defines stand-in anchors round the player for
// any N1 or N2 has not placed, and starts the siege. `worst` is every track Hearthbound with every won choice (the
// frame budget's case, review change i). Compiled out of production builds (import.meta.env.DEV).
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import { ACT5_PRESET_FAVOUR, ACT5_PRESET_FLAGS } from '../quests/act5Jump';
import { FAVOUR_TRACKS, snapshotFlag } from '../state/favour';
import { WAVE_SETS } from '../waves/defs';
import { SIEGE_POSTS, TUNNEL_POSTS, type SiegeId } from './roster';
import { SIEGE_ANCHORS, siegeSetId } from './runner';

export const WORST_FLAGS: Readonly<Record<string, string>> = {
  'story.m31.choice': 'yielded',
  'story.m36.delegate.halvard': 'won',
  'story.m36.delegate.oswin': 'won',
  'story.m36.delegate.grisel': 'won',
  'story.r24.choice': 'all',
  'story.r19.choice': 'archers-pikes',
  'story.r21.choice': 'all',
  'story.r22.choice': 'light',
  'story.r23.choice': 'public',
  'story.r11.choice': 'spared',
  'story.r26.choice': 'fast',
};

/** Writes a preset's flags and its M52 snapshot (only when no snapshot was taken). */
export function applySiegePreset(ctx: Pick<GameContext, 'state'>, preset: string): boolean {
  // `worst` overwrites (it rides on N0's `?act5=m52&new` jump, which takes a preset's snapshot first).
  if (preset !== 'worst' && ctx.state.getFlag(snapshotFlag('m52', 'taken')) === true) return false;
  const flags = preset === 'worst' ? WORST_FLAGS : ACT5_PRESET_FLAGS[preset as 'marshal' | 'keepers'];
  const five = preset === 'worst' ? [95, 95, 95, 95, 95] : ACT5_PRESET_FAVOUR[preset as 'marshal' | 'keepers']?.m52;
  if (!flags || !five) return false;
  for (const [k, v] of Object.entries(flags)) ctx.state.setFlag(k, v);
  FAVOUR_TRACKS.forEach((t, i) => ctx.state.setFlag(snapshotFlag('m52', t), five[i]));
  ctx.state.setFlag(snapshotFlag('m52', 'taken'), true);
  return true;
}

/** Stand-ins round `at` for every anchor the siege reads that the layout lacks (the gate 14 m ahead, -Z). */
export function defineSiegeStandIns(ctx: Pick<GameContext, 'anchors' | 'state'>, siegeId: SiegeId, at: { x: number; y: number; z: number }): number {
  let n = 0;
  const put = (id: string, x: number, z: number, y = 0) => {
    if (ctx.anchors.find(id)) return;
    ctx.anchors.define({ id, position: { x: at.x + x, y: at.y + y, z: at.z + z }, yaw: 0 });
    n++;
  };
  const def = WAVE_SETS[siegeSetId(siegeId, ctx.state)];
  def.barricadeAnchors.forEach((id, i) => put(id, (i - (def.barricadeAnchors.length - 1) / 2) * 5, -14));
  Object.values(def.lanes).forEach((id, i) => put(id, -24 + (i % 5) * 12, -62 - Math.floor(i / 5) * 10));
  if (siegeId === 'm52') {
    put(SIEGE_POSTS.wallLeft, -16, -12, 3);
    put(SIEGE_POSTS.wallRight, 16, -12, 3);
    put(SIEGE_POSTS.court, 0, -6);
    put(SIEGE_POSTS.lee, 4, -4);
    put(SIEGE_POSTS.banner, -4, -4);
    put(SIEGE_ANCHORS.orders.m52, 3, 2);
    put(SIEGE_ANCHORS.crates, -3, 2);
    put(SIEGE_ANCHORS.aid, -8, 6);
    put(SIEGE_ANCHORS.start.m52, 0, 0);
  } else {
    for (let i = 1; i <= 8; i++) put(TUNNEL_POSTS.posts(i), (i - 4.5) * 2, -8);
    put(SIEGE_ANCHORS.orders.r27, 3, 2);
    put(SIEGE_ANCHORS.start.r27, 0, 0);
  }
  return n;
}

const plugin: GamePlugin = {
  id: 'siege-dev',
  dependsOn: ['core', 'siege'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const id = q?.get('siege');
    if (!id) return;
    if (id !== 'm52' && id !== 'r27') {
      console.warn(`[siege-dev] unknown siege '${id}' (m52 or r27)`);
      return;
    }
    // `siegeFavour` (so N0's `&favour=` can carry the jump) else `favour`.
    const preset = q?.get('siegeFavour') ?? q?.get('favour') ?? 'marshal';
    let wait = 2;
    const viaJump = q?.has('act5') === true;
    let started = false;
    let landing: { ready(): boolean } | null = null;
    ctx.systems.add({
      id: 'siege-dev',
      fixedPhase: 'rules',
      order: 901,
      fixedUpdate: (dt) => {
        if (started || ctx.services.get('save')?.loading) return;
        // Under `?act5=m52&new&favour=...` wait for N0's jump to write the snapshot (it lands the player too).
        if (viaJump && ctx.state.getFlag(snapshotFlag('m52', 'taken')) !== true) return;
        wait -= dt;
        if (wait > 0) return;
        // With N1's layout the siege has a start point: go there first (the set runs within its radius of the gate).
        const start = ctx.anchors.find(SIEGE_ANCHORS.start[id]);
        if (start && !landing) {
          landing = ctx.player.teleport(start.position, start.yaw ?? 0);
          return;
        }
        if (landing && !landing.ready()) return;
        started = true;
        console.info(`[siege-dev] preset '${preset}' -> ${String(applySiegePreset(ctx, preset))}`);
        const f = ctx.player.feet;
        console.info(`[siege-dev] stand-in anchors: ${defineSiegeStandIns(ctx, id, { x: f.x, y: f.y, z: f.z })}`);
        console.info(`[siege-dev] start('${id}') -> ${String(ctx.services.get('siege')?.start(id))}`);
      },
    });
  },
};

export default plugin;
