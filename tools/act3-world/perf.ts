// heightAt cost over the Dragonspine and over Brightwater: npx vite-node tools/act3-world/perf.ts
import { heightAt } from '../../src/terrain/heightfield';
const bench = (label: string, x0: number, z0: number) => {
  let s = 0;
  const t = performance.now();
  for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) s += heightAt(x0 + i * 15, z0 + j * 15);
  const ms = performance.now() - t;
  console.log(`${label}: ${((ms * 1000) / 160000).toFixed(2)} us per call (${s.toFixed(0)})`);
};
bench('dragonspine', 11000, 11000);
bench('brightwater', 0, 0);
bench('cinderreach', 16000, 0);
