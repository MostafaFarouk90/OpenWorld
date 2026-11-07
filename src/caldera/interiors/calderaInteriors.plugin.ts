// Plugin `caldera-interiors` (Act 5 N2): the base states the Caldera interiors owe their users. (1) The Hammer Hall's floor is a flat
// floor again when the player leaves, on a load and when Ulthred's fight ends (N3's BreakingFloor piece opens it during the fight).
// (2) The stokers' tunnel's far seal follows `story.r27.farOpen`, but never closes on a player standing in the far gallery.
// (3) Vey's arena exit opens when his fight ends without an outcome too (a player who flees is not locked in).
import type { GamePlugin } from '../../core/plugins';
import '../../interiors/service';
import { FOUNDRY_ENTRY_Z, FOUNDRY_EXIT_GATE_Z } from './foundryDescent';
import { HAMMER_ENTRY_Z } from './hammerHall';
import { BLOCKERS, CALDERA_INTERIOR_FLAGS, FOUNDRY_DESCENT_ID, HAMMER_HALL_ID, HAMMER_PIT, INT_ANCHOR, STOKERS_TUNNEL_ID } from './sites';
import { TUNNEL_ENTRY_Z, TUNNEL_GALLERY_Z0 } from './stokersTunnel';
import '../../nav/service';

let offs: Array<() => void> = [];

const plugin: GamePlugin = {
  id: 'caldera-interiors',
  dependsOn: ['core', 'interiors'],
  setup(ctx) {
    const interiors = ctx.services.get('interiors');
    if (!interiors) throw new Error('caldera-interiors: the interiors service is missing');
    const set = (id: string, closed: boolean) => interiors.setBlocker(id, closed);

    // (1) the Hammer Hall floor: a flat floor again on leaving, on a load and when Ulthred's fight ends, but never closed over a player
    // standing in the pit (a failed drop teleport): the close waits until they walk out by the steps.
    let floorWantClosed = true;
    let floorClosed: boolean | undefined;
    const localOf = (anchorId: string, localZ: number, localX: number) => {
      const a = ctx.anchors.find(anchorId);
      if (!a) return undefined;
      const f = ctx.player.feet;
      return { x: f.x - (a.position.x - localX), z: f.z - (a.position.z - localZ), y: f.y - a.position.y };
    };
    const inPit = (): boolean => {
      if (interiors.current !== HAMMER_HALL_ID) return false;
      const l = localOf(`${INT_ANCHOR}.hammer.entry`, HAMMER_ENTRY_Z, 0);
      return !!l && l.y < -0.25 && l.x >= HAMMER_PIT.x0 - 0.5 && l.x <= HAMMER_PIT.x1 + 0.5 && l.z >= HAMMER_PIT.z0 - 0.5 && l.z <= HAMMER_PIT.z1 + 0.5;
    };
    const applyFloor = () => {
      const closed = floorWantClosed && !inPit();
      if (floorClosed === closed) return;
      floorClosed = closed;
      set(BLOCKERS.hammerFloor, closed);
    };
    const closeFloor = () => {
      floorWantClosed = true;
      floorClosed = undefined;
      applyFloor();
    };
    offs.push(ctx.events.on('interior.exited', (e) => e.interiorId === HAMMER_HALL_ID && closeFloor()));
    offs.push(ctx.events.on('save.loaded', closeFloor));
    offs.push(ctx.events.on('boss.ended', (e) => e.bossId === 'ulthred' && closeFloor()));

    // (2) the tunnel seal. Occupancy is read from the player's feet against the gallery's local rect (triggers only update on a
    // rendered frame), re-checked every fixed tick while a close is waiting.
    let farOpen = false;
    let sealed: boolean | undefined;
    const inGallery = (): boolean => {
      if (interiors.current !== STOKERS_TUNNEL_ID) return false;
      const entry = ctx.anchors.find(`${INT_ANCHOR}.tunnel.entry`);
      if (!entry) return false;
      const lz = ctx.player.feet.z - (entry.position.z - TUNNEL_ENTRY_Z);
      // 2 m short of the seal's 1 m slab, so the capsule never overlaps it when it closes.
      return lz >= TUNNEL_GALLERY_Z0 - 2.5;
    };
    const apply = () => {
      const wantClosed = !farOpen && !inGallery();
      if (sealed === wantClosed) return;
      sealed = wantClosed;
      set(BLOCKERS.tunnelSeal, wantClosed);
    };
    offs.push(ctx.gates.flag(CALDERA_INTERIOR_FLAGS.tunnelFarOpen, (open) => {
      farOpen = open;
      apply();
    }));
    offs.push(ctx.events.on('interior.exited', (e) => e.interiorId === STOKERS_TUNNEL_ID && apply()));
    offs.push(ctx.events.on('save.loaded', () => {
      sealed = undefined;
      apply();
    }));
    offs.push(ctx.systems.add({ id: 'caldera-interiors.seal', fixedPhase: 'rules', order: 410, fixedUpdate: () => {
        apply();
        // The pit guard only matters while a close is waiting; the tick re-evaluates it.
        if (floorWantClosed && floorClosed === false && !inPit()) applyFloor();
        // Vey's exit: anyone standing in the foot (past the exit gate) must be able to leave, whatever opened it.
        if (interiors.current === FOUNDRY_DESCENT_ID) {
          const l = localOf(`${INT_ANCHOR}.foundry.entry`, FOUNDRY_ENTRY_Z, 0);
          if (l && l.z >= FOUNDRY_EXIT_GATE_Z - 0.5) set(BLOCKERS.foundryArenaExit, false);
        }
      } }));

    // (3) Vey's exit: any end of the fight opens it, so a player who flees (despawn with no outcome) is not locked in the foot.
    offs.push(ctx.events.on('boss.ended', (e) => e.bossId === 'vey' && set(BLOCKERS.foundryArenaExit, false)));
  },
  dispose() {
    for (const o of offs.reverse()) o();
    offs = [];
  },
};

export default plugin;
