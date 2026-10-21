import { describe, expect, it } from 'vitest';
import { createCooling, type Coolable, type CoolingKind } from './cooling';

function fakeCoolable(id: string, x: number, y: number, z: number, accepts = true): Coolable & { hits: Array<string | null> } {
  const hits: Array<string | null> = [];
  return {
    id,
    feet: { x, y, z },
    hits,
    coolingHit(sourceId) {
      hits.push(sourceId);
      return accepts;
    },
  };
}

function rig(list: Array<Coolable & { hits: Array<string | null> }>) {
  const emitted: Array<{ kind: CoolingKind; id: string }> = [];
  const service = createCooling({
    get: (id) => list.find((c) => c.id === id),
    all: () => list,
    emit: (kind, id) => void emitted.push({ kind, id }),
  });
  return { service, emitted };
}

describe('createCooling.hit', () => {
  it('cools a coolable actor, passes the source and emits once with the default kind', () => {
    const c = fakeCoolable('a', 0, 0, 0);
    const { service, emitted } = rig([c]);
    expect(service.hit('a', 'player')).toBe(true);
    expect(c.hits).toEqual(['player']);
    expect(emitted).toEqual([{ kind: 'draught', id: 'a' }]);
  });

  it('defaults the source to null and honours an explicit kind', () => {
    const c = fakeCoolable('a', 0, 0, 0);
    const { service, emitted } = rig([c]);
    expect(service.hit('a', undefined, 'valve')).toBe(true);
    expect(c.hits).toEqual([null]);
    expect(emitted[0]!.kind).toBe('valve');
  });

  it('returns false and does not emit for a non-coolable kind (coolingHit false) or an unknown actor', () => {
    const c = fakeCoolable('a', 0, 0, 0, false);
    const { service, emitted } = rig([c]);
    expect(service.hit('a')).toBe(false);
    expect(service.hit('missing')).toBe(false);
    expect(emitted).toEqual([]);
  });
});

describe('createCooling.hitArea', () => {
  it('cools every coolable inside the horizontal radius (inclusive) and returns the count', () => {
    const list = [fakeCoolable('in', 1, 0, 1), fakeCoolable('edge', 3, 0, 0), fakeCoolable('out', 3.01, 0, 0)];
    const { service, emitted } = rig(list);
    expect(service.hitArea({ x: 0, y: 0, z: 0 }, 3, 'p')).toBe(2);
    expect(list[0]!.hits).toEqual(['p']);
    expect(list[1]!.hits).toEqual(['p']);
    expect(list[2]!.hits).toEqual([]);
    expect(emitted.map((e) => e.id)).toEqual(['in', 'edge']);
    expect(emitted.every((e) => e.kind === 'wind')).toBe(true);
  });

  it('ignores height in the radius but only within a 3 m vertical tolerance', () => {
    const list = [fakeCoolable('level', 0, 0, 0), fakeCoolable('up3', 0, 3, 0), fakeCoolable('up31', 0, 3.1, 0), fakeCoolable('down4', 0, -4, 0)];
    const { service } = rig(list);
    expect(service.hitArea({ x: 0, y: 0, z: 0 }, 1)).toBe(2);
    expect(list[2]!.hits).toEqual([]);
    expect(list[3]!.hits).toEqual([]);
  });

  it('counts only those that reacted: non-coolable kinds return false and are not emitted', () => {
    const list = [fakeCoolable('crawler', 1, 0, 0), fakeCoolable('wraith', 1, 0, 1, false)];
    const { service, emitted } = rig(list);
    expect(service.hitArea({ x: 0, y: 0, z: 0 }, 5)).toBe(1);
    expect(list[1]!.hits).toEqual([null]); // asked, said no
    expect(emitted).toEqual([{ kind: 'wind', id: 'crawler' }]);
  });

  it('passes the kind through to emit', () => {
    const { service, emitted } = rig([fakeCoolable('a', 0, 0, 0)]);
    service.hitArea({ x: 0, y: 0, z: 0 }, 1, null, 'valve');
    expect(emitted).toEqual([{ kind: 'valve', id: 'a' }]);
  });

  it('a zero, negative, NaN or infinite radius cools nothing', () => {
    const c = fakeCoolable('a', 0, 0, 0);
    const { service, emitted } = rig([c]);
    for (const r of [0, -1, NaN, Infinity]) expect(service.hitArea({ x: 0, y: 0, z: 0 }, r)).toBe(0);
    expect(c.hits).toEqual([]);
    expect(emitted).toEqual([]);
  });
});
