import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { codexEntry, type CodexEntryDef } from '../entries';
import { ACT4_CODEX_ENTRIES, ACT4_CODEX_IDS as ID } from './entries';
import { ACT4_CODEX_STRINGS_EN } from './strings.en';
import { ACT4_DISCOVER_UNLOCKS, ACT4_ITEM_UNLOCKS, ACT4_QUEST_UNLOCKS, ACT4_TALK_UNLOCKS, ACT4_WATCHED_FLAGS, act4Backfill } from './unlocks';
import { WASTE_CODEX_ROWS, type WasteCodexRow } from './wasteRows';
import '../service';

type CodexLike = { register?(entries: readonly CodexEntryDef[]): () => void; unlock?(id: string): void };
type InventoryLike = { items?(): { id: string; count: number }[] };

/** The bestiary defs and strings for L5's Waste creatures (the codex plugin's first-sight rule unlocks them by kind). */
export function wasteCreatureEntries(rows: readonly WasteCodexRow[]): { entries: CodexEntryDef[]; strings: Record<string, string> } {
  const entries: CodexEntryDef[] = [];
  const strings: Record<string, string> = {};
  for (const r of rows) {
    if (!r || typeof r.kind !== 'string' || typeof r.slug !== 'string') continue;
    entries.push(codexEntry('bestiary', r.kind, r.slug));
    for (const [k, v] of Object.entries(r.strings ?? {})) if (typeof v === 'string') strings[k] = v;
  }
  return { entries, strings };
}

/** Every entry this plugin registers: its own and L5's creatures. */
export function act4CodexEntries(rows: readonly WasteCodexRow[] = WASTE_CODEX_ROWS): CodexEntryDef[] {
  return [...ACT4_CODEX_ENTRIES, ...wasteCreatureEntries(rows).entries];
}

/**
 * Act 4 L9's codex (plans/act4-L9.md section 5), the K15 pattern: the entries are registered through the `codex` service
 * (bound lazily, retried until the codex plugin exists) and unlocked from the live events, re-derived from flags, quest states
 * and items on `save.loaded`. Bosses and the Waste creatures are bestiary entries, so the codex plugin's own rule (a boss
 * fight starts, a kind aggroes, the mercy tally) unlocks them too.
 */
const codexAct4: GamePlugin = {
  id: 'codex-act4',
  dependsOn: ['core', 'codex'],
  setup(ctx: GameContext) {
    const waste = wasteCreatureEntries(WASTE_CODEX_ROWS);
    ctx.strings.register('en', { ...ACT4_CODEX_STRINGS_EN, ...waste.strings });
    const all = [...ACT4_CODEX_ENTRIES, ...waste.entries];
    const svc = ctx.services as unknown as { get(name: string): unknown };
    const codex = (): CodexLike | undefined => svc.get('codex') as CodexLike | undefined;
    const warn = (m: string) => console.warn(m);
    const offs: Array<() => void> = [];

    let offCodex: (() => void) | null = null;
    const bind = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register(all);
    };
    offs.push(() => offCodex?.());
    const unlock = (id: string): void => {
      bind();
      codex()?.unlock?.(id);
    };

    const used = (flag: string): boolean => ctx.state.getBool(flag) || ctx.state.getNumber(flag) > 0 || (typeof ctx.state.getFlag(flag) === 'string' && ctx.state.getFlag(flag) !== '');
    const backfill = (): void => {
      try {
        const quests = svc.get('quests') as { state?(id: string): string } | undefined;
        const inv = svc.get('inventory') as InventoryLike | undefined;
        const ids = act4Backfill({
          flagSet: used,
          questState: (id) => {
            try {
              return quests?.state?.(id);
            } catch {
              return undefined;
            }
          },
          items: () => {
            try {
              return inv?.items?.();
            } catch (e) {
              warn(`codex-act4: inventory read failed: ${String(e)}`);
              return undefined;
            }
          },
        });
        for (const id of ids) unlock(id);
      } catch (e) {
        warn(`codex-act4: backfill failed: ${String(e)}`);
      }
    };

    const questEntries = (questId: unknown): void => {
      for (const u of ACT4_QUEST_UNLOCKS) if (u.quest === questId) unlock(u.entry);
    };
    offs.push(
      ctx.events.on('discover', (e) => {
        const entry = typeof e?.placeId === 'string' ? ACT4_DISCOVER_UNLOCKS[e.placeId] : undefined;
        if (entry) unlock(entry);
      }),
      ctx.events.on('region.entered', (e) => {
        if (e?.regionId === 'ashen-waste') unlock(ID.waste);
      }),
      ctx.events.on('weather.changed', (e) => {
        if (e?.kind === 'warning' || e?.kind === 'storm') unlock(ID.storms);
      }),
      ctx.events.on('dialogue.started', (e) => {
        const entry = typeof e?.npcId === 'string' ? ACT4_TALK_UNLOCKS[e.npcId] : undefined;
        if (entry) unlock(entry);
      }),
      ctx.events.on('quest.started', (e) => questEntries(e?.questId)),
      ctx.events.on('quest.completed', (e) => questEntries(e?.questId)),
      ctx.events.on('inventory.changed', (e) => {
        for (const u of ACT4_ITEM_UNLOCKS) if (e?.itemId === u.item && e.count > 0) unlock(u.entry);
      }),
      ctx.events.on('flag.changed', (e) => {
        if (typeof e?.key === 'string' && ACT4_WATCHED_FLAGS.has(e.key)) backfill();
      }),
      ctx.events.on('save.loaded', () => backfill()),
    );
    // The escort how-to: any escort, Act 2's or Act 4's (`escort.started { escortId }`).
    const onLoose = ctx.events.on as unknown as (n: string, f: () => void) => () => void;
    offs.push(onLoose.call(ctx.events, 'escort.started', () => unlock(ID.escorts)));

    bind();
    backfill();
    // The codex plugin may set up after this one: retry the binding until it has.
    const sys = ctx.systems.add({
      id: 'codex-act4.bind',
      fixedPhase: 'rules',
      order: 465,
      fixedUpdate() {
        if (!offCodex) {
          bind();
          if (offCodex) backfill();
        }
      },
    }) as unknown as (() => void) | undefined;
    if (typeof sys === 'function') offs.push(sys);
    ctx.systems.add({
      id: 'codex-act4.teardown',
      dispose() {
        for (const off of offs.splice(0).reverse()) off();
      },
    });
  },
};

export default codexAct4;
