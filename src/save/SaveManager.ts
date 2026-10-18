import type { Persistable, SavePorts } from './ports';
import { parseSave, SAVE_FORMAT_VERSION, type SaveEntry, type SaveFile, type SaveReason } from './SaveSchema';
import { MemorySaveStore, type SaveStore, type StoreResult } from './SaveStore';

export const SLOT_AUTOSAVE = 'autosave';
export const SLOT_MANUAL = 'slot-0';
export const SLOT_BACKUP = 'slot-0.backup';
export const PLAYER_POSITION_KEY = 'player-position';
export const PLAYER_POSITION_VERSION = 1;

export type SaveOutcome =
  | { ok: true; file: SaveFile; slots: string[] }
  | {
      ok: false;
      reason: 'loading' | 'protected' | 'deferred' | 'skipped' | 'quota' | 'unavailable' | 'blocked' | 'aborted' | 'error';
    };

export type ContinueResult =
  | { ok: true; file: SaveFile; slot: string }
  | { ok: false; reason: 'no-save' | 'corrupt' | 'newer' | 'unavailable' };

export interface ApplyReport {
  applied: string[];
  /** Stored version newer than the code's: owner keeps defaults, entry retained verbatim. */
  refusedNewer: string[];
  /** Keys with no registered persistable: retained verbatim. */
  unregistered: string[];
  /** Registered keys absent from the save (keep defaults). */
  missing: string[];
  /** load() threw. */
  failed: string[];
  /** The 'player-position' entry (loaded by the caller through a safe teleport). */
  playerPosition?: SaveEntry;
}

export interface SaveManagerOptions {
  ports: SavePorts;
  store: SaveStore;
  /** Factory for the fallback used when the store is unavailable. Default: MemorySaveStore. */
  createFallbackStore?: () => SaveStore;
}

