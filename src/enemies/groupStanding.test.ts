import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import { GroupStanding } from './groupStanding';

function make(members: string[] = ['a', 'b', 'c']) {
  const bus = new EventBus<GameEventMap>(() => {});
  const dead = new Set<string>();
  const alive = new Set(members);
  const gs = new GroupStanding({
    alive: (id) => (id === 'g' ? [...alive] : []),
    isDead: (a) => dead.has(a),
    on: (t, fn) => bus.on(t, fn),
  });
  const emit = (type: string, payload: object) => {
    (bus as unknown as { emit(t: string, p: object): void }).emit(type, payload);
  };
  return { bus, gs, dead, alive, emit };
}

describe('GroupStanding', () => {
  it('counts every living member, and an unknown group is cleared', () => {
    const { gs } = make();
    expect(gs.standing('g')).toEqual(['a', 'b', 'c']);
    expect(gs.isCleared('g')).toBe(false);
    expect(gs.isCleared('nope')).toBe(true);
  });

  it('treats a spared, calmed and released member as gone (all arrive as a mercy event)', () => {
    const { gs, emit } = make();
    emit('mercy', { actorId: 'a', kind: 'spare' });
    emit('mercy', { actorId: 'b', kind: 'calm' });
    emit('mercy', { actorId: 'c', kind: 'release' });
    expect(gs.standing('g')).toEqual([]);
    expect(gs.isCleared('g')).toBe(true);
    expect(gs.isMercied('a')).toBe(true);
  });

  it('a yielding member still stands until it is spared', () => {
    const { gs, emit } = make();
    emit('enemies.yield', { actorId: 'a', seconds: 5 });
    expect(gs.standing('g')).toContain('a');
    emit('mercy', { actorId: 'a' });
    expect(gs.standing('g')).not.toContain('a');
  });

  it('a revoked mercy stands again', () => {
    const { gs, emit } = make();
    emit('mercy', { actorId: 'a' });
    emit('mercy.revoked', { actorId: 'a', track: null, removed: 0 });
    expect(gs.standing('g')).toContain('a');
    expect(gs.isMercied('a')).toBe(false);
  });

  it('a dead member is gone, even while still registered', () => {
    const { gs, dead } = make();
    dead.add('b');
    expect(gs.standing('g')).toEqual(['a', 'c']);
  });

  it('ignores a mercy event without an actor id', () => {
    const { gs, emit } = make();
    emit('mercy', {});
    expect(gs.standing('g')).toHaveLength(3);
  });

  it('save.loaded clears the mercy set; despawn forgets one actor', () => {
    const { gs, emit } = make();
    emit('mercy', { actorId: 'a' });
    emit('mercy', { actorId: 'b' });
    emit('actor.despawned', { actorId: 'b' });
    expect(gs.isMercied('b')).toBe(false);
    emit('save.loaded', { slot: 's' });
    expect(gs.isMercied('a')).toBe(false);
    expect(gs.standing('g')).toHaveLength(3);
  });

  it('onMemberLeft fires on mercy, despawn and groupCleared, and its undo works', () => {
    const { gs, emit } = make();
    const fn = vi.fn();
    const off = gs.onMemberLeft(fn);
    emit('mercy', { actorId: 'a' });
    emit('actor.despawned', { actorId: 'a' });
    emit('enemies.groupCleared', { spawnerId: 'g' });
    expect(fn).toHaveBeenCalledTimes(3);
    emit('enemies.yield', { actorId: 'b', seconds: 1 });
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    emit('mercy', { actorId: 'b' });
    emit('enemies.groupCleared', { spawnerId: 'g' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('dispose stops tracking', () => {
    const { gs, emit } = make();
    gs.dispose();
    emit('mercy', { actorId: 'a' });
    expect(gs.isMercied('a')).toBe(false);
  });
});
