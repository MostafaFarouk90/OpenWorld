/**
 * Dev-only `?bellows=1`: places the real Weeping Bellows puzzle at a stand-in spot so it can be played (and its pressure
 * bar smoked) before A4's cavern exists. Off unless the URL carries the flag; A4's own cavern anchor always wins.
 */
export function devBellowsRequested(search: string | undefined): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('bellows') === '1';
  } catch {
    return false;
  }
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The stand-in centre: 20 m north of the Deepgate shaft-head stone when it exists, else 14 m ahead of the player. */
export function devBellowsCenter(stone: Vec3 | undefined, playerFeet: Vec3): Vec3 {
  return stone ? { x: stone.x, y: stone.y, z: stone.z - 20 } : { x: playerFeet.x, y: playerFeet.y, z: playerFeet.z - 14 };
}
