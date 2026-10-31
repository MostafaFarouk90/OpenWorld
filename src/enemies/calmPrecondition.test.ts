import { describe, expect, it } from 'vitest';
import { calmOptions } from './calm';
import { ACT3_ENEMY_KINDS, type EnemyDef, type EnemyView, type MercyDef } from './types';
import { ENEMY_DEFS } from './defs';
import type { DamageRequest } from '../actors/DamageResolver';

const inv = { count: (id: string) => (id === 'hearth-bread' ? 2 : 0), remove: () => true };
const base: MercyDef = { verb: 'calm', tier: 'normal', track: null, when: 'calming', offerings: [{ itemId: 'hearth-bread', count: 1 }], warmHand: true };

describe('calm precondition and layToRest (v0.7 item 14)', () => {
  it('without a precondition nothing changes', () => {
    expect(calmOptions(base, inv).map((o) => o.kind)).toEqual(['item', 'warmHand']);
  });

  it('pulledOut: no options until the context says so', () => {
    const m: MercyDef = { ...base, calmForm: 'layToRest', precondition: 'pulledOut' };
    expect(calmOptions(m, inv)).toEqual([]);
    expect(calmOptions(m, inv, {})).toEqual([]);
    expect(calmOptions(m, inv, { pulledOut: false })).toEqual([]);
    expect(calmOptions(m, inv, { grounded: true })).toEqual([]);
    expect(calmOptions(m, inv, { pulledOut: true }).map((o) => o.kind)).toEqual(['item', 'warmHand']);
  });

  it('grounded: needs the grounded flag, even for a free calm', () => {
    const m: MercyDef = { ...base, freeCalm: 'always', precondition: 'grounded' };
    expect(calmOptions(m, inv, { pulledOut: true })).toEqual([]);
    expect(calmOptions(m, inv, { grounded: true }).map((o) => o.kind)).toEqual(['free', 'item', 'warmHand']);
  });

  it('a met precondition with nothing to pay still gives no options', () => {
    const m: MercyDef = { verb: 'calm', tier: 'normal', track: null, when: 'calming', precondition: 'grounded' };
    expect(calmOptions(m, undefined, { grounded: true })).toEqual([]);
  });
});

describe('Act 3 reserved kinds and tags', () => {
  it('are reserved; each becomes a def in the PR that adds it (K6b PR 1: the leech and the shambler; PR 2: the hawk and the ogre)', () => {
    expect(ACT3_ENEMY_KINDS).toEqual(['fen-leech', 'peat-shambler', 'rime-hawk', 'crag-ogre', 'skarl-drake']);
    const shipped = ['fen-leech', 'peat-shambler', 'rime-hawk', 'crag-ogre'];
    for (const k of ACT3_ENEMY_KINDS) {
      if (shipped.includes(k)) expect(Object.keys(ENEMY_DEFS)).toContain(k);
      else expect(Object.keys(ENEMY_DEFS)).not.toContain(k);
    }
  });

  it('tags are optional on defs, requests and views', () => {
    const req: DamageRequest = { attackerId: null, targetId: 'a' as never, amount: 1, kind: 'melee', tags: ['dragonkin'] };
    const tagged: Pick<EnemyDef, 'tags'> = { tags: ['dragonkin'] };
    const view: Pick<EnemyView, 'grounded'> = {};
    expect(req.tags).toEqual(tagged.tags);
    expect(view.grounded).toBeUndefined(); // undefined means grounded
  });
});
