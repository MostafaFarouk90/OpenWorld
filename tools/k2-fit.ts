// K2 fit helper: for each Act 3 POI, searches its stretch (arc ±150 m, sides, facings) for the nearest spot with no problems.
// `npx vite-node tools/k2-fit.ts [id]`; prints the frozen value to paste into place.ts.
import { heightAt } from '../src/terrain/heightfield';
import { ACT3_POI_PLACEMENTS, placeA3, type A3Placement } from '../src/world/poi/act3/place';
import { siteProblems } from '../src/world/poi/act3/fit';
import { A3_NEIGHBOUR_LAYOUTS } from '../src/world/poi/act3/neighbours';

const only = process.argv[2];
const placedOthers = ACT3_POI_PLACEMENTS.map(placeA3);
for (const p of ACT3_POI_PLACEMENTS) {
  if (only && p.site.id !== only) continue;
  const cur = siteProblems(placeA3(p), heightAt, { layouts: A3_NEIGHBOUR_LAYOUTS, others: placedOthers });
  if (!cur.length) {
    console.log(`${p.site.id}: ok as is`);
    continue;
  }
  console.log(`${p.site.id}: ${cur.slice(0, 6).join('; ')}`);
  let best: { w: A3Placement['where']; score: number } | null = null;
  const w0 = p.where;
  const cands: A3Placement['where'][] = [];
  if ('road' in w0) {
    const sides = [w0.side, ...[-110, -90, -70, -55, -40, 40, 55, 70, 90, 110].filter((v) => v !== w0.side)];
    for (let ds = 0; ds <= 300; ds += 10) for (const sg of ds ? [1, -1] : [1]) for (const side of sides) for (const f of [0, 90, 180, 270]) cands.push({ ...w0, s: Math.max(0, w0.s + sg * ds), side, facingDeg: f });
  } else {
    for (let da = 0; da <= 180; da += 3) for (const sg of da ? [1, -1] : [1]) for (const r of [w0.radius, w0.radius - 6, w0.radius + 6, w0.radius - 12, w0.radius + 12, w0.radius + 30, w0.radius + 60]) for (const f of [0, 90, 180, 270]) cands.push({ ...w0, mere: w0.mere + sg * da, radius: r, facingDeg: f });
  }
  for (const w of cands) {
    const probs = siteProblems(placeA3({ ...p, where: w }), heightAt, { layouts: A3_NEIGHBOUR_LAYOUTS, others: placedOthers });
    if (!probs.length) {
      best = { w, score: 0 };
      break;
    }
  }
  console.log(best ? `  -> ${JSON.stringify(best.w)}` : '  -> none found');
}
