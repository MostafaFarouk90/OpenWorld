// Prints the road sight report (K2): `npx vite-node tools/k2-sight.ts [k2|none]`.
import { heightAt } from '../src/terrain/heightfield';
import { sightReport, WALK_SPEED } from '../src/world/poi/act3/sight';
import { k2Sights, shippedSights } from '../src/world/poi/act3/sights';
const sights = process.argv[2] === 'none' ? shippedSights() : [...shippedSights(), ...k2Sights()];
for (const road of ['fen-road', 'spine-road', 'deepgate-track'] as const) {
  const r = sightReport(heightAt, road, sights);
  console.log(`${road} ${Math.round(r.length)} m: blind ${r.blind} samples; worst ${r.worst.metres} m (${Math.round(r.worst.metres / WALK_SPEED)} s) at ${r.worst.from}-${r.worst.to}`);
  console.log('  gaps>150:', r.gaps.filter((g) => g.metres > 150).map((g) => `${g.from}-${g.to}`).join(' '));
}
