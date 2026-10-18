import { describe, expectTypeOf, it } from 'vitest';
import type { GameEventMap, Vec3Like } from './events';

// Pins the v0.4 shared payloads (game-events-and-flags.md section 4, "Events added in v0.4"). Owners emit
// these and never redeclare them; a change here is a contract change.
describe('v0.4 event payloads', () => {
  it('core events', () => {
    expectTypeOf<GameEventMap['player.leap']>().toEqualTypeOf<{ phase: 'start' | 'land' | 'cancel'; from: Vec3Like; to?: Vec3Like }>();
    expectTypeOf<GameEventMap['boss.started']>().toEqualTypeOf<{ bossId: string; actorId: string }>();
    expectTypeOf<GameEventMap['boss.phase']>().toEqualTypeOf<{ bossId: string; phase: number; previous: number }>();
    expectTypeOf<GameEventMap['boss.break']>().toEqualTypeOf<{ bossId: string; phase: number; breaks: number; last: boolean }>();
    expectTypeOf<GameEventMap['boss.shield']>().toEqualTypeOf<{ bossId: string; up: boolean }>();
    expectTypeOf<GameEventMap['boss.releaseWindow']>().toEqualTypeOf<{ bossId: string; open: boolean }>();
    expectTypeOf<GameEventMap['boss.defeated']>().toEqualTypeOf<{ bossId: string; actorId: string }>();
    expectTypeOf<GameEventMap['boss.released']>().toEqualTypeOf<{ bossId: string; actorId: string }>();
  });

  it('events emitted by slice 2 threads', () => {
    expectTypeOf<GameEventMap['ability.learned']>().toEqualTypeOf<{ id: string; source: string }>();
    expectTypeOf<GameEventMap['scar.added']>().toEqualTypeOf<{ total: number; source: string }>();
    expectTypeOf<GameEventMap['interior.entered']>().toEqualTypeOf<{ interiorId: string; doorId: string }>();
    expectTypeOf<GameEventMap['interior.exited']>().toEqualTypeOf<{ interiorId: string; doorId: string }>();
    expectTypeOf<GameEventMap['companion.joined']>().toEqualTypeOf<{ companionId: string; actorId: string }>();
    expectTypeOf<GameEventMap['companion.left']>().toEqualTypeOf<{ companionId: string; actorId: string }>();
    expectTypeOf<GameEventMap['companion.banter']>().toEqualTypeOf<{
      companionId: string;
      lineKey: string;
      trigger: 'area' | 'combatStart' | 'combatEnd' | 'elapsed';
    }>();
    expectTypeOf<GameEventMap['companion.aura']>().toEqualTypeOf<{ companionId: string; auraId: string; active: boolean }>();
    expectTypeOf<GameEventMap['warmth.changed']>().toEqualTypeOf<{ tier: number; previous: number }>();
    expectTypeOf<GameEventMap['shrine.rekindled']>().toEqualTypeOf<{ shrineId: string }>();
    expectTypeOf<GameEventMap['wardstone.struck']>().toEqualTypeOf<{ index: number; errorMs: number }>();
    expectTypeOf<GameEventMap['wardstone.missed']>().toEqualTypeOf<{ index: number; reason: 'early' | 'late' | 'order' }>();
    expectTypeOf<GameEventMap['wardstones.complete']>().toEqualTypeOf<Record<string, never>>();
  });
});
