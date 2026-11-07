// N3 arena geometry kit (plans/act5-N3.md 1.6) on v0.9's `bossArena` (src/bosses/arena.ts): a floor that breaks, platforms
// that turn, lava that rises. Each piece is an `ArenaPiece` (apply a state, reset to the start); `bossArena` resets every
// piece on `boss.ended` (reset or left) and on `save.loaded`. N6 PR 2 registers the pieces and drives them from
// `boss.phase`, and adds `kitSystem(pieces)` so they animate:
//
//   const floor = new BreakingFloor({ solids: [{ setSolid: (s) => interiors.setBlocker('hammer.floor', s) }] });
//   const ring = new TurningPlatforms({ platforms: ctx.services.get('platforms')!, pivot, degPerS: 10, items });
//   const lava = new RisingLava({ lava: ctx.services.get('lava')!, volumeId, levels: { low: { y: 140 }, 'level:1': { y: 143, lips } } });
//   ctx.services.get('bossArena')!.register('d10', { bossId: 'ulthred', pieces: { floor, ring, lava } });
//   ctx.systems.add(kitSystem('d10', [floor, ring, lava]));
import type { GameSystem } from '../../core/systems';

export { BreakingFloor, type BreakingFloorOptions, type FloorState, type FloorTile } from './BreakingFloor';
export { TurningPlatforms, type TurningPlatformsOptions, type PlatformItem, type PlatformsLike } from './TurningPlatforms';
export { RisingLava, type RisingLavaOptions, type LavaLevel, type LavaLike } from './RisingLava';

/** A piece that animates: `update` once per fixed tick, `render` once per frame with the loop's alpha. */
export interface KitPiece {
  update?(dt: number): void;
  render?(alpha: number): void;
}

/** One system that ticks and draws an arena's pieces. */
export function kitSystem(arenaId: string, pieces: readonly KitPiece[]): GameSystem {
  return {
    id: `caldera.arenaKit.${arenaId}`,
    fixedPhase: 'late',
    renderPhase: 'world',
    fixedUpdate(dt) {
      for (const p of pieces) p.update?.(dt);
    },
    render(alpha) {
      for (const p of pieces) p.render?.(alpha);
    },
  };
}
