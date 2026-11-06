// Dev only: the committed `?act4=` fixtures as lazy chunks, imported by the jump plugin behind `import.meta.env.DEV`, so a
// production build never reaches this module or its JSON.
import { act4FixtureName, type Act4FixtureMeta } from './act4FixtureKey';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act4/act4-*.json', { import: 'default' });

const path = (file: string) => `../save/__fixtures__/act4/${file}`;

/** The fixture's save and meta, or null when either is not committed. */
export async function findAct4Fixture(id: string): Promise<{ name: string; save: Record<string, unknown>; meta: Act4FixtureMeta } | null> {
  const name = act4FixtureName(id);
  const save = FILES[path(`${name}.json`)];
  const meta = FILES[path(`${name}.meta.json`)];
  if (!save || !meta) return null;
  const [s, m] = await Promise.all([save(), meta()]);
  return { name, save: s, meta: m as unknown as Act4FixtureMeta };
}
