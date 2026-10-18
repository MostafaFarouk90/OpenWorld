import { describe, expect, it } from 'vitest';
import { parseSave, SAVE_FORMAT_VERSION } from './SaveSchema';

const valid = () => ({
  format: 1,
  savedAt: 1000,
  reason: 'timer',
  playtimeSeconds: 12.5,
  entries: { quests: { version: 2, data: { a: 1 } }, world: { version: 0, data: null } },
});

describe('parseSave', () => {
  it('parses a valid file', () => {
    const r = parseSave(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.entries.quests).toEqual({ version: 2, data: { a: 1 } });
      expect(r.file.playtimeSeconds).toBe(12.5);
    }
    expect(SAVE_FORMAT_VERSION).toBe(1);
  });

  it('accepts an empty entries object', () => {
    expect(parseSave({ ...valid(), entries: {} }).ok).toBe(true);
  });

  it('rejects missing entries', () => {
    const v: Record<string, unknown> = valid();
    delete v.entries;
    expect(parseSave(v)).toEqual({ ok: false, reason: 'corrupt' });
  });

  it.each([[null], [[]], ['x'], [5]])('rejects entries that are not an object (%j)', (entries) => {
    expect(parseSave({ ...valid(), entries })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects an entry without version', () => {
    expect(parseSave({ ...valid(), entries: { a: { data: 1 } } })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it.each([[1.5], [-1], ['1'], [NaN], [Infinity], [null]])('rejects invalid entry version %j', (version) => {
    expect(parseSave({ ...valid(), entries: { a: { version, data: 1 } } })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects an entry that is not an object', () => {
    expect(parseSave({ ...valid(), entries: { a: 5 } })).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave({ ...valid(), entries: { a: null } })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('reports format 2 as newer, even when the rest of the shape is unknown', () => {
    expect(parseSave({ ...valid(), format: 2 })).toEqual({ ok: false, reason: 'newer' });
    expect(parseSave({ format: 9, weird: true })).toEqual({ ok: false, reason: 'newer' });
  });

  it.each([[0], [-1], [1.5], ['1'], [undefined], [null]])('rejects format %j as corrupt', (format) => {
    expect(parseSave({ ...valid(), format })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it.each([[null], [undefined], ['str'], [[]], [42], [true]])('rejects non-object input %j', (raw) => {
    expect(parseSave(raw)).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects bad savedAt, reason and playtime', () => {
    expect(parseSave({ ...valid(), savedAt: 'now' }).ok).toBe(false);
    expect(parseSave({ ...valid(), savedAt: NaN }).ok).toBe(false);
    expect(parseSave({ ...valid(), reason: 'whatever' }).ok).toBe(false);
    expect(parseSave({ ...valid(), reason: 3 }).ok).toBe(false);
    expect(parseSave({ ...valid(), playtimeSeconds: -1 }).ok).toBe(false);
    expect(parseSave({ ...valid(), playtimeSeconds: undefined }).ok).toBe(false);
  });

  it('drops prototype-pollution keys', () => {
    const raw = JSON.parse(
      '{"format":1,"savedAt":1,"reason":"manual","playtimeSeconds":0,"entries":' +
        '{"__proto__":{"version":1,"data":1},"constructor":{"version":1,"data":2},"prototype":{"version":1,"data":3},"ok":{"version":1,"data":4}}}',
    );
    const r = parseSave(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.file.entries)).toEqual(['ok']);
      expect(({} as Record<string, unknown>).version).toBeUndefined();
      expect(Object.getPrototypeOf(r.file.entries)).toBe(Object.prototype);
    }
  });

  it('does not let a bad dropped key fail the file', () => {
    const raw = JSON.parse(
      '{"format":1,"savedAt":1,"reason":"manual","playtimeSeconds":0,"entries":{"__proto__":"garbage","a":{"version":0,"data":1}}}',
    );
    const r = parseSave(raw);
    expect(r.ok).toBe(true);
  });

  it('keeps entry data by reference and parses huge entries', () => {
    const data = { big: new Array(100_000).fill('x') };
    const r = parseSave({ ...valid(), entries: { big: { version: 1, data } } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.entries.big.data).toBe(data);
  });

  it('allows an entry with missing data (opaque, undefined)', () => {
    const r = parseSave({ ...valid(), entries: { a: { version: 1 } } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.entries.a.data).toBeUndefined();
  });

  it('does not alias the input container', () => {
    const raw = valid();
    const r = parseSave(raw);
    if (!r.ok) throw new Error('unreachable');
    expect(r.file.entries).not.toBe(raw.entries);
  });
});
