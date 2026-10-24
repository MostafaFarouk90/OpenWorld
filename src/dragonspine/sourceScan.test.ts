// No height is written down in this folder: every y comes from `heightAt` when the layout, the routes and the interiors are built.
// The scan reads each non-test source file and fails on a numeric literal assigned to an absolute-height name.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true });
const files = Object.keys(sources).map((k) => k.replace('./', ''));
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
/** `y: 12`, `{ y: -3 }`, `floorY = 40`, `groundY: 0`, `surfaceY`, `elevation: 5`, `altitude`: an absolute height as a literal. */
const HEIGHT_LITERAL = /\b(y|floorY|groundY|surfaceY|baseY|elevation|altitude)\s*[:=]\s*-?\d/;
/** A world height added to the ground as a bare number (`heightAt(x, z) + 120`, `h(x, z) - 40`): multi-digit offsets are suspicious. */
const GROUND_PLUS_BIG = /\b(heightAt|h)\([^)]*\)\s*[+-]\s*\d{2,}/;

describe('src/dragonspine has no height literal', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain('carryRoutes.ts');
  });

  it.each(files)('%s', (f) => {
    const src = strip(sources[`./${f}`]!);
    const hit = src.split('\n').find((line) => HEIGHT_LITERAL.test(line) || GROUND_PLUS_BIG.test(line));
    expect(hit, `${f}: ${hit}`).toBeUndefined();
  });

  it('flags what it is meant to flag', () => {
    expect(HEIGHT_LITERAL.test('const p = { x: 1, y: 12, z: 3 };')).toBe(true);
    expect(HEIGHT_LITERAL.test('const floorY = 40;')).toBe(true);
    expect(GROUND_PLUS_BIG.test('const t = heightAt(x, z) + 120;')).toBe(true);
    expect(HEIGHT_LITERAL.test('const p = { x: 1, y: h(1, 2), z: 3 };')).toBe(false);
  });
});
