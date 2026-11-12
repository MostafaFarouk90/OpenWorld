// G3 New Game+ ("Second Hearth", design 12.5): the save transform. Pure, so the boot path, the in-game path and the tests
// share it. A Second Hearth is never a live reset: the carried entries are kept, every other entry is dropped (its owner
// loads fresh-game defaults), and the `ngplus` entry counts the cycle.
import { AFTER_ENDING_FLAG, M56_CHOICE_FLAG } from '../afterEnding/flags';
import { parseSave, SAVE_FORMAT_VERSION, type SaveEntry, type SaveFile } from '../save/SaveSchema';
import { CARRIED_KEYS, KEPT_QUEST_ITEMS, NGPLUS_KEY, NGPLUS_VERSION, TUTORIAL_NOT_BEGUN } from './tuning';

export interface NgPlusState {
  /** 0 on a first playthrough; 1 in the first Second Hearth, and so on. */
  cycle: number;
  /** The endings this save line has reached, oldest first ('rekindle' | 'let-it-die'); a repeat is listed once. */
  endingsSeen: string[];
}

export const EMPTY_NGPLUS: Readonly<NgPlusState> = Object.freeze({ cycle: 0, endingsSeen: [] as string[] });

export type SecondHearthResult = { ok: true; file: SaveFile; state: NgPlusState } | { ok: false; reason: 'corrupt' | 'newer' | 'not-ended' };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `ngplus` entry's data, read leniently (anything malformed reads as a first playthrough). */
export function readNgPlus(data: unknown): NgPlusState {
  if (!isRecord(data)) return { cycle: 0, endingsSeen: [] };
  const c = data.cycle;
  const cycle = typeof c === 'number' && Number.isInteger(c) && c >= 0 ? c : 0;
  const seen = Array.isArray(data.endingsSeen) ? data.endingsSeen.filter((e): e is string => typeof e === 'string') : [];
  return { cycle, endingsSeen: [...new Set(seen)] };
}

function flagsOf(file: SaveFile): Record<string, unknown> {
  const ws = file.entries['world-state']?.data;
  return isRecord(ws) && isRecord(ws.flags) ? ws.flags : {};
}

/** The save reached the ending (N12's `world.afterEnding`). */
export function isEndedSave(file: SaveFile): boolean {
  return Boolean(flagsOf(file)[AFTER_ENDING_FLAG]);
}

/** The Second Hearth cycle a save is on (0 = first playthrough). */
export function cycleOf(file: SaveFile): number {
  return readNgPlus(file.entries[NGPLUS_KEY]?.data).cycle;
}

/** The inventory with every quest item taken out (ammunition stays); equipped slots naming a removed item are cleared. */
export function stripQuestItems(data: unknown, kindOf: (id: string) => string | undefined): unknown {
  if (!isRecord(data)) return data;
  const out: Record<string, unknown> = { ...data };
  const removed = new Set<string>();
  if (isRecord(data.items)) {
    const items: Record<string, unknown> = {};
    for (const [id, n] of Object.entries(data.items)) {
      if (kindOf(id) === 'quest' && !KEPT_QUEST_ITEMS.has(id)) removed.add(id);
      else items[id] = n;
    }
    out.items = items;
  }
  if (isRecord(data.equipped)) {
    const eq: Record<string, unknown> = {};
    for (const [slot, id] of Object.entries(data.equipped)) if (!(typeof id === 'string' && removed.has(id))) eq[slot] = id;
    out.equipped = eq;
  }
  if (isRecord(data.gear)) {
    const gear: Record<string, unknown> = {};
    for (const [id, g] of Object.entries(data.gear)) if (!removed.has(id)) gear[id] = g;
    out.gear = gear;
  }
  return out;
}

/**
 * Builds the Second Hearth save from an ended save (design 12.5). `kindOf` names an item's kind (`getItem(id)?.kind`); an
 * unknown id is kept. `now` stamps the file. Refuses a save that has not reached the ending.
 */
export function buildSecondHearth(raw: unknown, kindOf: (id: string) => string | undefined, now: number): SecondHearthResult {
  const parsed = parseSave(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const ended = parsed.file;
  if (!isEndedSave(ended)) return { ok: false, reason: 'not-ended' };

  const before = readNgPlus(ended.entries[NGPLUS_KEY]?.data);
  const choice = flagsOf(ended)[M56_CHOICE_FLAG];
  const endingsSeen = typeof choice === 'string' && !before.endingsSeen.includes(choice) ? [...before.endingsSeen, choice] : [...before.endingsSeen];
  const state: NgPlusState = { cycle: before.cycle + 1, endingsSeen };

  const entries: Record<string, SaveEntry> = {};
  for (const key of CARRIED_KEYS) {
    const e = ended.entries[key];
    if (!e || key === NGPLUS_KEY) continue;
    // A deep copy: the ended save is kept as it was (it is parked, not replaced).
    const data = JSON.parse(JSON.stringify(e.data ?? null)) as unknown;
    entries[key] = { version: e.version, data: key === 'inventory' ? stripQuestItems(data, kindOf) : data };
  }
  entries.tutorial = JSON.parse(JSON.stringify(TUTORIAL_NOT_BEGUN)) as SaveEntry;
  entries[NGPLUS_KEY] = { version: NGPLUS_VERSION, data: state };
  return {
    ok: true,
    state,
    file: { format: SAVE_FORMAT_VERSION as 1, savedAt: now, reason: 'manual', playtimeSeconds: ended.playtimeSeconds, entries },
  };
}
