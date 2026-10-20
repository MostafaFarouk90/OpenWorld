import type { SpawnerDef } from './types';

const members = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

/**
 * Act 1 density pass, batch 1 (quests thread; anchors in src/region/density.layout.ts). Each group is live only while
 * its quest is active and the flag of the beat before it is on (src/quests/content/objectiveFlags.ts), never respawns.
 */
export const DENSITY_SPAWNERS_A: readonly SpawnerDef[] = [
  // M01: four wraiths circle the mill while Aldwin holds the door.
  {
    id: 'density.m01.mill', tag: 'm01.mill', enemy: 'ash-wraith', count: 4,
    anchor: 'spawn.m01.mill-1', memberAnchors: members('spawn.m01.mill', 4),
    band: { min: 1, max: 1 }, activation: { quest: 'm01', flag: 'tutorial.complete' }, respawn: 'never', leash: true,
  },
  // M02: three wraiths in the oven yard, drawn by the bakery's heat once the hearth is dug out.
  {
    id: 'density.m02.oven-yard', tag: 'm02.oven-yard', enemy: 'ash-wraith', count: 3,
    anchor: 'spawn.m02.oven-1', memberAnchors: members('spawn.m02.oven', 3),
    band: { min: 1, max: 2 }, activation: { quest: 'm02', flag: 'story.m02.rubbleCleared' }, respawn: 'never', leash: true,
  },
  // M04: the Toll Sergeant on the bridge, once his four Footmen are beaten.
  {
    id: 'density.m04.sergeant', tag: 'm04.sergeant', enemy: 'toll-sergeant', count: 1,
    anchor: 'spawn.ford.sergeant', memberAnchors: ['spawn.ford.sergeant'],
    band: { min: 4, max: 4 }, activation: { quest: 'm04', flag: 'story.m04.sergeantCalled' }, respawn: 'never', leash: true,
  },
  // R01: two more scarecrows in the east field (eight in all).
  {
    id: 'r01.scarecrows-east', enemy: 'ash-scarecrow', count: 2,
    anchor: 'r01.scarecrow.7', memberAnchors: ['r01.scarecrow.7', 'r01.scarecrow.8'],
    band: { min: 2, max: 3 }, activation: { quest: 'r01', flag: 'story.r01.shawlRead' }, respawn: 'never', leash: false,
  },
  // R01: the root under the barley wakes as three wraiths once the scarecrows are gone.
  {
    id: 'density.r01.root', tag: 'r01.root', enemy: 'ash-wraith', count: 3,
    anchor: 'spawn.r01.root-1', memberAnchors: members('spawn.r01.root', 3),
    band: { min: 2, max: 3 }, activation: { quest: 'r01', flag: 'story.r01.rootWoke' }, respawn: 'never', leash: true,
  },

  // ---- batch 2: the Dead Road and the vault ----
  // M05: the road's dead make one last push at the Quenchstone once all five stones are struck.
  {
    id: 'density.m05.shrine', tag: 'm05.shrine', enemy: 'ash-wraith', count: 4,
    anchor: 'spawn.m05.shrine-1', memberAnchors: members('spawn.m05.shrine', 4),
    // a gate that closes once the push objective is done, so an old save credited past it raises nobody
    band: { min: 3, max: 4 }, activation: { flag: 'story.m05.stonesStruck', until: 'story.m05.shrineHeld' }, respawn: 'never', leash: true,
  },
  // D01: the antechamber walls give up four wraiths once the three prayer braziers burn (anchors in the vault def).
  {
    id: 'density.d01.antechamber', tag: 'd01.antechamber', enemy: 'ash-wraith', count: 4,
    anchor: 'd01.spawn.wall-1', memberAnchors: members('d01.spawn.wall', 4),
    band: { min: 4, max: 5 }, activation: { flag: 'story.d01.braziersLit', until: 'story.d01.antechamberClear' }, respawn: 'never', leash: true,
  },
  // A Dead Road point of interest: two wraiths in the barrow off the road; there from the start, never respawning.
  {
    id: 'density.deadroad.barrow', tag: 'deadroad.barrow', enemy: 'ash-wraith', count: 2,
    anchor: 'spawn.deadroad.barrow-1', memberAnchors: members('spawn.deadroad.barrow', 2),
    band: { min: 3, max: 4 }, activation: 'auto', respawn: 'never', leash: true,
  },

  // ---- batch 3: Harrowmark part 1 ----
  // R02: Stane's sparring bouts, one veteran and then two at once. They stand where Stane runs the drill: his story
  // node writes the yard's or the Bastion's flag (src/dialogue/content/npc-stane.dialogue.ts). A bout called in the
  // Practice Yard is called off once M06 starts and Stane moves to the Bastion (he calls it again there).
  ...(['yard', 'bastion'] as const).flatMap((site): SpawnerDef[] => {
    const live = (bout: string): SpawnerDef['activation'] => (site === 'yard'
      ? { flag: `story.r02.${bout}.yard`, until: 'story.m06.started' }
      : { quest: 'r02', flag: `story.r02.${bout}.bastion` });
    return [
      {
        id: `density.r02.bout-${site}`, tag: 'r02.bout', enemy: 'yard-veteran', count: 1,
        anchor: `spawn.r02.${site}-bout`, memberAnchors: [`spawn.r02.${site}-bout`],
        band: { min: 2, max: 3 }, activation: live('bout'), respawn: 'never', leash: true,
      },
      {
        id: `density.r02.pair-${site}`, tag: 'r02.pair', enemy: 'yard-veteran', count: 2,
        anchor: `spawn.r02.${site}-pair-1`, memberAnchors: members(`spawn.r02.${site}-pair`, 2),
        band: { min: 2, max: 3 }, activation: live('pair'), respawn: 'never', leash: true,
      },
    ];
  }),
  // R03: two more of Pellam's men try to take the copper back on the way to the Anvil (gone once dealt with).
  {
    id: 'density.r03.snatch', tag: 'r03.snatch', enemy: 'guildhall-thug', count: 2,
    anchor: 'spawn.r03.snatch-1', memberAnchors: members('spawn.r03.snatch', 2),
    band: { min: 5, max: 6 }, activation: { flag: 'story.r03.copperTaken', until: 'story.r03.snatchBeaten' }, respawn: 'never', leash: true,
  },

  // ---- batch 4: Harrowmark part 2 ----
  // M10: two of Vey's hired men come for the sealed orders once Cael has picked them up.
  {
    id: 'density.m10.ambush', tag: 'm10.ambush', enemy: 'guildhall-thug', count: 2,
    anchor: 'spawn.m10.ambush-1', memberAnchors: members('spawn.m10.ambush', 2),
    band: { min: 6, max: 7 }, activation: { flag: 'story.m10.ordersTaken', until: 'story.m10.ambushBeaten' }, respawn: 'never', leash: true,
  },
  // D02: Rook's lesson, two stray ember hounds in the Watch Barracks yard (Calm them, or put them down).
  {
    id: 'density.d02.stray', tag: 'd02.stray', enemy: 'ember-hound', count: 2,
    anchor: 'spawn.d02.stray-1', memberAnchors: members('spawn.d02.stray', 2),
    band: { min: 6, max: 6 }, activation: { flag: 'story.d02.underwaysOpen', until: 'story.d02.strayDealt' }, respawn: 'never', leash: true,
  },
  // D02: three hounds come through the drained sluice once both valves are open (anchors in the Underways generator).
  {
    id: 'density.d02.sluice', tag: 'd02.sluice', enemy: 'ember-hound', count: 3,
    anchor: 'underways.spawn.sluice-1', memberAnchors: members('underways.spawn.sluice', 3),
    band: { min: 6, max: 7 }, activation: { flag: 'story.d02.valvesOpen', until: 'story.d02.sluiceClear' }, respawn: 'never', leash: true,
  },
];
