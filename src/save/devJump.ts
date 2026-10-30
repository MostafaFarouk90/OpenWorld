import { parseAct1 } from '../quests/act1Jump';
import { parseAct2 } from '../quests/act2Jump';
import { parseAct3 } from '../quests/act3Jump';
import { parseBellows } from '../shrine/bellowsDevHook';

/**
 * How a `&new` boot that names a dev jump (`?act1=`, `?act2=`, `?act3=`, `?bellows=1`) treats the save slot (review-b L2):
 * - `jump`: at least one jump is valid; its plugin holds saves for the session, so the boot neither loads nor clears the
 *   real slot.
 * - `refused`: every named jump is invalid, so no plugin will hold saves; the save plugin holds them itself, or the fresh
 *   game would autosave over the real slot.
 * - null: not a dev jump boot (no `&new`, no jump named, or a production build): the ordinary boot.
 */
export function devJumpBoot(search: string, dev: boolean = import.meta.env.DEV): 'jump' | 'refused' | null {
  if (!dev) return null;
  const params = new URLSearchParams(search);
  if (!params.has('new')) return null;
  const parsed = [parseAct1(search), parseAct2(search), parseAct3(search), parseBellows(search)].filter((p) => p !== null);
  if (parsed.length === 0) return null;
  return parsed.some((p) => !('error' in p)) ? 'jump' : 'refused';
}
