// `?act4=<quest>&new`: dev and smoke jumps into Act 4 on flag injection (ids and rules in act4Jump.ts). Acts 1 to 3 are
// replayed through the `?act3=` ports with every ending silenced. Optional `&class=<id>` picks the M07 class.
// Compiled out of production builds (import.meta.env.DEV). L13 PR 1's deterministic fixtures build on this plumbing.
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import { heightAt } from '../terrain/heightfield';
import { act3JumpPorts } from './act3Jump.plugin';
import { Act4Jump, parseAct4, type Act4JumpPorts } from './act4Jump';
import { ACT4_ANCHOR_PREFIXES } from './lint/act4Flags';
import { POST_RULES, resolvePosts } from './posts';
import { Act3FixtureStart } from '../integration/act3FixtureStart';
import { knownQuestDefs } from '../integration/act3FixtureKey';
import { act4FixtureDefIds, act4FixtureFresh, act4FixtureName } from '../integration/act4FixtureKey';

const TELEPORT_TRIES = 30;

/**
 * Warnings the Acts 1 to 3 replay is expected to raise (B9): the runners' own refusals and the save manager dropping a
 * request while the jump's load hold is up. Counted while `quiet` is on and printed once; every other warning still prints.
 */
export const EXPECTED_REPLAY_WARNING = /^\[act[123]\] |request dropped, a load is in progress/;

/** Wraps `console.warn` while on; returns the count when turned off. */
export function replayQuieter(target: { warn: (...a: unknown[]) => void } = console): { set(on: boolean): number; readonly active: boolean } {
  let original: ((...a: unknown[]) => void) | null = null;
  let count = 0;
  return {
    get active() {
      return original !== null;
    },
    set(on) {
      if (on && !original) {
        original = target.warn;
        count = 0;
        const real = original;
        target.warn = (...a: unknown[]) => {
          if (typeof a[0] === 'string' && EXPECTED_REPLAY_WARNING.test(a[0])) count++;
          else real.apply(target, a);
        };
      } else if (!on && original) {
        target.warn = original;
        original = null;
      }
      return count;
    },
  };
}

export function act4JumpPorts(ctx: GameContext): Act4JumpPorts {
  const base = act3JumpPorts(ctx);
  let teleport: 'idle' | 'pending' | 'ok' = 'idle';
  let tries = 0;
  const quieter = replayQuieter();
  return {
    ...base,
    warn: (m) => console.warn(`[act4] ${m}`),
    // Only an Act 4 post counts (L2, L1 and L4 add them): before those exist the giver stands at an Act 1 to 3 post, maybe
    // inside the walls, so the jump lands at the phase placeholder instead.
    giverPose: (npcId) => {
      const posts = resolvePosts(POST_RULES, { state: ctx.state, quests: ctx.services.require('quests') as never });
      const anchorId = posts[npcId]?.anchorId;
      if (!anchorId || !ACT4_ANCHOR_PREFIXES.some((p) => anchorId.startsWith(p))) return undefined;
      const a = ctx.anchors.find(anchorId);
      return a ? { x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw } : undefined;
    },
    placePose: (pos, yaw) => {
      if (teleport === 'ok') return true;
      if (teleport === 'pending') return false;
      const at = { x: pos.x, y: pos.y ?? heightAt(pos.x, pos.z) + 0.05, z: pos.z };
      const ws = ctx.services.get('waystones');
      if (!ws || ++tries > TELEPORT_TRIES) {
        const c = ctx.services.get('containment')?.clamp(at) ?? at;
        ctx.player.teleport(c === at ? at : { ...c, y: heightAt(c.x, c.z) + 0.05 }, yaw);
        if (ctx.cameraRig) ctx.cameraRig.yaw = yaw;
        return true;
      }
      teleport = 'pending';
      void ws.safeTeleport(at, yaw).then(
        (o) => { teleport = o.ok ? 'ok' : 'idle'; },
        () => { teleport = 'idle'; },
      );
      return false;
    },
    quiet: (on) => {
      const wasOn = quieter.active;
      const n = quieter.set(on);
      if (!on && wasOn) console.info(`[act4] replay: ${n} expected refusals`);
    },
  };
}

let quietOff: (() => void) | null = null;

const plugin: GamePlugin = {
  id: 'act4-jump',
  dependsOn: ['core', 'quests', 'save', 'waystones'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const search = typeof location !== 'undefined' ? location.search : '';
    const parsed = parseAct4(search);
    if (!parsed) return;
    if ('error' in parsed) {
      console.warn(`[act4] jump refused: ${parsed.error}`);
      return;
    }
    // Held for the session (never released), as `?act3=`: a jumped game never saves over the real slot.
    ctx.services.get('save')?.suspend('act4-jump');
    const ports = act4JumpPorts(ctx);
    quietOff = () => ports.quiet?.(false);
    const jump = new Act4Jump(parsed.id, ports, parsed.classId);
    (globalThis as { __act4?: Act4Jump }).__act4 = jump;
    // L13: the committed fixture (made from the carried Act 3 chain save) when it is fresh, Knight only as generated; else
    // the injection above. `&fixture=0` forces the injection.
    const save = ctx.services.get('save');
    const wantFixture = new URLSearchParams(search).get('fixture') !== '0' && parsed.classId === 'knight';
    const start = new Act3FixtureStart(act4FixtureName(parsed.id), wantFixture, {
      find: () => import('../integration/act4FixtureLoader').then((m) => m.findAct4Fixture(parsed.id)),
      ready: ports.ready,
      known: () => knownQuestDefs(ports.hasQuest, act4FixtureDefIds(parsed.id)),
      loadFile: save?.loadFile ? (file) => save.loadFile!(file) : undefined,
      warn: (m) => console.warn(`[act4] ${m}`),
      fresh: act4FixtureFresh,
    });
    (globalThis as { __act4Start?: Act3FixtureStart }).__act4Start = start;
    ctx.systems.add({
      id: 'act4-jump',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => {
        if (start.tick()) jump.tick();
      },
    });
  },
  dispose() {
    quietOff?.(); // never leave console.warn wrapped
    quietOff = null;
    delete (globalThis as { __act4?: unknown }).__act4;
    delete (globalThis as { __act4Start?: unknown }).__act4Start;
  },
};

export default plugin;
