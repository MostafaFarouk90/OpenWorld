// Act 5 N1 PR 3: the Caldera's code-placed set. The Lava Stair's six channels for M48 (lavaStair.ts, on N3's `lava` service; N10's
// wheels and levers drive them) and the Anvil of Ages on the island (a landmark with a collider, north-east of the centre, clear of N6's
// fight pieces, which anvilArenaArt.ts dresses inside N6's own arena build).
import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { envModelLibraryFor } from '../../env/envStructureArt';
import { heightAt } from '../../terrain/heightfield';
import { ANVIL_ISLAND, headingTo, polarFrom, type XZ } from '../calderaSites';
import { M48_LEVER_PULLED } from '../../quests/content/act5/rim/m48.quest';
import { CHANNEL_SURFACE_LIFT, GANTRY_DECK_LIFT, GANTRY_SURFACE_DROP, M48_COMPLETE, stairChannels, type StairChannel } from './lavaStair';
import { loadPiece } from './pieces';
import { CALDERA_ENV_IDS } from './calderaEnvIds';

/** The Anvil of Ages: 40 m from the island's centre on bearing 22.5 (between two of N3's lips), turned to face the centre. */
export const ANVIL_OF_AGES_AT: XZ = polarFrom(ANVIL_ISLAND.centre, 22.5, 40);
export const ANVIL_OF_AGES_YAW = headingTo(ANVIL_OF_AGES_AT, ANVIL_ISLAND.centre);
/** A raised gantry stands this far up from the deck's line (radians), hinged at its near end. */
export const GANTRY_RAISED = (-70 * Math.PI) / 180;
const GANTRY_LEN = CALDERA_ENV_IDS.find((e) => e.id === 'lava-gantry-a')!.d;

const DEG = Math.PI / 180;

interface Gantry {
  channel: StairChannel;
  lever: number;
  hinge: THREE.Group;
  lowered: number;
  down: boolean;
}

export function createCalderaSetPlugin(opts: { heightAt?: (x: number, z: number) => number } = {}): GamePlugin {
  const h = opts.heightAt ?? heightAt;
  const offs: (() => void)[] = [];
  return {
    id: 'caldera-set',
    dependsOn: ['core', 'caldera-lava', 'caldera-world'],
    setup(ctx: GameContext) {
      const warn = (m: string) => console.warn(`caldera-set: ${m}`);
      const lib = envModelLibraryFor(ctx.assets);
      const root = new THREE.Group();
      root.name = 'caldera-set';
      ctx.scene.add(root);
      offs.push(() => root.removeFromParent());

      // ---- the Anvil of Ages
      const [ax, az] = ANVIL_OF_AGES_AT;
      const anvil = new THREE.Group();
      anvil.name = 'caldera-anvil-of-ages';
      anvil.position.set(ax, h(ax, az), az);
      anvil.rotation.y = ANVIL_OF_AGES_YAW * DEG;
      root.add(anvil);
      void loadPiece(lib, 'anvil-of-ages-a').then((o) => o && anvil.add(o));
      if (ctx.physics?.addStaticCollider) {
        try {
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), anvil.rotation.y);
          const col = ctx.physics.addStaticCollider(
            ctx.physics.rapier.ColliderDesc.cuboid(1.5, 1.3, 3).setTranslation(ax, anvil.position.y + 1.3, az).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
          );
          offs.push(() => ctx.physics.removeCollider(col));
        } catch (err) {
          warn(`anvil collider failed (${String(err)})`);
        }
      }

      // ---- the Lava Stair
      const lava = ctx.services.get('lava');
      const channels = stairChannels(h);
      const gantries: Gantry[] = [];
      for (const c of channels) {
        if (!c.lever) continue;
        // Hinged at the near end, the deck's line from 0.08 over the ground before the near lip to the same past the far lip.
        const a: XZ = [c.centre[0] - c.dir[0] * (GANTRY_LEN / 2), c.centre[1] - c.dir[1] * (GANTRY_LEN / 2)];
        const b: XZ = [c.centre[0] + c.dir[0] * (GANTRY_LEN / 2), c.centre[1] + c.dir[1] * (GANTRY_LEN / 2)];
        const ya = h(a[0], a[1]) + GANTRY_DECK_LIFT;
        const yb = h(b[0], b[1]) + GANTRY_DECK_LIFT;
        const hinge = new THREE.Group();
        hinge.name = `caldera-gantry-${c.lever}`;
        hinge.rotation.order = 'YXZ';
        hinge.position.set(a[0], ya, a[1]);
        hinge.rotation.y = Math.atan2(c.dir[0], c.dir[1]);
        const lowered = Math.atan2(ya - yb, GANTRY_LEN);
        const deck = new THREE.Group();
        deck.position.z = GANTRY_LEN / 2;
        hinge.add(deck);
        root.add(hinge);
        void loadPiece(lib, 'lava-gantry-a').then((o) => o && deck.add(o));
        gantries.push({ channel: c, lever: c.lever, hinge, lowered, down: false });
      }

      let live = false;
      let undo: (() => void)[] = [];
      const setGantry = (g: Gantry, down: boolean): void => {
        g.down = down;
        g.hinge.rotation.x = down ? g.lowered : GANTRY_RAISED;
        if (live && lava) lava.setSurface(g.channel.volume.id, g.channel.volume.surfaceY + (down ? GANTRY_SURFACE_DROP - CHANNEL_SURFACE_LIFT : 0));
      };
      const sync = (): void => {
        const want = !!lava && !ctx.state.getBool(M48_COMPLETE);
        if (want && !live) {
          for (const c of channels) {
            try {
              undo.push(lava!.add(c.volume));
              if (c.vent) undo.push(lava!.addVent(c.vent));
              undo.push(lava!.addCrossing(c.crossing));
            } catch (err) {
              warn(`channel ${c.n} could not be added (${String(err)})`);
            }
          }
          live = true;
        } else if (!want && live) {
          for (const u of undo.splice(0).reverse()) {
            try {
              u();
            } catch (err) {
              warn(`channel undo failed (${String(err)})`);
            }
          }
          live = false;
        }
        for (const g of gantries) setGantry(g, ctx.state.getBool(M48_LEVER_PULLED(g.lever)) || ctx.state.getBool(M48_COMPLETE));
      };
      sync();
      offs.push(() => {
        live = true;
        for (const u of undo.splice(0).reverse()) u();
      });
      const watched = new Set([M48_COMPLETE, ...gantries.map((g) => M48_LEVER_PULLED(g.lever))]);
      offs.push(ctx.events.on('flag.changed', (e) => watched.has(e.key) && sync()));
      offs.push(ctx.events.on('save.loaded', () => sync()));
    },
    dispose() {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          console.warn('caldera-set: dispose step failed', err);
        }
      }
    },
  };
}

export default createCalderaSetPlugin();
