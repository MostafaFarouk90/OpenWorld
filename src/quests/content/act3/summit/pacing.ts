// Pacing rows for the five summit quests (plans/act3-K13-pr2.md section 4), measured on K4's real anchors (the layout and the Frostfang keep's
// interior-local anchors); positions are never written down here. Same builder, speeds and 3/7 travel cap as the lower block's
// (src/quests/content/act3/dragonspine/pacing.ts).
import { ACT3_BEAT_S, F, R, G, D, build, feet, n, paceRow, type Act3PaceRow } from '../dragonspine/pacing';

const NET = (k: number): string => `dragonspine.skyhold.net-anchor.${k}`;
const SKY = (k: number): string => `dragonspine.skyhold.search.${k}`;
const HEARTH_CARVE = (k: number): string => `dragonspine.hearth.carving.${k}`;
const SEARCH_KEEP = (k: number): string => `dragonspine.keep.search.${k}`;

export const SUMMIT_PACE: readonly Act3PaceRow[] = [
  // M31 (the Yield branch): Eadgyth at the shelter, the ride to the summit gate and the talk there, the foot climb past the Hearth through the three
  // Leap ledges (claw ledge and horn on the way), the scale at the arena, the trial (two rounds), and the walk back down to Eadgyth at the Hearth
  build('m31', 60, 'waystone.rime-pass', [
    F('npc-post.eadgyth.fire'), R('dragonspine.summit-gate.eadgyth'), F('dragonspine.hearth.entry'), F('dragonspine.roost.trailhead'),
    F('dragonspine.roost.leap.1.launch'), F('dragonspine.roost.leap.1'), F('dragonspine.roost.claw-ledge'), F('dragonspine.roost.leap.2.launch'), F('dragonspine.roost.leap.2'),
    F('dragonspine.roost.horn'), F('dragonspine.roost.leap.3.launch'), F('dragonspine.roost.leap.3'), F('dragonspine.roost.entry'), F('dragonspine.roost.scale'),
    F('dragonspine.roost.arena.centre'), F('dragonspine.hearth.eadgyth'),
  ], 49, { duelRound: 2, leap: 3, killUnit: 4, search: 3, set: 1 }),
  // M32: Ysmeryth's account, the vision and the shard on the keeper-stone, the hoard, the rubbing, Eadgyth, the companions and the axe scene
  build('m32', 45, 'waystone.wyrms-hearth', [
    F('dragonspine.hearth.ysmeryth.land'), F('dragonspine.hearth.keeper-stone'), ...feet(n('dragonspine.hearth.hoard.search.', 1, 3)), F('dragonspine.hearth.eadgyth'),
    F('dragonspine.hearth.companion.2'), F('dragonspine.hearth.ysmeryth.land'),
  ], 61, { search: 3, set: 2, interact: 1 }),
  // M33 (a long ride from the Hearth): Thorgar, the rigger, five camp searches, the six anchors (any order; the walk is the spur's length), the handler, the flight and Thorgar
  build('m33', 50, 'waystone.wyrms-hearth', [
    R('dragonspine.skyhold.thorgar'), F('dragonspine.skyhold.rigger'), ...feet(n('dragonspine.skyhold.search.', 1, 5).map((_id, i) => SKY(i + 1))),
    F(NET(1)), F(NET(2)), F(NET(3)), F(NET(4)), F('dragonspine.skyhold.handler'), F(NET(5)), F(NET(6)), F('dragonspine.skyhold.thorgar'),
  ], 31, { killUnit: 8, interact: 6, search: 5, set: 1 }),
  // M34: the oath, Thorgar (at the Hearth), two carvings and the two glide markers, the Hearth rekindle, the first glide ledge and the report
  build('m34', 45, 'waystone.wyrms-hearth', [
    F('dragonspine.hearth.ysmeryth.oath'), F('dragonspine.hearth.eadgyth'), F(HEARTH_CARVE(1)), F(HEARTH_CARVE(2)), F('dragonspine.hearth.glide-marker.1'),
    F('dragonspine.hearth.glide-marker.2'), F('waystone.wyrms-hearth'), F('dragonspine.glide.hearth-updraft.launch'), F('dragonspine.hearth.ysmeryth.oath'),
  ], 49, { interact: 1, set: 2, search: 4 }),
  // D06: Thorgar at the chasm ledge, the glide, the captive in the keep, the keep's three searches, the Aerie's lists, the hawk, the winch, the courtyard, Skarl, the feed log, Thorgar at the landing
  build('d06', 65, 'dragonspine.glide.summit-aerie.launch', [
    G('dragonspine.glide.summit-aerie.landing'), F('dragonspine.aerie.keep.door'), D('dragonspine.keep.inside'), F('dragonspine.keep.captive'),
    ...feet([1, 2, 3].map(SEARCH_KEEP)), D('dragonspine.keep.exit'), D('dragonspine.aerie.keep.door'), F('dragonspine.aerie.search.1'), F('dragonspine.aerie.hawk-cage'),
    F('dragonspine.aerie.gate.winch'), F('dragonspine.aerie.arena.centre'), F('dragonspine.aerie.search.2'), F('dragonspine.aerie.chain-post'), F('dragonspine.aerie.landing'),
  ], 39, { killUnit: 12, search: 6, interact: 2, boss: 1 }),
];

export { ACT3_BEAT_S, paceRow };
