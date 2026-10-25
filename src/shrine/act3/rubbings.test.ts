import { describe, expect, it } from 'vitest';
import { AnvilRubbings } from './rubbings';

function setup() {
  const flags = new Set<string>();
  const unlocked = new Set<string>();
  const taken: string[] = [];
  const registered: string[] = [];
  const warnings: string[] = [];
  const r = new AnvilRubbings({
    getBool: (k) => flags.has(k),
    setFlag: (k, v) => void (v ? flags.add(k) : flags.delete(k)),
    emitTaken: (id) => taken.push(id),
    unlock: (id) => void unlocked.add(id),
    registerCodex: (entries) => {
      registered.push(...entries.map((e) => e.id));
      return () => {};
    },
    warn: (m) => warnings.push(m),
  });
  const six = ['anvil-1', 'anvil-2', 'anvil-3', 'anvil-4', 'anvil-5', 'anvil-6'].map((id) => ({ id }));
  return { r, flags, unlocked, taken, registered, warnings, six };
}

describe('anvil rubbings', () => {
  it('registers codex entries and refuses a duplicate id with a warning', () => {
    const t = setup();
    t.r.register(t.six);
    expect(t.registered).toEqual(t.six.map((d) => `lore.rubbing.${d.id}`));
    t.r.register([{ id: 'anvil-1' }, { id: 'rock-1' }]);
    expect(t.warnings).toHaveLength(1);
    expect(t.warnings[0]).toContain('anvil-1');
    expect(t.registered).toContain('lore.rubbing.rock-1');
    expect(t.registered.filter((id) => id === 'lore.rubbing.anvil-1')).toHaveLength(1);
  });

  it('refuses an invalid id', () => {
    const t = setup();
    t.r.register([{ id: 'Bad Id' }, { id: '' }]);
    expect(t.warnings).toHaveLength(2);
    expect(t.r.take('Bad Id')).toBe(false);
  });

  it('before M32: a take writes the flag, emits the event and unlocks only the collection entry', () => {
    const t = setup();
    t.r.register(t.six);
    expect(t.r.readable()).toBe(false);
    expect(t.r.take('anvil-2')).toBe(true);
    expect(t.flags.has('world.rubbing.anvil-2.taken')).toBe(true);
    expect(t.taken).toEqual(['anvil-2']);
    expect([...t.unlocked]).toEqual(['lore.anvil-rubbings']);
    expect(t.r.taken('anvil-2')).toBe(true);
    expect(t.r.count()).toBe(1);
  });

  it('a second take and an unknown id do nothing', () => {
    const t = setup();
    t.r.register(t.six);
    t.r.take('anvil-1');
    expect(t.r.take('anvil-1')).toBe(false);
    expect(t.r.take('nope')).toBe(false);
    expect(t.taken).toEqual(['anvil-1']);
  });

  it('readable after M32: the flag unlocks every taken rubbing and never an untaken one', () => {
    const t = setup();
    t.r.register(t.six);
    t.r.take('anvil-1');
    t.r.take('anvil-4');
    t.flags.add('story.m32.complete');
    t.r.derive();
    expect([...t.unlocked].sort()).toEqual(['lore.anvil-rubbings', 'lore.rubbing.anvil-1', 'lore.rubbing.anvil-4']);
  });

  it('M32 set first, then take: unlocks at once', () => {
    const t = setup();
    t.r.register(t.six);
    t.flags.add('story.m32.complete');
    t.r.take('anvil-3');
    expect(t.unlocked.has('lore.rubbing.anvil-3')).toBe(true);
    expect(t.unlocked.has('lore.rubbing.anvil-2')).toBe(false);
  });

  it('K2 registering after the flags are loaded re-derives its taken rubbings', () => {
    const t = setup();
    t.flags.add('world.rubbing.rock-1.taken');
    t.flags.add('story.m32.complete');
    t.r.register(t.six);
    expect(t.unlocked.has('lore.rubbing.rock-1')).toBe(false); // not registered yet
    t.r.register([{ id: 'rock-1' }, { id: 'rock-2' }]);
    expect(t.unlocked.has('lore.rubbing.rock-1')).toBe(true);
    expect(t.unlocked.has('lore.rubbing.rock-2')).toBe(false);
    expect(t.r.count()).toBe(1);
  });

  it('re-derives from the flags after a load (before M32, then after)', () => {
    const t = setup();
    t.r.register(t.six);
    t.flags.add('world.rubbing.anvil-5.taken');
    t.r.derive(); // load, M32 not done
    expect([...t.unlocked]).toEqual(['lore.anvil-rubbings']);
    t.flags.add('story.m32.complete');
    t.r.derive(); // load after M32
    expect(t.unlocked.has('lore.rubbing.anvil-5')).toBe(true);
  });

  it('the undo removes exactly the rubbings it added, once', () => {
    const t = setup();
    const off = t.r.register(t.six);
    off();
    off();
    expect(t.r.take('anvil-1')).toBe(false);
  });
});
