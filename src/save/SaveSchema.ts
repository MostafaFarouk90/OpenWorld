export const SAVE_FORMAT_VERSION = 1;

export type SaveReason = 'waystone' | 'timer' | 'rest' | 'manual' | 'zone' | 'exit';

const REASONS: ReadonlySet<string> = new Set<SaveReason>(['waystone', 'timer', 'rest', 'manual', 'zone', 'exit']);
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export interface SaveEntry {
  version: number;
  data: unknown;
}

export interface SaveFile {
  format: 1;
  savedAt: number;
  reason: SaveReason;
  playtimeSeconds: number;
  entries: Record<string, SaveEntry>;
}

export type ParseSaveResult = { ok: true; file: SaveFile } | { ok: false; reason: 'corrupt' | 'newer' };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Shape validation only. Entry data stays opaque (same reference). Entries named __proto__,
 * constructor or prototype are dropped. Returns a fresh container so the input is not aliased.
 */
export function parseSave(raw: unknown): ParseSaveResult {
  if (!isRecord(raw)) return { ok: false, reason: 'corrupt' };
  const format = has(raw, 'format') ? raw.format : undefined;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return { ok: false, reason: 'corrupt' };
  if (format > SAVE_FORMAT_VERSION) return { ok: false, reason: 'newer' };

  const { savedAt, reason, playtimeSeconds, entries } = raw;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return { ok: false, reason: 'corrupt' };
  if (typeof reason !== 'string' || !REASONS.has(reason)) return { ok: false, reason: 'corrupt' };
  if (typeof playtimeSeconds !== 'number' || !Number.isFinite(playtimeSeconds) || playtimeSeconds < 0) {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isRecord(entries)) return { ok: false, reason: 'corrupt' };

  const out: Record<string, SaveEntry> = {};
  for (const key of Object.keys(entries)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const e = entries[key];
    if (!isRecord(e) || !has(e, 'version')) return { ok: false, reason: 'corrupt' };
    const v = e.version;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return { ok: false, reason: 'corrupt' };
    out[key] = { version: v, data: e.data };
  }
  return {
    ok: true,
    file: { format: 1, savedAt, reason: reason as SaveReason, playtimeSeconds, entries: out },
  };
}
