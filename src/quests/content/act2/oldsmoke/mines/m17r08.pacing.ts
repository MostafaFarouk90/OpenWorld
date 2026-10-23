// Pacing rows for M17 and R08 (plans/act2-A13.md section 5), in the shape of ../pacing.ts. The mine interiors are A4's PR 2
// and are not on this branch, so the routes are measured on a local position table (`M17R08_POS`) instead of layout
// anchors: the surface points mirror A4's shaft head offsets, the underground points are sketched at the sizes A4's plan
// gives (each mine inside x [-70,70], z [-130,10] of its own frame). Every point is in one shared local frame, so a lift
// ride costs its `lift` beat and a short hop. Re-measure against A4's real anchors when the mines land.
import type { PaceRow } from '../../pacing';

export interface M17R08PaceRow extends PaceRow { branch?: string }

export const M17R08_POS: Record<string, { x: number; z: number }> = {
  // surface: the shaft head (A4 PR 1 names, approximate offsets from the collar)
  'npc-post.slagg.shaft': { x: 0, z: 20 }, 'oldsmoke.shaft.head': { x: 0, z: 16 }, 'oldsmoke.shaft.door': { x: 0, z: 9 },
  'oldsmoke.shaft.lift.top': { x: 0, z: 7 }, 'oldsmoke.shaft.winch': { x: 40, z: -6 },
  'oldsmoke.shaft.winch.part.1': { x: -12, z: -10 }, 'oldsmoke.shaft.winch.part.2': { x: 16, z: -14 }, 'oldsmoke.shaft.winch.part.3': { x: 30, z: 12 },
  // mine-deepgate-shaft
  'oldsmoke.shaft.floor': { x: 0, z: -10 },
  'oldsmoke.shaft.vent.1': { x: -30, z: -40 }, 'oldsmoke.shaft.vent.2': { x: 25, z: -55 }, 'oldsmoke.shaft.vent.3': { x: -20, z: -85 }, 'oldsmoke.shaft.vent.4': { x: 35, z: -105 },
  'oldsmoke.shaft.miner.1': { x: -45, z: -95 }, 'oldsmoke.shaft.miner.2': { x: 50, z: -115 },
  // mine-old-galleries
  'oldsmoke.old.lift': { x: 0, z: -5 },
  'oldsmoke.old.task.pump': { x: -40, z: -30 }, 'oldsmoke.old.task.cart': { x: 30, z: -45 }, 'oldsmoke.old.task.prop': { x: -25, z: -80 }, 'oldsmoke.old.task.bell': { x: 20, z: -110 },
  'oldsmoke.old.relic.1': { x: -10, z: -20 }, 'oldsmoke.old.relic.2': { x: -50, z: -45 }, 'oldsmoke.old.relic.3': { x: 10, z: -60 },
  'oldsmoke.old.relic.4': { x: 45, z: -75 }, 'oldsmoke.old.relic.5': { x: -35, z: -100 }, 'oldsmoke.old.relic.6': { x: 40, z: -120 },
};

export const M17R08_PACE: readonly M17R08PaceRow[] = [
  {
    // the ride down and up are lift beats (30 s each); the winch parts are interacts, the vents interacts, the swarm 12 crawlers
    quest: 'm17', design: 45, floor: 18, nodes: 32,
    route: [
      'npc-post.slagg.shaft', 'oldsmoke.shaft.head', 'oldsmoke.shaft.winch.part.1', 'oldsmoke.shaft.winch.part.2', 'oldsmoke.shaft.winch.part.3',
      'oldsmoke.shaft.door', 'oldsmoke.shaft.head', 'oldsmoke.shaft.winch', 'oldsmoke.shaft.lift.top',
      'oldsmoke.shaft.floor', 'oldsmoke.shaft.vent.1', 'oldsmoke.shaft.vent.2', 'oldsmoke.shaft.vent.3', 'oldsmoke.shaft.vent.4',
      'oldsmoke.shaft.miner.1', 'oldsmoke.shaft.floor', 'oldsmoke.shaft.miner.2', 'oldsmoke.shaft.floor',
      'oldsmoke.shaft.lift.top', 'oldsmoke.shaft.door', 'oldsmoke.shaft.lift.top', 'npc-post.slagg.shaft',
    ],
    beats: { killUnit: 12, interact: 8, note: 2, carry: 2, lift: 2 },
  },
  {
    quest: 'r08', design: 40, floor: 16, nodes: 28,
    route: [
      'oldsmoke.old.lift', 'oldsmoke.old.relic.1', 'oldsmoke.old.relic.2', 'oldsmoke.old.relic.3', 'oldsmoke.old.relic.4', 'oldsmoke.old.relic.5', 'oldsmoke.old.relic.6',
      'oldsmoke.old.task.pump', 'oldsmoke.old.task.cart', 'oldsmoke.old.task.prop', 'oldsmoke.old.task.bell',
      'oldsmoke.old.task.bell', 'oldsmoke.old.lift', 'oldsmoke.old.lift',
    ],
    beats: { note: 7, interact: 4, killUnit: 5, lift: 2 },
  },
];
