/**
 * A clock for cost guards in tests: milliseconds of CPU this process has used (user + system), read from Node's
 * `process.cpuUsage()`. Unlike `performance.now()` it does not run while the worker waits for a core, so a guard that
 * passes on an idle machine also passes when the whole suite (or another job on a shared CI runner) is competing for the
 * CPU: the wall-clock guards in buildCost, largeRig and TerrainColliders failed there and cost December CI reruns.
 * Each vitest file runs in its own forked process, so the reading is this file's work alone (plus its own GC threads).
 * Falls back to `performance.now()` where `process` is missing (a browser), so callers never branch.
 */
type CpuUsage = { user: number; system: number };
const proc = (globalThis as { process?: { cpuUsage?: () => CpuUsage } }).process;

export const hasCpuClock = typeof proc?.cpuUsage === 'function';

export function cpuNowMs(): number {
  if (!hasCpuClock) return performance.now();
  const u = proc!.cpuUsage!();
  return (u.user + u.system) / 1000;
}

/** CPU milliseconds `fn` takes (wall milliseconds without a CPU clock). */
export function cpuMs(fn: () => void): number {
  const t0 = cpuNowMs();
  fn();
  return cpuNowMs() - t0;
}
