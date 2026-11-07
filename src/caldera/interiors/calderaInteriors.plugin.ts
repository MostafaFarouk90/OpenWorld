// Plugin `caldera-interiors` (Act 5 N2): the base states the Caldera interiors owe their users. (1) The Hammer Hall's floor is a flat
// floor again when the player leaves, on a load and when Ulthred's fight ends (N3's BreakingFloor piece opens it during the fight).
// (2) The stokers' tunnel's far seal follows `story.r27.farOpen`, but never closes on a player standing in the far gallery.
// (3) Vey's arena exit opens when his fight ends without an outcome too (a player who flees is not locked in).
import type { GamePlugin } from '../../core/plugins';
import '../../interiors/service';
import { BLOCKERS, CALDERA_INTERIOR_FLAGS, HAMMER_HALL_ID, INT_ANCHOR, STOKERS_TUNNEL_ID } from './sites';
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

    // (1) the Hammer Hall floor
    const closeFloor = () => void set(BLOCKERS.hammerFloor, true);
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
      return lz >= TUNNEL_GALLERY_Z0 - 0.5;
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
    offs.push(ctx.systems.add({ id: 'caldera-interiors.seal', fixedPhase: 'rules', order: 410, fixedUpdate: apply }));

    // (3) Vey's exit: any end of the fight opens it, so a player who flees (despawn with no outcome) is not locked in the foot.
    offs.push(ctx.events.on('boss.ended', (e) => e.bossId === 'vey' && set(BLOCKERS.foundryArenaExit, false)));
  },
  dispose() {
    for (const o of offs.reverse()) o();
    offs = [];
  },
};

export default plugin;
