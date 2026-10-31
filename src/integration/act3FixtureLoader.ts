// Dev only: the committed `?act3=` fixtures as lazy chunks, imported by the jump plugin behind `import.meta.env.DEV`, so a
// production build never reaches this module or its JSON.
import type { Act3Order } from '../quests/act3Jump';
import { act3FixtureName, type Act3FixtureMeta } from './act3FixtureKey';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act3/*.json', { import: 'default' });

const path = (file: string) => `../save/__fixtures__/act3/${file}`;

/** The fixture's save and meta, or null when either is not committed. */
export async function findAct3Fixture(
  order: Act3Order, id: string,
): Promise<{ name: string; save: Record<string, unknown>; meta: Act3FixtureMeta } | null> {
  const name = act3FixtureName(order, id);
  const save = FILES[path(`${name}.json`)];
  const meta = FILES[path(`${name}.meta.json`)];
  if (!save || !meta) return null;
  const [s, m] = await Promise.all([save(), meta()]);
  return { name, save: s, meta: m as unknown as Act3FixtureMeta };
}
