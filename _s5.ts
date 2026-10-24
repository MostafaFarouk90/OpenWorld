import { heightAt } from './src/terrain/heightfield';
const lanes: [string, number, number, number, number][] = [
  ['summit-aerie', 14450, 15900, 15500, 15980],
  ['summit-skyhold', 13450, 15560, 12230, 15200],
  ['skyhold-hawk', 12150, 15050, 11420, 13080],
  ['anvil-rime', 14640, 13860, 13000, 13300],
  ['rime-lodge', 13020, 13270, 13600, 11950],
];
for (const [id, ax, az, bx, bz] of lanes) {
  const L = Math.hypot(bx - ax, bz - az); const h0 = heightAt(ax, az) + 1.8; let def = 0, at = 0, lo = Infinity;
  for (let s = 0; s <= L; s += 5) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L; const g = heightAt(x, z); lo = Math.min(lo, g); const d = g + 10 - (h0 - s / 4); if (d > def) { def = d; at = s; } }
  console.log(id, 'L', L.toFixed(0), 'h0', h0.toFixed(0), 'land', heightAt(bx, bz).toFixed(0), 'deficit', def.toFixed(0), 'at', at, 'lowest', lo.toFixed(0), 'ratio needed', (L / Math.max(1, h0 - heightAt(bx, bz))).toFixed(1));
}
