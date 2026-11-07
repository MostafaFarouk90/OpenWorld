// `?act5=<quest>&new[&favour=marshal|keepers]`: dev and smoke jumps into Act 5 on flag injection (ids and rules in
// act5Jump.ts). Acts 1 to 4 are replayed through the `?act4=` ports with every ending silenced. Optional `&class=<id>`
// picks the M07 class. Compiled out of production builds (import.meta.env.DEV). N12 PR 1's fixtures build on this plumbing.
import type { GamePlugin } from '../core/plugins';
import { act4JumpPorts } from './act4Jump.plugin';
import { POST_RULES, resolvePosts } from './posts';
import { ACT5_POST_PREFIXES, Act5Jump, parseAct5, type Act5JumpPorts } from './act5Jump';

let quietOff: (() => void) | null = null;

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
    const base = act4JumpPorts(ctx);
    const ports: Act5JumpPorts = {
      ...base,
      warn: (m) => console.warn(`[act5] ${m}`),
      // Only an Act 5 post counts (the quest threads add them); until then the jump lands at the placeholder.
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
    quietOff = () => ports.quiet?.(false);
    const jump = new Act5Jump(parsed.id, ports, parsed.classId, parsed.favour);
    (globalThis as { __act5?: Act5Jump }).__act5 = jump;
    ctx.systems.add({
      id: 'act5-jump',
      fixedPhase: 'rules',
      order: 901,
      fixedUpdate: () => jump.tick(),
    });
  },
  dispose() {
    quietOff?.();
    quietOff = null;
    delete (globalThis as { __act5?: unknown }).__act5;
  },
};

export default plugin;
