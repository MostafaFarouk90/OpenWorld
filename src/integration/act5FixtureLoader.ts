// Dev only: the committed `?act5=` fixtures as lazy chunks, imported by the jump plugin behind `import.meta.env.DEV`, so a
// production build never reaches this module or its JSON (N12 PR 1, the Act 4 loader's pattern).
import { act5FixtureName, type Act5FixtureMeta } from './act5FixtureKey';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act5/act5-*.json', { import: 'default' });

const path = (file: string) => `../save/__fixtures__/act5/${file}`;

/** The fixture's save and meta, or null when either is not committed. */
export async function findAct5Fixture(id: string): Promise<{ name: string; save: Record<string, unknown>; meta: Act5FixtureMeta } | null> {
  const name = act5FixtureName(id);
  const save = FILES[path(`${name}.json`)];
  const meta = FILES[path(`${name}.meta.json`)];
  if (!save || !meta) return null;
  const [s, m] = await Promise.all([save(), meta()]);
  return { name, save: s, meta: m as unknown as Act5FixtureMeta };
}
