// The Harrowmark quests' stealth sections (the shipped M09 system; a capture puts Cael back at the last checkpoint): M36's rooftop
// walk in the Rooftop Ward, R20's three posts on the stealth way (live only on that way, `liveWhen`), R21's back lanes.
import type { StealthSectionDef, VolumeDef } from '../../../../stealth/sections';
import { Q } from './anchors';
import { M36_SECTION } from './m36.quest';
import { R20_SECTION } from './r20.quest';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';
import { R21_SECTION } from './r21.quest';
import { R21_WATCH_GROUP } from './spawners';

const v = (anchor: string, hx: number, hy: number, hz: number): VolumeDef => ({ anchor, half: { x: hx, y: hy, z: hz } });
const hides = (prefix: string, tag: string) => [1, 2, 3, 4].map((i) => ({ id: `hide:${tag}-${i}`, anchor: `${prefix}.${i}` }));

export const HARROWMARK_A4_SECTIONS: readonly StealthSectionDef[] = [
  {
    id: M36_SECTION,
    quest: { id: 'm36', liveFrom: 'rooftops', liveUntil: 'rooftops' },
    bounds: v(`${Q}.m36.roof.centre`, 34, 10, 118),
    checkpoints: [
      { id: 'roof.start', anchor: `${Q}.m36.roof.start`, volume: v(`${Q}.m36.roof.start`, 4, 3, 4) },
      { id: 'roof.mid', anchor: `${Q}.m36.roof.mid`, volume: v(`${Q}.m36.roof.mid`, 4, 3, 4) },
    ],
    exit: v(`${Q}.m36.roof.end`, 4, 3, 3),
    guardGroups: ['m36.rooftops'],
    hideSpots: hides(`${Q}.m36.hide`, 'm36'),
  },
  ...[1, 2, 3].map((n): StealthSectionDef => ({
    id: R20_SECTION(n),
    quest: { id: 'r20', liveFrom: `cp${n}`, liveUntil: `cp${n}` },
    // live on the stealth way once the cart is parked short of this post (the director arms the watch then)
    liveWhen: { flag: ACT4_SPAWN_FLAGS.r20Stealth(n), equals: true },
    bounds: v(`${Q}.r20.cp${n}.centre`, 30, 15, 22),
    checkpoints: [{ id: `r20.cp${n}.start`, anchor: `${Q}.r20.cp${n}.start`, volume: v(`${Q}.r20.cp${n}.start`, 4, 3, 4) }],
    exit: v(`${Q}.r20.cp${n}.exit`, 3, 3, 3),
    guardGroups: [`r20.stealth.${n}`],
    hideSpots: hides(`${Q}.r20.cp${n}.hide`, `r20-${n}`),
  })),
  {
    id: R21_SECTION,
    quest: { id: 'r21', liveFrom: 'lanes', liveUntil: 'lanes' },
    bounds: v(`${Q}.r21.lanes.centre`, 110, 15, 50),
    checkpoints: [
      { id: 'lanes.start', anchor: `${Q}.r21.lanes.start`, volume: v(`${Q}.r21.lanes.start`, 4, 3, 4) },
      { id: 'lanes.mid', anchor: `${Q}.r21.lanes.mid`, volume: v(`${Q}.r21.lanes.mid`, 4, 3, 4) },
    ],
    exit: v(`${Q}.r21.lanes.exit`, 4, 3, 4),
    guardGroups: [R21_WATCH_GROUP],
    hideSpots: hides(`${Q}.r21.hide`, 'r21'),
  },
];
