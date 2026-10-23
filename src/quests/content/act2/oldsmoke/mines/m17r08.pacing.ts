// Pacing rows for M17 and R08 (plans/act2-A13.md section 5), in the shape of ../pacing.ts, measured on A4's real anchors
// (`realAnchors.ts`: the shaft head from the surface layout, the shaft and Old Galleries interiors in local metres).
import type { AnchorPos, PaceRow } from '../../pacing';
import { mineAnchors, surfaceAnchorsAt } from './realAnchors';

export interface M17R08PaceRow extends PaceRow { branch?: string }

const SHAFT = mineAnchors('mine-deepgate-shaft');
/** The surface sits on the shaft floor (the lift's landing), so the ride costs its `lift` beat and no walk. */
export const M17R08_POS: AnchorPos = {
  ...surfaceAnchorsAt('oldsmoke.shaft.lift.top', SHAFT['oldsmoke.shaft.floor']),
  ...SHAFT,
  ...mineAnchors('mine-old-galleries'),
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
