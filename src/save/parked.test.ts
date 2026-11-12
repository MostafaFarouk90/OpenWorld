// G3 (New Game+): the parked world slot (slot-0.parked) and the one-transaction switch.
import { describe, expect, it, vi } from 'vitest';
import type { SavePorts } from './ports';
import { SaveManager, SLOT_AUTOSAVE, SLOT_BACKUP, SLOT_MANUAL, SLOT_PARKED } from './SaveManager';
import type { SaveFile } from './SaveSchema';
import { MemorySaveStore, type SaveStore } from './SaveStore';

const ports = (): SavePorts => ({
  persistables: () => [{ key: 'a', version: 1, serialize: () => 'live', load: () => {} }],
  emitLoaded: vi.fn(),
  now: () => 5,
  log: () => {},
  gameplaySafe: () => ({ safe: true }),
  groundedPlayerState: () => ({ x: 0, y: 0, z: 0, yaw: 0 }),
  toast: () => {},
});
const file = (tag: string, playtime = 10): SaveFile => ({ format: 1, savedAt: 1, reason: 'manual', playtimeSeconds: playtime, entries: { a: { version: 1, data: tag } } });

describe('SaveManager parked world (G3)', () => {
  it('park writes the away world and the next save in one transaction, and reads it back', async () => {
    const store = new MemorySaveStore();
    const writeMany = vi.spyOn(store, 'writeMany');
    const m = new SaveManager({ ports: ports(), store });
    expect(await m.readParked()).toBeNull();
    expect(await m.park(file('ended'), file('hearth', 99))).toEqual({ ok: true });
    expect(writeMany).toHaveBeenCalledOnce();
    expect(writeMany.mock.calls[0]![0].map((i) => i.slot)).toEqual([SLOT_PARKED, SLOT_AUTOSAVE, SLOT_MANUAL]);
    expect((await m.readParked())?.entries.a!.data).toBe('ended');
    const c = await m.continue();
    expect(c.ok && c.file.entries.a!.data).toBe('hearth');
    expect(m.playtimeSeconds).toBe(99);
  });

  it('a failed write changes nothing', async () => {
    const store = new MemorySaveStore();
    vi.spyOn(store, 'writeMany').mockResolvedValue({ ok: false, reason: 'quota' });
    const m = new SaveManager({ ports: ports(), store });
    m.addPlaytime(7);
    expect(await m.park(file('ended'), file('hearth', 99))).toEqual({ ok: false });
    expect(m.playtimeSeconds).toBe(7);
    expect(await m.readParked()).toBeNull();
  });

  it('an unreadable parked value reads as none; a newer-format save is never overwritten', async () => {
    const store = new MemorySaveStore();
    await store.writeMany([{ slot: SLOT_PARKED, value: { junk: true } }]);
    const m = new SaveManager({ ports: ports(), store });
    expect(await m.readParked()).toBeNull();
    const s2: SaveStore = new MemorySaveStore();
    await s2.writeMany([{ slot: SLOT_AUTOSAVE, value: { ...file('x'), format: 99 } }]);
    const m2 = new SaveManager({ ports: ports(), store: s2 });
    await m2.continue();
    expect(await m2.park(file('a'), file('b'))).toEqual({ ok: false });
  });

  it('an unreadable parked world is backed up in the same write that replaces it', async () => {
    const store = new MemorySaveStore();
    await store.writeMany([{ slot: SLOT_PARKED, value: { junk: true } }]);
    const m = new SaveManager({ ports: ports(), store });
    expect(await m.hasParked()).toBe(true);
    expect(await m.park(file('ended'), file('hearth'))).toEqual({ ok: true });
    const b = await store.read(SLOT_BACKUP);
    expect(b.ok && b.value).toEqual({ junk: true });
    expect((await m.readParked())?.entries.a!.data).toBe('ended');
  });

  it('snapshotFile is the live state', () => {
    const m = new SaveManager({ ports: ports(), store: new MemorySaveStore() });
    expect(m.snapshotFile().entries.a!.data).toBe('live');
  });
});
