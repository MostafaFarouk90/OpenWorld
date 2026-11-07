// The Act 5 core (contracts v0.9 items 1, 7 and 10): the Caldera's kill XP factor, the boss arena service and the
// world tint service. Small on purpose; the Act 5 systems are their threads' own plugins.
import type { GamePlugin } from '../core/plugins';
import { BossArenas } from '../bosses/arena';
import { CALDERA_KILL_XP_FACTOR } from '../region/act5Regions';
import { WorldTint } from './worldTint';
import './events';

let offs: Array<() => void> = [];

const plugin: GamePlugin = {
  id: 'act5-core',
  dependsOn: ['core'],
  setup(ctx) {
    const factor = ctx.services.get('killXpRegionFactor');
    if (factor) offs.push(factor.set('caldera', CALDERA_KILL_XP_FACTOR));
    else console.warn('[act5-core] the killXpRegionFactor service is missing; Caldera kills pay x 1');

    const arenas = new BossArenas({
      warn: (m) => console.warn(`[act5-core] ${m}`),
      emit: (e) => {
        if (e.kind === 'piece') ctx.events.emit('arena.piece', { arenaId: e.arenaId, pieceId: e.pieceId, state: e.state });
        else ctx.events.emit('arena.reset', { arenaId: e.arenaId });
      },
      anchor: (id) => {
        const a = ctx.anchors.find(id);
        return a ? { position: { ...a.position }, yaw: a.yaw } : undefined;
      },
      safeTeleport: (feet, yaw) => {
        const ws = ctx.services.get('waystones');
        return ws ? ws.safeTeleport(feet, yaw) : Promise.resolve({ ok: false });
      },
    });
    offs.push(ctx.services.provide('bossArena', arenas));
    offs.push(ctx.events.on('boss.ended', (e) => arenas.onBossEnded(e.bossId)));
    offs.push(ctx.events.on('save.loaded', () => arenas.onLoaded()));
    offs.push(ctx.services.provide('worldTint', new WorldTint()));
    // v0.9 item 13: the Anvil of Ages' shrine anchor is N1's (caldera/caldera.layout.ts, the caldera-world plugin).
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) off();
    offs = [];
  },
};

export default plugin;
