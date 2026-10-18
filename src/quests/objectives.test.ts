import { describe, it, expect } from 'vitest';
import { creditFor } from './objectives';
import type { ObjectiveDef } from './types';

const ctx = { playerId: 'p', actorMeta: (id: string) => (id === 'w1' ? { spawnTag: 'm01' } : { spawnTag: 'x' }) };
const o = (x: Partial<ObjectiveDef> & { type: ObjectiveDef['type'] }): ObjectiveDef => ({ id: 'o', textKey: 't', target: 'T', ...x });

describe('creditFor', () => {
  it('interact is not credited by the mercy action on the same target', () => {
    const d = o({ type: 'interact' });
    expect(creditFor(d, 'interact', { interactableId: 'T', action: 'interact' }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'interact', { interactableId: 'T', action: 'mercy' }, ctx)).toBeNull();
  });

  it('goTo needs the player and the target trigger', () => {
    const d = o({ type: 'goTo' });
    expect(creditFor(d, 'trigger.enter', { triggerId: 'T', actorId: 'p' }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(d, 'trigger.enter', { triggerId: 'T', actorId: 'q' }, ctx)).toBeNull();
    expect(creditFor(d, 'trigger.enter', { triggerId: 'U', actorId: 'p' }, ctx)).toBeNull();
    expect(creditFor(d, 'trigger.enter', { triggerId: 'T', actorId: 'p' }, { playerId: undefined })).toBeNull();
    expect(creditFor(d, 'interact', { triggerId: 'T', actorId: 'p' }, ctx)).toBeNull();
  });
  it('interact and talk match their ids', () => {
    expect(creditFor(o({ type: 'interact' }), 'interact', { interactableId: 'T' }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(o({ type: 'interact' }), 'interact', { interactableId: 'U' }, ctx)).toBeNull();
    expect(creditFor(o({ type: 'talk' }), 'dialogue.ended', { npcId: 'T' }, ctx)).toEqual({ amount: 1 });
    expect(creditFor(o({ type: 'talk' }), 'dialogue.ended', { npcId: 'U' }, ctx)).toBeNull();
  });
  it('kill: player kills of the kind, dedupe keyed by actor', () => {
    const d = o({ type: 'kill' });
    expect(creditFor(d, 'actor.died', { actorId: 'a', killerId: 'p', kind: 'T' }, ctx)).toEqual({ amount: 1, dedupeKey: 'a' });
    expect(creditFor(d, 'actor.died', { actorId: 'a', killerId: 'z', kind: 'T' }, ctx)).toBeNull();
    expect(creditFor(d, 'actor.died', { actorId: 'a', killerId: 'p', kind: 'U' }, ctx)).toBeNull();
    expect(creditFor(d, 'mercy', { creature: 'T', actorId: 'a' }, ctx)).toEqual({ amount: 1, dedupeKey: 'a' });
    expect(creditFor(d, 'mercy', { creature: 'U', actorId: 'a' }, ctx)).toBeNull();
  });
  it('kill: spawnTag filter', () => {
    const d = o({ type: 'kill', spawnTag: 'm01' });
    expect(creditFor(d, 'actor.died', { actorId: 'w1', killerId: 'p', kind: 'T' }, ctx)).not.toBeNull();
    expect(creditFor(d, 'actor.died', { actorId: 'w2', killerId: 'p', kind: 'T' }, ctx)).toBeNull();
    expect(creditFor(d, 'mercy', { creature: 'T', actorId: 'w2' }, ctx)).toBeNull();
    expect(creditFor(d, 'mercy', { creature: 'T' }, ctx)).toBeNull();
    expect(creditFor(d, 'actor.died', { actorId: 'w1', killerId: 'p', kind: 'T' }, { playerId: 'p' })).toBeNull();
  });
  it('kill: payload spawnTag wins even when the actor is gone from the registry', () => {
    const d = o({ type: 'kill', spawnTag: 'm01' });
    const gone = { playerId: 'p', actorMeta: () => undefined };
    expect(creditFor(d, 'actor.died', { actorId: 'zz', killerId: 'p', kind: 'T', spawnTag: 'm01' }, gone)).toEqual({ amount: 1, dedupeKey: 'zz' });
    expect(creditFor(d, 'actor.died', { actorId: 'zz', killerId: 'p', kind: 'T', spawnTag: 'other' }, gone)).toBeNull();
    // payload tag mismatch is not rescued by the registry
    expect(creditFor(d, 'actor.died', { actorId: 'w1', killerId: 'p', kind: 'T', spawnTag: 'other' }, ctx)).toBeNull();
    expect(creditFor(d, 'actor.died', { actorId: 'zz', killerId: 'p', kind: 'T' }, gone)).toBeNull();
  });
  it('talk credits only completed dialogues', () => {
    const d = o({ type: 'talk' });
    expect(creditFor(d, 'dialogue.ended', { npcId: 'T', reason: 'completed' }, ctx)).toEqual({ amount: 1 });
    for (const reason of ['death', 'load', 'skip', 'dispose', 'script']) {
      expect(creditFor(d, 'dialogue.ended', { npcId: 'T', reason }, ctx)).toBeNull();
    }
  });
  it('collect sums counts for the item', () => {
    const d = o({ type: 'collect' });
    expect(creditFor(d, 'loot.granted', { items: [{ itemId: 'T', count: 2 }, { itemId: 'T', count: 1 }, { itemId: 'U', count: 9 }] }, ctx)).toEqual({ amount: 3 });
    expect(creditFor(d, 'loot.granted', { items: [{ itemId: 'U', count: 1 }] }, ctx)).toBeNull();
    expect(creditFor(d, 'loot.granted', { items: [{ itemId: 'T', count: NaN }, { itemId: 'T', count: -1 }] }, ctx)).toBeNull();
    expect(creditFor(d, 'loot.granted', { items: 'x' }, ctx)).toBeNull();
  });
  it('carry needs destination and a carry id', () => {
    const d = o({ type: 'carry' });
    expect(creditFor(d, 'carry.delivered', { carryId: 'c', destinationId: 'T' }, ctx)).toEqual({ amount: 1, dedupeKey: 'c' });
    expect(creditFor(d, 'carry.delivered', { carryId: 'c', destinationId: 'U' }, ctx)).toBeNull();
    expect(creditFor(d, 'carry.delivered', { destinationId: 'T' }, ctx)).toBeNull();
  });
  it('garbage payloads give null', () => {
    expect(creditFor(o({ type: 'interact' }), 'interact', null, ctx)).toBeNull();
    expect(creditFor(o({ type: 'interact' }), 'interact', 5, ctx)).toBeNull();
  });
});
