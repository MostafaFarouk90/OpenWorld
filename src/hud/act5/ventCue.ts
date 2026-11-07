// Act 5 N9 (plans/act5-N9.md section 2): the nearest cooling vent's state and a bearing. Pure. N3's `lava.vents()` supplies the
// list; with no list, or no vent near, nothing shows. By distance, not by area (areas are named-only in v0.9).
export const VENT_CUE_RANGE_M = 20;

export interface VentReading {
  id: string;
  at: { x: number; y?: number; z: number };
  state: 'open' | 'closed';
  /** Seconds until the state changes, when known. */
  inS?: number;
}

export interface VentCueView {
  id: string;
  textKey: 'hud.vent.open' | 'hud.vent.closed' | 'hud.vent.openNoTime' | 'hud.vent.closedNoTime';
  params?: { s: number };
  distance: number;
  /** Radians, clockwise from straight ahead (0 dead ahead, +90 degrees to the right). */
  bearing: number;
}

export function ventCue(
  vents: readonly VentReading[] | undefined,
  player: { x: number; z: number },
  cameraYaw: number,
  range = VENT_CUE_RANGE_M,
): VentCueView | null {
  let best: { v: VentReading; d: number } | null = null;
  for (const v of vents ?? []) {
    if (!v || !v.at || !Number.isFinite(v.at.x) || !Number.isFinite(v.at.z)) continue;
    const d = Math.hypot(v.at.x - player.x, v.at.z - player.z);
    if (d <= range && (!best || d < best.d)) best = { v, d };
  }
  if (!best) return null;
  const { v, d } = best;
  // Yaw 0 faces -Z: a vent straight ahead is at -z, bearing 0.
  // A positive camera yaw turns left (ShelterArrow's convention), so the arrow turns by yaw minus the facing yaw of the vent.
  const face = Math.atan2(-(v.at.x - player.x), -(v.at.z - player.z));
  let bearing = (Number.isFinite(cameraYaw) ? cameraYaw : 0) - face;
  bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
  const timed = typeof v.inS === 'number' && Number.isFinite(v.inS);
  const open = v.state === 'open';
  return {
    id: v.id,
    textKey: open ? (timed ? 'hud.vent.open' : 'hud.vent.openNoTime') : timed ? 'hud.vent.closed' : 'hud.vent.closedNoTime',
    ...(timed ? { params: { s: Math.max(0, Math.ceil(v.inS as number)) } } : {}),
    distance: Math.round(d),
    bearing,
  };
}
