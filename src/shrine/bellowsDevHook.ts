/**
 * Dev-only `?bellows=1&new`: places the real Weeping Bellows puzzle at a stand-in spot so it can be played (and its pressure
 * bar smoked) before A4's cavern exists. Like `?act1=`: it needs `&new` (a fresh game whose saves are held for the session,
 * so a dev solve never reaches the real save) and it is refused outright in a production build (review-b M1). A4's own
 * cavern anchor wins: if it appears after the stand-in was placed, the puzzle is rebuilt there (review-b L3).
 */
export function parseBellows(search: string | undefined): { fresh: true } | { error: string } | null {
  if (!search) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  if (params.get('bellows') !== '1') return null;
  if (!params.has('new')) return { error: 'needs &new so the stand-in puzzle never runs over a real save' };
  return { fresh: true };
}

/** True when the dev hook runs: a dev build (`dev`, default `import.meta.env.DEV`) and a valid `?bellows=1&new`. */
export function devBellowsRequested(search: string | undefined, dev: boolean = import.meta.env.DEV): boolean {
  if (!dev) return false;
  const parsed = parseBellows(search);
  return parsed !== null && !('error' in parsed);
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
