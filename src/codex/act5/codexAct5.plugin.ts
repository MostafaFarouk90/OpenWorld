import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { codexEntry, type CodexEntryDef } from '../entries';
import { ACT5_CODEX_ENTRIES, ACT5_CODEX_IDS as ID } from './entries';
import { CALDERA_CODEX_ROWS, type CalderaCodexRow } from './rows';
import { ACT5_CODEX_STRINGS_EN } from './strings.en';
import { ACT5_ITEM_UNLOCKS, ACT5_QUEST_UNLOCKS, ACT5_TALK_UNLOCKS, ACT5_WATCHED_FLAGS, act5Backfill } from './unlocks';
import '../service';

export const ACT5_GATE_FLAG = 'story.gate.a5';
/** Skin rows (a base kind drawn differently in the Caldera) unlock when Alric's rim has been climbed. */
export const SKIN_ROW_UNLOCK_QUEST = 'm47';

type CodexLike = { register?(entries: readonly CodexEntryDef[]): () => void; unlock?(id: string): void };
type InventoryLike = { items?(): { id: string; count: number }[] };

/** Defs and strings for N5's rows. A skin row gets its own id (`skin.<slug>`) since its base kind's entry already exists. */
export function calderaCreatureEntries(rows: readonly CalderaCodexRow[]): { entries: CodexEntryDef[]; strings: Record<string, string>; skinIds: string[] } {
  const entries: CodexEntryDef[] = [];
  const strings: Record<string, string> = {};
  const skinIds: string[] = [];
  for (const r of rows) {
    if (!r || typeof r.kind !== 'string' || typeof r.slug !== 'string') continue;
    const id = r.skin ? `skin.${r.slug}` : r.kind;
    if (r.skin) skinIds.push(id);
    entries.push(codexEntry('bestiary', id, r.slug));
    for (const [k, v] of Object.entries(r.strings ?? {})) if (typeof v === 'string') strings[k] = v;
  }
  return { entries, strings, skinIds };
}

/** Act 5 N9's codex (plans/act5-N9.md section 8), the L9 pattern: registered through the `codex` service, unlocked live, re-derived on `save.loaded`. */
const codexAct5: GamePlugin = {
  id: 'codex-act5',
  dependsOn: ['core', 'codex'],
  setup(ctx: GameContext) {
    const creatures = calderaCreatureEntries(CALDERA_CODEX_ROWS);
    ctx.strings.register('en', { ...ACT5_CODEX_STRINGS_EN, ...creatures.strings });
    const all = [...ACT5_CODEX_ENTRIES, ...creatures.entries];
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
        const qs = (id: string): string | undefined => {
          try {
            return quests?.state?.(id);
          } catch {
            return undefined;
          }
        };
        const ids = act5Backfill({
          flagSet: used,
          questState: qs,
          items: () => {
            try {
              return inv?.items?.();
            } catch (e) {
              warn(`codex-act5: inventory read failed: ${String(e)}`);
              return undefined;
            }
          },
        });
        for (const id of ids) unlock(id);
        if (qs(SKIN_ROW_UNLOCK_QUEST) === 'completed') for (const s of creatures.skinIds) unlock(s);
      } catch (e) {
        warn(`codex-act5: backfill failed: ${String(e)}`);
      }
    };
    const questEntries = (questId: unknown): void => {
      for (const u of ACT5_QUEST_UNLOCKS) if (u.quest === questId) unlock(u.entry);
    };
    const loose = ctx.events.on as unknown as (n: string, f: (e: never) => void) => () => void;
    offs.push(
      ctx.events.on('region.entered', (e) => {
        if (e?.regionId === 'caldera') unlock(ID.caldera);
      }),
      ctx.events.on('dialogue.started', (e) => {
        const entry = typeof e?.npcId === 'string' ? ACT5_TALK_UNLOCKS[e.npcId] : undefined;
        if (entry && ctx.state.getBool(ACT5_GATE_FLAG)) unlock(entry);
      }),
      ctx.events.on('quest.started', (e) => questEntries(e?.questId)),
      // A completed quest unlocks too, except the skin rows which wait for the quest's end.
      ctx.events.on('quest.completed', (e) => {
        questEntries(e?.questId);
        // Skin rows wait for the quest's end, the same as the load path.
        if (e?.questId === SKIN_ROW_UNLOCK_QUEST) for (const s of creatures.skinIds) unlock(s);
      }),
      ctx.events.on('inventory.changed', (e) => {
        for (const u of ACT5_ITEM_UNLOCKS) if (e?.itemId === u.item && e.count > 0) unlock(u.entry);
      }),
      ctx.events.on('flag.changed', (e) => {
        if (typeof e?.key === 'string' && ACT5_WATCHED_FLAGS.has(e.key)) backfill();
      }),
      ctx.events.on('save.loaded', () => backfill()),
      loose.call(ctx.events, 'lava.entered', () => unlock(ID.lava)),
      loose.call(ctx.events, 'siege.wave.started', () => unlock(ID.siege)),
    );
    bind();
    backfill();
    const sys = ctx.systems.add({
      id: 'codex-act5.bind',
      fixedPhase: 'rules',
      order: 466,
      fixedUpdate() {
        if (!offCodex) {
          bind();
          if (offCodex) backfill();
        }
      },
    }) as unknown as (() => void) | undefined;
    if (typeof sys === 'function') offs.push(sys);
    ctx.systems.add({
      id: 'codex-act5.teardown',
      dispose() {
        for (const off of offs.splice(0).reverse()) off();
      },
    });
  },
};

export default codexAct5;
