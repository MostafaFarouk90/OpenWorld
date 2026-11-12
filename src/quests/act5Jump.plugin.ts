// `?act5=<quest>&new[&favour=marshal|keepers]`: dev and smoke jumps into Act 5 on flag injection (ids and rules in
// act5Jump.ts). Acts 1 to 4 are replayed through the `?act4=` ports with every ending silenced. Optional `&class=<id>`
// picks the M07 class. Compiled out of production builds (import.meta.env.DEV). N12 PR 1: a fresh committed
// `act5-<id>.json` fixture (Knight) is loaded instead and the preset applied on it; `&fixture=0` forces the injection.
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import { act4JumpPorts } from './act4Jump.plugin';
import { POST_RULES, resolvePosts } from './posts';
import { Act3FixtureStart } from '../integration/act3FixtureStart';
import { knownQuestDefs } from '../integration/act3FixtureKey';
import { act5FixtureDefIds, act5FixtureFresh, act5FixtureName } from '../integration/act5FixtureKey';
import { ACT5_POST_PREFIXES, Act5Jump, parseAct5, type Act5JumpPorts } from './act5Jump';

let quietOff: (() => void) | null = null;

/**
 * The jump's ports on a live game (N12 PR 1 exported them for the fixture generator): the `?act4=` ports plus an Act 5
 * giver pose (only an `caldera.` post counts; until a quest thread places its giver the jump lands at the placeholder),
 * favour set to a value, and a flag set to a value.
 */
export function act5JumpPorts(ctx: GameContext): Act5JumpPorts {
  const base = act4JumpPorts(ctx);
  return {
    ...base,
    warn: (m) => console.warn(`[act5] ${m}`),
    giverPose: (npcId) => {
      const posts = resolvePosts(POST_RULES, { state: ctx.state, quests: ctx.services.require('quests') as never });
      const anchorId = posts[npcId]?.anchorId;
      if (!anchorId || !ACT5_POST_PREFIXES.some((p) => anchorId.startsWith(p))) return undefined;
      const a = ctx.anchors.find(anchorId);
      return a ? { x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw } : undefined;
    },
    setFavourTo: (track, value) => {
      ctx.state.addFavour(track, value - ctx.state.favour(track), 'script');
    },
    setFlagValue: (flag, value) => ctx.state.setFlag(flag, value),
  };
}

const plugin: GamePlugin = {
  id: 'act5-jump',
  dependsOn: ['core', 'quests', 'save', 'waystones'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const search = typeof location !== 'undefined' ? location.search : '';
    const parsed = parseAct5(search);
    if (!parsed) return;
    if ('error' in parsed) {
      console.warn(`[act5] jump refused: ${parsed.error}`);
      return;
    }
    // Held for the session (never released): a jumped game never saves over the real slot.
    ctx.services.get('save')?.suspend('act5-jump');
    const ports = act5JumpPorts(ctx);
    quietOff = () => ports.quiet?.(false);
    const jump = new Act5Jump(parsed.id, ports, parsed.classId, parsed.favour);
    (globalThis as { __act5?: Act5Jump }).__act5 = jump;
    // N12 PR 1: the committed fixture (made from the carried Phase H chain save) when it is fresh, Knight only as
    // generated; the favour preset is applied on the loaded save. Else the injection above. `&fixture=0` forces injection.
    const save = ctx.services.get('save');
    const wantFixture = new URLSearchParams(search).get('fixture') !== '0' && parsed.classId === 'knight';
    const start = new Act3FixtureStart(act5FixtureName(parsed.id), wantFixture, {
      find: () => import('../integration/act5FixtureLoader').then((m) => m.findAct5Fixture(parsed.id)),
      ready: ports.ready,
      known: () => knownQuestDefs(ports.hasQuest, act5FixtureDefIds(parsed.id)),
      loadFile: save?.loadFile ? (file) => save.loadFile!(file) : undefined,
      warn: (m) => console.warn(`[act5] ${m}`),
      fresh: act5FixtureFresh,
    });
    (globalThis as { __act5Start?: Act3FixtureStart }).__act5Start = start;
    let onFixture = false;
    ctx.systems.add({
      id: 'act5-jump',
      fixedPhase: 'rules',
      order: 901,
      fixedUpdate: () => {
        if (start.tick()) jump.tick();
        else if (start.state === 'loaded') {
          if (!onFixture) {
            onFixture = true;
            jump.onLoadedFixture();
          }
          jump.tick();
        }
      },
    });
  },
  dispose() {
    quietOff?.();
    quietOff = null;
    delete (globalThis as { __act5?: unknown }).__act5;
    delete (globalThis as { __act5Start?: unknown }).__act5Start;
  },
};

export default plugin;
