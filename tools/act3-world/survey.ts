// Prints a height grid: npx vite-node tools/act3-world/survey.ts -- x0 x1 z0 z1 step
import { heightAt } from '../../src/terrain/heightfield';
const [x0, x1, z0, z1, step] = process.argv.slice(2).filter((a) => a !== '--').map(Number);
let head = '      z\\x';
for (let x = x0; x <= x1; x += step) head += String(x / 100).padStart(5);
console.log(head);
for (let z = z1; z >= z0; z -= step) {
  let row = String(z).padStart(9);
  for (let x = x0; x <= x1; x += step) row += String(Math.round(heightAt(x, z))).padStart(5);
  console.log(row);
}
