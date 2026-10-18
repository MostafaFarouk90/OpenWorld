import { describe, expectTypeOf, it } from 'vitest';
import type { ClassId } from '../actors/classes';
import type { DamageRequest } from '../actors/DamageResolver';
import type { StatusKind } from '../actors/status';
import type { MercyEvent } from '../state/favour';
import type { GameEventMap, GoldSpendReason } from './events';

// Pins the v0.5 shared payloads (game-events-and-flags.md section 4, "Events added in v0.5"). Owners emit
// these and never redeclare them; a change here is a contract change.
describe('v0.5 event payloads', () => {
  it('core, status and class events', () => {
    expectTypeOf<GameEventMap['player.avatar']>().toEqualTypeOf<{ classId: ClassId; previous: ClassId | null }>();
    expectTypeOf<GameEventMap['status.applied']>().toEqualTypeOf<{ actorId: string; id: string; kind: StatusKind }>();
    expectTypeOf<GameEventMap['status.expired']>().toEqualTypeOf<{ actorId: string; id: string; kind: StatusKind }>();
    expectTypeOf<GameEventMap['ability.grant']>().toEqualTypeOf<{ id: string; source: string }>();
    expectTypeOf<GameEventMap['class.chosen']>().toEqualTypeOf<{ classId: ClassId }>();
    expectTypeOf<GameEventMap['class.changed']>().toEqualTypeOf<{ classId: ClassId; previous: ClassId; free: boolean; cost: number }>();
    expectTypeOf<GameEventMap['class.drill']>().toEqualTypeOf<{ classId: ClassId; outcome: 'done' | 'skipped' }>();
  });

  it('stealth, chase, mount, vendor, gold and act events', () => {
    expectTypeOf<GameEventMap['stealth.section']>().toEqualTypeOf<{ sectionId: string; phase: 'entered' | 'cleared' | 'exited' }>();
    expectTypeOf<GameEventMap['stealth.noticed']>().toEqualTypeOf<{ observerId: string; sectionId: string; level: number }>();
    expectTypeOf<GameEventMap['stealth.alert']>().toEqualTypeOf<{
      observerId: string;
      sectionId: string;
      state: 'calm' | 'suspicious' | 'alerted';
    }>();
    expectTypeOf<GameEventMap['stealth.caught']>().toEqualTypeOf<{ observerId: string; sectionId: string; checkpointId: string }>();
    expectTypeOf<GameEventMap['stealth.checkpoint']>().toEqualTypeOf<{ sectionId: string; checkpointId: string }>();
    expectTypeOf<GameEventMap['chase.started']>().toEqualTypeOf<{ chaseId: string }>();
    expectTypeOf<GameEventMap['chase.caught']>().toEqualTypeOf<{ chaseId: string; seconds: number }>();
    expectTypeOf<GameEventMap['chase.lost']>().toEqualTypeOf<{ chaseId: string; reason: 'timer' | 'distance' | 'combat' }>();
    expectTypeOf<GameEventMap['mount.summoned']>().toEqualTypeOf<{ mountId: string }>();
    expectTypeOf<GameEventMap['mount.mounted']>().toEqualTypeOf<{ mountId: string }>();
    expectTypeOf<GameEventMap['mount.dismounted']>().toEqualTypeOf<{
      mountId: string;
      reason: 'player' | 'combat' | 'interior' | 'load' | 'script';
    }>();
    expectTypeOf<GameEventMap['vendor.bought']>().toEqualTypeOf<{ vendorId: string; itemId: string; count: number; price: number }>();
    expectTypeOf<GameEventMap['vendor.sold']>().toEqualTypeOf<{ vendorId: string; itemId: string; count: number; price: number }>();
    expectTypeOf<GameEventMap['gold.spent']>().toEqualTypeOf<{ amount: number; reason: GoldSpendReason; total: number }>();
    expectTypeOf<GoldSpendReason>().toEqualTypeOf<'bribe' | 'respec' | 'vendor' | 'inn' | 'persuasion' | 'theft' | 'death' | 'script'>();
    expectTypeOf<GameEventMap['act.ended']>().toEqualTypeOf<{ act: number; endingId: string }>();
  });

  it('damage kind, status fields and the mercy ledger id', () => {
    expectTypeOf<DamageRequest['kind']>().toEqualTypeOf<'melee' | 'spell' | 'fall' | 'script' | 'status'>();
    expectTypeOf<DamageRequest['statusKind']>().toEqualTypeOf<StatusKind | undefined>();
    expectTypeOf<StatusKind>().toEqualTypeOf<'bleed' | 'ignite' | 'stun' | 'slow'>();
    expectTypeOf<MercyEvent['ledgerId']>().toEqualTypeOf<string | undefined>();
  });
});