/** Slots a save of this reason is written to. Timer/exit/zone saves only touch the autosave slot. */
function slotsFor(reason: SaveReason): string[] {
  return reason === 'waystone' || reason === 'rest' || reason === 'manual' ? [SLOT_AUTOSAVE, SLOT_MANUAL] : [SLOT_AUTOSAVE];
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

interface Queued {
  reason: SaveReason;
  prebuilt?: SaveFile;
  d: Deferred<SaveOutcome>;
}

export class SaveManager {
  private readonly ports: SavePorts;
  private store: SaveStore;
  private readonly createFallbackStore: () => SaveStore;
  private usingFallback = false;
  private unavailableToasted = false;
  private quotaToasted = false;

  private playtime = 0;
  private loading = false;
  /** Entries kept verbatim (unregistered keys, refused newer versions) and merged into every write. */
  private retained = new Map<string, SaveEntry>();
  /** Previous value per key, used when a serializer throws. */
  private lastValues = new Map<string, SaveEntry>();

  private inFlight: Promise<SaveOutcome> | null = null;
  private queued: Queued | null = null;
  private deferredReason: SaveReason | null = null;
  private lastSafeSnapshot: SaveFile | null = null;

  /** Raw bad (corrupt) value waiting to be copied to the backup key in the next overwrite transaction. */
  private pendingBackup: { raw: unknown } | null = null;
  /** True after a newer-format save was found: no overwrite until newGame(). */
  private protectedSave = false;

  constructor(opts: SaveManagerOptions) {
    this.ports = opts.ports;
    this.store = opts.store;
    this.createFallbackStore = opts.createFallbackStore ?? (() => new MemorySaveStore());
  }

  // ---------------------------------------------------------------- state

  addPlaytime(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.playtime += seconds;
  }
  get playtimeSeconds(): number {
    return this.playtime;
  }
  get isLoading(): boolean {
    return this.loading;
  }
  get isUsingFallback(): boolean {
    return this.usingFallback;
  }
  get isProtected(): boolean {
    return this.protectedSave;
  }
  /** Retained entries (read-only copy), for tests and diagnostics. */
  retainedKeys(): string[] {
    return [...this.retained.keys()];
  }

  // ---------------------------------------------------------------- serialize / load

  /** Synchronous: every persistable sees one consistent state. */
  serializeAll(): Record<string, SaveEntry> {
    const out = new Map<string, SaveEntry>();
    for (const [k, e] of this.retained) out.set(k, e);

    for (const p of this.ports.persistables()) {
      if (p.key === PLAYER_POSITION_KEY) continue; // owned by ports.groundedPlayerState()
      const kept = this.retained.get(p.key);
      if (kept && kept.version > p.version) continue; // a refused newer entry wins over the owner
      this.captureEntry(out, p.key, p.version, () => p.serialize());
    }
    this.captureEntry(out, PLAYER_POSITION_KEY, PLAYER_POSITION_VERSION, () => this.ports.groundedPlayerState());

    return Object.fromEntries(out);
  }

  private captureEntry(out: Map<string, SaveEntry>, key: string, version: number, get: () => unknown): void {
    try {
      const data = get();
      if (data === undefined && key === PLAYER_POSITION_KEY) throw new Error('no grounded player state');
      const entry = { version, data };
      out.set(key, entry);
      this.lastValues.set(key, entry);
    } catch (error) {
      this.ports.log('error', `save: serialize failed for "${key}"; keeping previous value`, { error });
      const prev = this.lastValues.get(key);
      if (prev) out.set(key, prev);
      else out.delete(key);
    }
  }

  beginLoad(): void {
    this.loading = true;
    this.deferredReason = null;
    this.lastSafeSnapshot = null;
  }

  /** The settle step: saves are allowed again. */
  endLoad(): void {
    this.loading = false;
    this.lastSafeSnapshot = null;
  }

  /** Contract section 7. Does NOT emit save.loaded: the caller does, via ports.emitLoaded. */
  applyLoad(file: SaveFile): ApplyReport {
    this.playtime = file.playtimeSeconds;
    this.retained = new Map();
    this.lastValues = new Map();
    const report = this.applyEntries(Object.entries(file.entries), true);
    const seen = new Set(Object.keys(file.entries));
    for (const p of this.ports.persistables()) if (!seen.has(p.key)) report.missing.push(p.key);
    return report;
  }

  /** Load retained entries whose owner registered late. Entries that still cannot load stay retained. */
  reapplyRetained(): ApplyReport {
    const entries = [...this.retained.entries()];
    this.retained = new Map();
    return this.applyEntries(entries, false);
  }

  private applyEntries(entries: [string, SaveEntry][], fresh: boolean): ApplyReport {
    const report: ApplyReport = { applied: [], refusedNewer: [], unregistered: [], missing: [], failed: [] };
    const byKey = new Map<string, Persistable>();
    for (const p of this.ports.persistables()) if (!byKey.has(p.key)) byKey.set(p.key, p);

    for (const [key, entry] of entries) {
      if (key === PLAYER_POSITION_KEY) {
        report.playerPosition = entry;
        continue;
      }
      const p = byKey.get(key);
      if (!p) {
        this.retained.set(key, entry);
        if (fresh) this.ports.log('warn', `save: no persistable for "${key}"; entry kept verbatim`);
        report.unregistered.push(key);
        continue;
      }
      if (entry.version > p.version) {
        this.retained.set(key, entry);
        this.ports.log('warn', `save: "${key}" stored v${entry.version} is newer than code v${p.version}; refused`);
        report.refusedNewer.push(key);
        continue;
      }
      this.lastValues.set(key, entry);
      try {
        p.load(entry.data, entry.version);
        report.applied.push(key);
      } catch (error) {
        this.ports.log('error', `save: load threw for "${key}"; owner keeps defaults`, { error });
        report.failed.push(key);
      }
    }
    return report;
  }

  // ---------------------------------------------------------------- save requests

  /** Timer saves skip during hostile aggro; waystone (and every other) saves never do. */
  shouldSkipTimerSave(hostileAggro: boolean): boolean {
    return hostileAggro;
  }

  /** Convenience for autosave triggers: applies the aggro rule, then save(). */
  autosave(reason: SaveReason, hostileAggro = false): Promise<SaveOutcome> {
    if (reason === 'timer' && this.shouldSkipTimerSave(hostileAggro)) {
      this.ports.log('debug', 'save: timer save skipped during hostile aggro');
      return Promise.resolve({ ok: false, reason: 'skipped' });
    }
    return this.save(reason);
  }

  private gate(reason: SaveReason): SaveOutcome | null {
    if (this.loading) {
      this.ports.log('warn', `save: "${reason}" request dropped, a load is in progress`);
      return { ok: false, reason: 'loading' };
    }
    if (this.protectedSave) {
      this.ports.log('warn', `save: "${reason}" request dropped, a newer-format save is protected until New Game`);
      return { ok: false, reason: 'protected' };
    }
    const safety = this.ports.gameplaySafe();
    if (!safety.safe) {
      this.deferredReason = reason;
      this.ports.log('info', `save: "${reason}" deferred (${safety.reason ?? 'unsafe'})`);
      return { ok: false, reason: 'deferred' };
    }
    return null;
  }

  save(reason: SaveReason): Promise<SaveOutcome> {
    const blocked = this.gate(reason);
    if (blocked) return Promise.resolve(blocked);
    return this.enqueue(reason);
  }

  /** Call on cutscene.ended / dialogue.ended / actor.revived: runs a deferred save once it is safe. */
  notifySafe(): Promise<SaveOutcome> | undefined {
    const reason = this.deferredReason;
    if (!reason || this.loading) return undefined;
    if (!this.ports.gameplaySafe().safe) return undefined;
    this.deferredReason = null;
    return this.save(reason);
  }

  get hasDeferredSave(): boolean {
    return this.deferredReason !== null;
  }

  /** Record a snapshot while it is safe, to be written by snapshotForExit() when it no longer is. */
  captureSnapshot(): boolean {
    if (this.loading || this.protectedSave || !this.ports.gameplaySafe().safe) return false;
    this.lastSafeSnapshot = this.buildFile('exit');
    return true;
  }

  /** pagehide / visibilitychange hidden. Writes the freshest safe state available. */
  snapshotForExit(): Promise<SaveOutcome> {
    if (this.loading) {
      this.ports.log('warn', 'save: exit snapshot dropped, a load is in progress');
      return Promise.resolve({ ok: false, reason: 'loading' });
    }
    if (this.protectedSave) return Promise.resolve({ ok: false, reason: 'protected' });
    if (this.ports.gameplaySafe().safe) {
      this.captureSnapshot();
    }
    const snap = this.lastSafeSnapshot;
    if (!snap) {
      this.ports.log('info', 'save: no safe snapshot for exit');
      return Promise.resolve({ ok: false, reason: 'deferred' });
    }
    return this.enqueue('exit', snap);
  }

  private buildFile(reason: SaveReason): SaveFile {
    return {
      format: SAVE_FORMAT_VERSION,
      savedAt: this.ports.now(),
      reason,
      playtimeSeconds: this.playtime,
      entries: this.serializeAll(),
    };
  }

  // ---------------------------------------------------------------- single-flight queue

  private enqueue(reason: SaveReason, prebuilt?: SaveFile): Promise<SaveOutcome> {
    if (!this.inFlight) return this.start(reason, prebuilt);
    if (this.queued) {
      this.queued.reason = reason; // latest wins
      this.queued.prebuilt = prebuilt;
      return this.queued.d.promise;
    }
    this.queued = { reason, prebuilt, d: deferred<SaveOutcome>() };
    return this.queued.d.promise;
  }

  private start(reason: SaveReason, prebuilt?: SaveFile): Promise<SaveOutcome> {
    const p = this.doWrite(reason, prebuilt).then((outcome) => {
      this.inFlight = null;
      const q = this.queued;
      if (q) {
        this.queued = null;
        void this.startQueued(q);
      }
      return outcome;
    });
    this.inFlight = p;
    return p;
  }

  private startQueued(q: Queued): Promise<void> {
    // Re-check the gates at start time: state may have become unsafe while the previous write ran.
    const blocked = q.prebuilt ? this.loadGate(q.reason) : this.gate(q.reason);
    if (blocked) {
      q.d.resolve(blocked);
      return Promise.resolve();
    }
    return this.start(q.reason, q.prebuilt).then(q.d.resolve);
  }

  private loadGate(reason: SaveReason): SaveOutcome | null {
    if (this.loading) return { ok: false, reason: 'loading' };
    if (this.protectedSave) {
      this.ports.log('warn', `save: "${reason}" request dropped (protected)`);
      return { ok: false, reason: 'protected' };
    }
    return null;
  }

  // ---------------------------------------------------------------- write path

  private ensureStore(): void {
    if (!this.usingFallback && !this.store.available) this.switchToFallback('store unavailable');
  }

  private switchToFallback(why: string): void {
    this.store = this.createFallbackStore();
    this.usingFallback = true;
    this.ports.log('warn', `save: falling back to in-memory store (${why})`);
    if (!this.unavailableToasted) {
      this.unavailableToasted = true;
      this.ports.toast('save.unavailable');
    }
  }

  private async doWrite(reason: SaveReason, prebuilt?: SaveFile): Promise<SaveOutcome> {
    try {
      // Everything up to the first await is synchronous: the snapshot is taken now.
      const file = prebuilt ?? this.buildFile(reason);
      if (!prebuilt) this.lastSafeSnapshot = file;
      const slots = slotsFor(reason);
      this.ensureStore();

      let res = await this.putAll(file, slots);
      if (!res.ok && res.reason === 'unavailable' && !this.usingFallback) {
        this.switchToFallback('write reported unavailable');
        res = await this.putAll(file, slots);
      }
      if (!res.ok && res.reason === 'quota') {
        const dropped = await this.dropBackupIfDisposable();
        if (dropped) res = await this.putAll(file, slots);
        if (!res.ok && res.reason === 'quota') {
          this.ports.log('error', 'save: quota exceeded; continuing without saving');
          if (!this.quotaToasted) {
            this.quotaToasted = true;
            this.ports.toast('save.quota');
          }
        }
      }
      if (res.ok) {
        this.quotaToasted = false;
        this.pendingBackup = null;
        this.ports.log('debug', `save: wrote ${slots.join('+')} (${reason})`);
        return { ok: true, file, slots };
      }
      this.ports.log('error', `save: write failed (${res.reason})`, { error: res.error });
      return { ok: false, reason: res.reason };
    } catch (error) {
      this.ports.log('error', 'save: unexpected failure in write', { error });
      return { ok: false, reason: 'error' };
    }
  }

  private async putAll(file: SaveFile, slots: string[]): Promise<StoreResult<void>> {
    try {
      const items: { slot: string; value: unknown }[] = [];
      if (this.pendingBackup && (await this.mayWriteBackup())) {
        items.push({ slot: SLOT_BACKUP, value: this.pendingBackup.raw });
      }
      for (const slot of slots) items.push({ slot, value: file });
      if (items.length === 1) return await this.store.write(items[0].slot, file);
      return await this.store.writeMany(items); // backup + slots in ONE transaction
    } catch (error) {
      return { ok: false, reason: 'error', error };
    }
  }

  /** A corrupt blob must not replace a newer-format backup, which may still be recoverable. */
  private async mayWriteBackup(): Promise<boolean> {
    const existing = await this.safeRead(SLOT_BACKUP);
    if (!existing.ok || existing.value === undefined) return true;
    const parsed = parseSave(existing.value);
    return !(!parsed.ok && parsed.reason === 'newer');
  }

  /** Quota path: the backup is dropped only if it parses at a format no newer than current. */
  private async dropBackupIfDisposable(): Promise<boolean> {
    const existing = await this.safeRead(SLOT_BACKUP);
    if (!existing.ok || existing.value === undefined) return false;
    if (!parseSave(existing.value).ok) {
      this.ports.log('warn', 'save: keeping unreadable or newer-format backup despite quota pressure');
      return false;
    }
    const del = await this.safeDelete(SLOT_BACKUP);
    if (del.ok) this.ports.log('warn', 'save: dropped old backup to free quota');
    return del.ok;
  }

  private async safeRead(slot: string): Promise<StoreResult<unknown>> {
    try {
      return await this.store.read(slot);
    } catch (error) {
      return { ok: false, reason: 'error', error };
    }
  }
  private async safeDelete(slot: string): Promise<StoreResult<void>> {
    try {
      return await this.store.delete(slot);
    } catch (error) {
      return { ok: false, reason: 'error', error };
    }
  }

  // ---------------------------------------------------------------- continue / new game

  async continue(): Promise<ContinueResult> {
    try {
      if (!this.usingFallback && !this.store.available) {
        this.switchToFallback('store unavailable');
        return { ok: false, reason: 'unavailable' };
      }
      const slots = [SLOT_AUTOSAVE, SLOT_MANUAL];
      const reads = await Promise.all(slots.map((s) => this.safeRead(s)));
      if (reads.every((r) => !r.ok)) {
        const first = reads.find((r) => !r.ok);
        if (first && !first.ok && first.reason === 'unavailable' && !this.usingFallback) {
          this.switchToFallback('read reported unavailable');
        }
        return { ok: false, reason: 'unavailable' };
      }

      let best: { file: SaveFile; slot: string } | null = null;
      let newerRaw: unknown;
      let sawNewer = false;
      let corruptRaw: unknown;
      let sawCorrupt = false;
      reads.forEach((r, i) => {
        if (!r.ok || r.value === undefined) return;
        const parsed = parseSave(r.value);
        if (parsed.ok) {
          if (!best || parsed.file.savedAt > best.file.savedAt) best = { file: parsed.file, slot: slots[i] };
        } else if (parsed.reason === 'newer') {
          if (!sawNewer) newerRaw = r.value;
          sawNewer = true;
        } else {
          if (!sawCorrupt) corruptRaw = r.value;
          sawCorrupt = true;
        }
      });

      if (sawNewer) {
        // Never overwrite: back it up now (nothing else will be written) and protect until New Game.
        this.protectedSave = true;
        this.pendingBackup = { raw: newerRaw };
        if (await this.mayWriteBackup()) {
          const w = await this.store.write(SLOT_BACKUP, newerRaw as SaveFile);
          if (!w.ok) this.ports.log('error', `save: could not back up newer-format save (${w.reason})`);
        }
        this.pendingBackup = null;
        this.ports.log('warn', 'save: newer-format save found; refusing to load or overwrite');
        return { ok: false, reason: 'newer' };
      }
      if (sawCorrupt) {
        this.pendingBackup = { raw: corruptRaw }; // written in the same transaction as the first overwrite
        this.ports.log('warn', 'save: corrupt save found');
      }
      if (best) return { ok: true, file: (best as { file: SaveFile }).file, slot: (best as { slot: string }).slot };
      return { ok: false, reason: sawCorrupt ? 'corrupt' : 'no-save' };
    } catch (error) {
      this.ports.log('error', 'save: continue failed', { error });
      return { ok: false, reason: 'unavailable' };
    }
  }

  /** Backs up the existing save, then clears both slots and resets in-memory save state. */
  async newGame(): Promise<{ ok: boolean }> {
    let ok = true;
    try {
      this.ensureStore();
      const candidate = await this.pickBackupCandidate();
      if (candidate !== undefined && (await this.mayWriteBackup())) {
        const w = await this.store.writeMany([{ slot: SLOT_BACKUP, value: candidate }]);
        if (!w.ok) this.ports.log('warn', `save: newGame could not write backup (${w.reason})`);
      }
      for (const slot of [SLOT_AUTOSAVE, SLOT_MANUAL]) {
        const d = await this.safeDelete(slot);
        if (!d.ok) {
          ok = false;
          this.ports.log('error', `save: newGame could not clear ${slot} (${d.reason})`);
        }
      }
    } catch (error) {
      ok = false;
      this.ports.log('error', 'save: newGame failed', { error });
    }
    this.protectedSave = false;
    this.pendingBackup = null;
    this.retained = new Map();
    this.lastValues = new Map();
    this.playtime = 0;
    this.deferredReason = null;
    this.lastSafeSnapshot = null;
    return { ok };
  }

  private async pickBackupCandidate(): Promise<unknown> {
    if (this.pendingBackup) return this.pendingBackup.raw;
    let best: { v: unknown; at: number } | undefined;
    for (const slot of [SLOT_AUTOSAVE, SLOT_MANUAL]) {
      const r = await this.safeRead(slot);
      if (!r.ok || r.value === undefined) continue;
      const parsed = parseSave(r.value);
      const at = parsed.ok ? parsed.file.savedAt : -1;
      if (!best || at > best.at) best = { v: r.value, at };
    }
    return best?.v;
  }
}
