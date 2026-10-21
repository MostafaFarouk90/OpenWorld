import type { WaveSetDef } from '../types';

/** Anchor ids A3 publishes for Cinderford's west approach (A3 builds no barricade: A7 draws the palisade between the four barricade anchors) (plans/act2-A3.md). A7 uses them as data. */
export const CINDERFORD_ANCHORS = {
  lanes: {
    '1': 'cinderreach.cinderford.lane.1',
    '2': 'cinderreach.cinderford.lane.2',
    '3': 'cinderreach.cinderford.lane.3',
    wyrm: 'cinderreach.cinderford.wyrm.approach',
  },
  barricade: [1, 2, 3, 4].map((n) => `cinderreach.cinderford.barricade.${n}`),
  militia: [1, 2, 3, 4, 5, 6].map((n) => `cinderreach.m12.militia.${n}`),
} as const;

/**
 * M12 "Hold Cinderford" (plans/embers-act-2.md Part 7): three waves of 5, 7 and 9 kills and two brazier carts (wave 2 and
 * wave 3), against a barricade of 400 health. The wave-3 closer is the Ember Wyrm once A6a merges.
 */
export const CINDERFORD_RAID: WaveSetDef = {
  id: 'cinderford-raid',
  barricadeId: 'cinderford.barricade',
  barricadeHealth: 400,
  barricadeAnchors: CINDERFORD_ANCHORS.barricade,
  lanes: CINDERFORD_ANCHORS.lanes,
  band: 'cinderreach',
  spawnTag: 'm12',
  // Osgar's six militia (A3's posts).
  defenders: CINDERFORD_ANCHORS.militia.map((anchor) => ({ anchor })),
  waves: [
    // Wave 1: 5 kills.
    {
      spawns: [
        { lane: '1', kind: 'ember-hound', count: 3, delay: 0, stagger: 1.5 },
        { lane: '3', kind: 'ash-wraith', count: 2, delay: 3, stagger: 1.5 },
      ],
      carts: [],
    },
    // Wave 2: 7 kills and the first cart down lane 2 (about 40 s from the barricade if nobody stops it).
    {
      spawns: [
        { lane: '1', kind: 'blighted-soldier', count: 2, delay: 0, stagger: 2 },
        { lane: '2', kind: 'ember-hound', count: 3, delay: 2, stagger: 1.5 },
        { lane: '3', kind: 'ash-wraith', count: 2, delay: 6, stagger: 1.5 },
      ],
      carts: [{ lane: '2', delay: 4 }],
    },
    // Wave 3: 9 kills, a second cart down lane 1, and the closer from the wyrm approach 20 s in.
    {
      spawns: [
        { lane: '1', kind: 'blighted-soldier', count: 3, delay: 0, stagger: 2 },
        { lane: '3', kind: 'ash-wraith', count: 3, delay: 3, stagger: 1.5 },
        { lane: '2', kind: 'ember-hound', count: 2, delay: 8, stagger: 1.5 },
        // The Ember Wyrm closer (A6a).
        { lane: 'wyrm', kind: 'ember-wyrm', count: 1, delay: 20, stagger: 0 },
      ],
      carts: [{ lane: '1', delay: 6 }],
    },
  ],
};
