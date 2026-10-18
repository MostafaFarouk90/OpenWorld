// Tests read repo files, but the project has no @types/node; load node:fs through a variable the same way
// src/combat/measureHurtboxes.measure.test.ts does.
const moduleName = 'node:fs';
export const { readFileSync } = (await import(/* @vite-ignore */ moduleName)) as {
  readFileSync(path: string, enc?: string): any;
};
