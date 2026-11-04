import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { CodexEntryDef } from '../entries';
import { ACT3_CODEX_ENTRIES, ACT3_CODEX_IDS as ID } from './entries';
import { ACT3_CODEX_STRINGS_EN } from './strings.en';
import { areaAt } from '../../region/areas';
import { ACT3_DISCOVER_UNLOCKS, SUMMIT_AREA, ACT3_WATCHED_FLAGS, SHARD_GEM_PREFIX, act3Backfill } from './unlocks';
import '../service';

type CodexLike = { register?(entries: readonly CodexEntryDef[]): () => void; unlock?(id: string): void };
type InventoryLike = { items?(): { id: string; count: number }[] };

const offs: Array<() => void> = [];

/**
 * K15 PR 1's codex half: registers the Greyfen entries through the `codex` service (bound lazily, as K6b's fen plugin does,
 * so `codex.plugin.ts` is not edited) and unlocks them from the live events of K3, K7 and K10, re-derived from flags and
 * items on `save.loaded`. The unlock ids are listed in `unlocks.ts`.
 */
const codexAct3: GamePlugin = {
  id: 'codex-act3',
  dependsOn: ['core', 'codex'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', ACT3_CODEX_STRINGS_EN);
    const svc = ctx.services as unknown as { get(name: string): unknown };
    const codex = (): CodexLike | undefined => svc.get('codex') as CodexLike | undefined;
    const warn = (m: string) => console.warn(m);

    let offCodex: (() => void) | null = null;
    const bind = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register(ACT3_CODEX_ENTRIES);
    };
    offs.push(() => offCodex?.());

    const unlock = (id: string): void => {
      bind();
      codex()?.unlock?.(id);
    };

    const used = (flag: string): boolean => ctx.state.getBool(flag) || ctx.state.getNumber(flag) > 0;
    const backfill = (): void => {
      try {
        const inv = svc.get('inventory') as InventoryLike | undefined;
        // A failing inventory read loses only the item-driven entries; the flags still count.
        const items = (): { id: string; count: number }[] | undefined => {
          try {
            return inv?.items?.();
          } catch (e) {
            warn(`codex-act3: inventory read failed: ${String(e)}`);
            return undefined;
          }
        };
        for (const id of act3Backfill({ flagSet: used, items })) unlock(id);
      } catch (e) {
        warn(`codex-act3: backfill failed: ${String(e)}`);
      }
    };

    let inSummit = false;
    let summitDone = false;
    offs.push(
      ctx.events.on('discover', (e) => {
        const entry = typeof e?.placeId === 'string' ? ACT3_DISCOVER_UNLOCKS[e.placeId] : undefined;
        if (entry) unlock(entry);
      }),
      ctx.events.on('region.entered', (e) => {
        if (e?.regionId === 'greyfen') unlock(ID.greyfen);
        else if (e?.regionId === 'dragonspine') unlock(ID.dragonspine);
      }),
      ctx.events.on('water.entered', (e) => {
        if (e?.kind === 'wade') unlock(ID.wading);
      }),
      ctx.events.on('dive.started', () => unlock(ID.diving)),
      ctx.events.on('glide.started', () => unlock(ID.gliding)),
      ctx.events.on('ferry.boarded', () => unlock(ID.ferry)),
      ctx.events.on('gear.socketed', () => unlock(ID.shardGems)),
      ctx.events.on('inventory.changed', (e) => {
        if (typeof e?.itemId === 'string' && e.itemId.startsWith(SHARD_GEM_PREFIX) && e.count > 0) unlock(ID.shardGems);
        else if (e?.itemId === 'key.ferry-token' && e.count > 0) unlock(ID.ferry);
      }),
      ctx.events.on('flag.changed', (e) => {
        if (typeof e?.key === 'string' && ACT3_WATCHED_FLAGS.has(e.key)) backfill();
      }),
      ctx.events.on('save.loaded', () => {
        // A load may have taken the summit entry away: poll again until it is unlocked.
        summitDone = false;
        inSummit = false;
        backfill();
      }),
    );

    bind();
    backfill();
    // The summit how-to: no event says the player crossed into the area, so the player's feet are polled (cheap, and the
    // unlock is idempotent; it only asks the codex when the area changes).
    offs.push(
      ctx.systems.add({
        id: 'codex-act3.summit',
        fixedPhase: 'rules',
        order: 464,
        fixedUpdate() {
          if (summitDone) return;
          const f = ctx.player?.feet;
          const now = !!f && areaAt(f.x, f.z) === SUMMIT_AREA;
          if (now && !inSummit) {
            unlock(ID.summit);
            summitDone = true;
          }
          inSummit = now;
        },
      }) as unknown as () => void,
    );
    // The codex plugin may set up after this one: retry the binding until it has.
    offs.push(
      ctx.systems.add({
        id: 'codex-act3.bind',
        fixedPhase: 'rules',
        order: 463,
        fixedUpdate() {
          if (!offCodex) {
            bind();
            if (offCodex) backfill();
          }
        },
      }) as unknown as () => void,
    );
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) off();
  },
};

export default codexAct3;
