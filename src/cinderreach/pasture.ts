// Fellwalker Pasture: Ketta's sheepfold, the flock's anchors (cap 8, 6 after the fox branch), the three fog hollows
// (anchors and trigger volumes for A6b's herd), the R05 tracks and the two ways home, and the Kindling Dell, a hidden
// hollow in the pasture (design 7.9) that A9 builds on `cinderreach.dell.*`.
import { roadPoint } from '../terrain/shape/roadPoint';
import type { LayoutData } from '../region/layoutTypes';
import { a, numbered, open, polar, ring, sphere } from './helpers';
import { PASTURE } from './sites';
import { SITES_FIT } from './sitesFit';

const lerp = (p: { x: number; z: number }, q: { x: number; z: number }, t: number) => [p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t] as const;
const trackAt = (s: number) => {
  const p = roadPoint('fellwalker-track', s);
  return [p.x, p.z] as const;
};

export function pastureLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const fold = SITES_FIT.fold;
  const dell = SITES_FIT.dell;
  const hollows = SITES_FIT.hollows;
  return {
    anchors: [
      a('npc-post.ketta.pasture', fold.x, fold.z - 8, 0, ['npc-post']),
      ...numbered('cinderreach.post.pasture', [[fold.x + 10, fold.z - 8]], ['npc-post'], 0),
      // The ambient flock round the fold (8 on the safe branch; A12 and A6b take the first 6 after the fox branch).
      ...numbered('cinderreach.pasture.flock', [...ring(fold.x, fold.z, 20, 4, 20), ...ring(fold.x, fold.z, 29, 4, 65)], ['spawn']),
      ...numbered('cinderreach.pasture.hollow', hollows.map((h) => [h.x, h.z] as const), ['objective']),
      // R05: tracks between each hollow and the fold, the safe road (the end of Ketta's track), the fox's way, the fold.
      ...numbered('cinderreach.r05.track', hollows.map((h) => lerp(h, fold, 0.3)), ['objective']),
      ...numbered('cinderreach.r05.road', [500, 560, 620, 680, 740, 790].map(trackAt), ['objective']),
      ...numbered('cinderreach.r05.fox', [0.25, 0.5, 0.75, 0.9].map((t) => lerp(fold, dell, t)), ['objective']),
      a('cinderreach.r05.fox', ...lerp(fold, dell, 0.1), 180, ['spawn']),
      a('cinderreach.r05.home', fold.x, fold.z + 8, 180, ['objective']),
      // The Kindling Dell (A9 builds the bed, the foxes and the buff on these).
      a('cinderreach.dell.entrance', ...lerp(dell, fold, 0.12), 0, ['poi']),
      a('cinderreach.dell.bed', dell.x, dell.z, 0, ['poi']),
      // Ambient spawns: hounds on the pasture's south-west rim (compass 200 to 280, well away from Ketta's fold: they stood 11 m
      // from her talk spot and bit during dialogue), wraiths in the hollows, the cache fox by the dell.
      ...numbered('cinderreach.spawn.pasture', [0, 1, 2].map((i) => polar(PASTURE.x, PASTURE.z, 200 + 40 * i, 90)), ['spawn']),
      ...numbered('cinderreach.spawn.hollow', hollows.map((h) => [h.x + 6, h.z + 6] as const), ['spawn']),
      a('cinderreach.spawn.fox.1', dell.x + 30, dell.z + 10, 0, ['spawn']),
    ],
    triggers: [
      ...hollows.map((h, i) => sphere(`trg.cinderreach.pasture.hollow.${i + 1}`, h.x, h.z, 24)),
      sphere('trg.cinderreach.dell', dell.x, dell.z, 16),
    ],
    structures: [open('cinderreach-pasture-fold', 'yard-fence', fold.x, fold.z, 10, 10)],
  };
}
