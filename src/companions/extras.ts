// A5 PR 2 wiring kept out of the plugin's body: the Hearth Rite service and its ready flag for Aelfreda's talk tree,
// and the cosmetic followers (Ember pup, Kindling Brush) with their readers (plans/act2-A5.md section 2).
import type { GameContext } from '../core/Game';
import { RITE_READY_FLAG } from './dialogue/npcAelfredaCompanion.dialogue';
import { CosmeticFollower, brushTuning, buildBrush, buildPup, pupTuning, type FollowerPorts } from './followers';
import { createRite, type RiteService } from './rite';
import type { InteriorsLike } from './types';
import './events';

/** A12's R07 writes it; `spared` brings the pup. */
export const R07_CHOICE_FLAG = 'story.r07.choice';
/** A9's Kindling Dell grants it. */
export const KINDLING_BRUSH_ITEM = 'kindling-brush';

export interface Extras {
  rite: RiteService;
  followers: { pup: CosmeticFollower; brush: CosmeticFollower };
  fixedUpdate(dt: number): void;
  dispose(): void;
}

export function createExtras(
  ctx: GameContext,
  o: { aelfredaJoined(): boolean; groundAt(x: number, z: number, yHint: number): number | null },
): Extras {
  const offs: (() => void)[] = [];
  const svc = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): T | undefined }).get(name);
  const ev = ctx.events;

  // ---- the Hearth Rite
  const rite = createRite({
    events: ev,
    getFlag: (k) => ctx.state.getFlag(k),
    setFlag: (k, v) => ctx.state.setFlag(k, v),
    joined: () => o.aelfredaJoined(),
    spells: () => svc('spells'),
  });
  offs.push(ctx.services.provide('rite', rite));
  // The talk tree reads a flag; it is derived here whenever an input changes (never written by anyone else).
  const syncRite = (): void => {
    const ready = rite.available();
    if (ctx.state.getFlag(RITE_READY_FLAG) !== ready) ctx.state.setFlag(RITE_READY_FLAG, ready);
  };
  offs.push(
    ev.on('npc.aelfreda.hearthRite', () => {
      if (!rite.perform()) {
        console.warn(`companions: the Hearth Rite was refused (${rite.refusal()})`);
        return;
      }
      ev.emit('hud.toast', { textKey: 'companion.aelfreda.rite.done' });
    }),
    ev.on('scar.added', syncRite),
    ev.on('scar.removed', syncRite),
    ev.on('save.loaded', syncRite),
    ev.on('companion.joined', syncRite),
    ev.on('companion.left', syncRite),
    ev.on('flag.changed', ({ key }) => {
      if (key.startsWith('story.gate.') || key.startsWith('aelfreda.rite.a')) syncRite();
    }),
  );

  // ---- cosmetic followers
  let stealth = false;
  let mounted = false;
  const ports: FollowerPorts = {
    scene: ctx.scene,
    feet: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z }),
    yaw: () => ctx.player.facingYaw,
    groundAt: o.groundAt,
    indoors: () => !!svc<InteriorsLike>('interiors')?.current,
    stealth: () => stealth,
    mounted: () => mounted,
  };
  const pup = new CosmeticFollower('ember-pup', buildPup, ports, pupTuning());
  const brush = new CosmeticFollower('kindling-brush', buildBrush, ports, brushTuning(), 0.95);
  const inventory = () => svc<{ count(id: string): number }>('inventory');
  const syncFollowers = (): void => {
    pup.setWanted(ctx.state.getFlag(R07_CHOICE_FLAG) === 'spared');
    brush.setWanted((inventory()?.count(KINDLING_BRUSH_ITEM) ?? 0) > 0);
  };
  offs.push(
    ev.on('flag.changed', ({ key }) => {
      if (key === R07_CHOICE_FLAG) syncFollowers();
    }),
    ev.on('inventory.changed', ({ itemId }) => {
      if (itemId === KINDLING_BRUSH_ITEM) syncFollowers();
    }),
    ev.on('save.loaded', () => {
      stealth = false;
      mounted = false;
      syncFollowers();
      pup.requestPlace();
      brush.requestPlace();
    }),
    ev.on('fastTravel', () => {
      pup.requestPlace();
      brush.requestPlace();
    }),
    ev.on('stealth.section', ({ phase }) => {
      stealth = phase === 'entered';
    }),
    ev.on('player.respawned', () => (stealth = false)),
    ev.on('mount.mounted', () => (mounted = true)),
    ev.on('mount.dismounted', () => (mounted = false)),
  );

  let first = true;
  return {
    rite,
    followers: { pup, brush },
    fixedUpdate(dt) {
      if (first) {
        // Spells and inventory may set up after this plugin: read them once the game runs.
        first = false;
        syncRite();
        syncFollowers();
      }
      pup.fixedUpdate(dt);
      brush.fixedUpdate(dt);
    },
    dispose() {
      for (const off of offs.splice(0)) off();
      pup.dispose();
      brush.dispose();
    },
  };
}
