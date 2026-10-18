import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import type { LayoutData } from './layoutTypes';

export interface AnchorsDocMeta {
  title: string;
  /** Layout source file name, for the header line. */
  source: string;
  /** Generator command, for the header line. */
  command?: string;
}

/** The anchor, trigger and structure tables as Markdown; ANCHORS.md must equal this (see anchorsDoc.test.ts). */
export function renderAnchorsDoc(
  layout: LayoutData = BRIGHTWATER_LAYOUT,
  meta: AnchorsDocMeta = { title: 'Brightwater anchors, triggers and structures', source: 'brightwater.layout.ts' },
): string {
  const f = (n: number) => String(Math.round(n * 100) / 100);
  const lines = [
    `# ${meta.title}`,
    '',
    `Generated from \`${meta.source}\` by \`${meta.command ?? 'npx vite-node tools/gen-region-docs.ts'}\`; a test fails when this file drifts.`,
    'Metres from the origin, +Z north, yaw 0 faces -Z, yaw 90 faces -X. Anchor `y` is absolute and computed from the terrain at runtime.',
    '',
    '## Anchors',
    '',
    '| id | x | z | dy | yaw | tags |',
    '| --- | --- | --- | --- | --- | --- |',
    ...layout.anchors.map((a) => `| ${a.id} | ${f(a.x)} | ${f(a.z)} | ${f(a.dy ?? 0)} | ${f(a.yawDeg)} | ${(a.tags ?? []).join(', ')} |`),
    '',
    '## Triggers',
    '',
    '| id | shape | x | z | size |',
    '| --- | --- | --- | --- | --- |',
    ...layout.triggers.map((t) => `| ${t.id} | ${t.shape} | ${f(t.x)} | ${f(t.z)} | ${t.shape === 'sphere' ? `r ${f(t.radius)}` : `half ${t.half.map(f).join(' x ')}`} |`),
    '',
    '## Structures',
    '',
    '| id | kind | x | z | footprint | mode |',
    '| --- | --- | --- | --- | --- | --- |',
    ...layout.structures.map((s) => `| ${s.id} | ${s.kind} | ${f(s.x)} | ${f(s.z)} | ${s.footprint.map(f).join(' x ')} | ${s.mode} |`),
    '',
  ];
  return lines.join('\n');
}
