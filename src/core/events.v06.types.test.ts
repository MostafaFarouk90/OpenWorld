import { describe, expectTypeOf, it } from 'vitest';
import type { BossOutcome } from '../actors/BossRegistry';
import type { StatusKind } from '../actors/status';
import type { InteractKind } from '../interaction/InteractionSystem';
import type { BossMercyRow } from '../enemies/tuning';
import type { WavesService } from './coreServices';
import type { GameEventMap } from './events';
import type { GameServices } from './Services';

// Pins the v0.6 shared payloads (contracts/CHANGES-v0.6.md). Owners emit these and never redeclare them.
describe('v0.6 event payloads', () => {
  it('companions, damage and bosses', () => {
    expectTypeOf<GameEventMap['companion.bond']>().toEqualTypeOf<{ companionId: string; rank: number }>();
    expectTypeOf<GameEventMap['actor.pulled']>().toEqualTypeOf<{ actorId: string; fromId: string; distance: number }>();
    expectTypeOf<GameEventMap['boss.spared']>().toEqualTypeOf<{ bossId: string; actorId: string }>();
  });

  it('platforms, waves, structures, puzzles and gear', () => {
    expectTypeOf<GameEventMap['platform.arrived']>().toEqualTypeOf<{ id: string; stop: number }>();
    expectTypeOf<GameEventMap['wave.started']>().toEqualTypeOf<{ defId: string; index: number }>();
    expectTypeOf<GameEventMap['wave.cleared']>().toEqualTypeOf<{ defId: string; index: number }>();
    expectTypeOf<GameEventMap['waves.failed']>().toEqualTypeOf<{ defId: string; index: number }>();
    expectTypeOf<GameEventMap['structure.damaged']>().toEqualTypeOf<{ id: string; health: number }>();
    expectTypeOf<GameEventMap['structure.destroyed']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<GameEventMap['puzzle.state']>().toEqualTypeOf<{ id: string; phase: string }>();
    expectTypeOf<GameEventMap['puzzle.solved']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<GameEventMap['puzzle.failed']>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<GameEventMap['gear.tempered']>().toEqualTypeOf<{ itemId: string; level: number; affix?: string }>();
  });

  it('status, interaction and boss unions', () => {
    expectTypeOf<'root'>().toMatchTypeOf<StatusKind>();
    expectTypeOf<'valve'>().toMatchTypeOf<InteractKind>();
    expectTypeOf<BossOutcome>().toEqualTypeOf<'defeated' | 'released' | 'spared'>();
    expectTypeOf<BossMercyRow['verb']>().toEqualTypeOf<'release' | 'calm' | 'spare'>();
  });

  it('the waves service type', () => {
    expectTypeOf<GameServices['waves']>().toEqualTypeOf<WavesService>();
  });
});
