// Lists the ids in a runtime rows file with how each resolves: `npx vite-node tools/env-pass/ids-report.ts src/env/<tile>.placements.json`.
import { readFileSync } from 'node:fs';
import { resolveModel } from '../../src/env/resolve';

const rows = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as Array<{ id: string }>;
const count: Record<string, number> = {};
for (const r of rows) count[r.id] = (count[r.id] ?? 0) + 1;
for (const [id, n] of Object.entries(count)) {
  const m = resolveModel(id);
  console.log(id, n, m.source, m.source === 'placeholder' ? m.shape : m.model);
}
