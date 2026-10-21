// `?waves=<defId>`: dev only. Starts a wave set once the world is up, defining stand-in anchors around the player for any
// the layout lacks (A3's Cinderford may not be built yet). Compiled out of production builds (import.meta.env.DEV).
import type { GamePlugin } from '../core/plugins';
import { WAVE_SETS } from './defs';

const plugin: GamePlugin = {
  id: 'waves-dev',
  dependsOn: ['core', 'waves'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const defId = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('waves') : null;
    if (!defId) return;
    const def = WAVE_SETS[defId];
    if (!def) {
      console.warn(`[waves-dev] unknown wave set '${defId}' (known: ${Object.keys(WAVE_SETS).join(', ')})`);
      return;
    }
    let started = false;
    ctx.systems.add({
      id: 'waves-dev',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => {
        if (started) return;
        const save = ctx.services.get('save');
        if (save?.loading) return;
        started = true;
        // Stand-ins: the barricade line 12 m ahead of the player, lanes 40 m beyond it, militia along the line.
        const f = ctx.player.feet;
        const put = (id: string, x: number, z: number) => {
          if (!ctx.anchors.find(id)) ctx.anchors.define({ id, position: { x: f.x + x, y: f.y, z: f.z + z }, yaw: 0 });
        };
        def.barricadeAnchors.forEach((id, i) => put(id, -9 + i * 6, -12));
        Object.entries(def.lanes).forEach(([key, id], i) => put(id, -20 + i * 14, -55 - (key === 'wyrm' ? 20 : 0)));
        def.defenders.forEach((p, i) => put(p.anchor, -12 + i * 5, -10));
        const waves = ctx.services.get('waves');
        console.info(`[waves-dev] start('${defId}') -> ${String(waves?.start(defId))}`);
      },
    });
  },
};

export default plugin;
