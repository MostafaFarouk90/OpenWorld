// K7 PR 1: water (wading, the deep edge, diving), the Greyfen ferry, the sled and the carry reset (contracts v0.7
// items 4, 6, 7 and 25); PR 2: the Dragonspine Glide (item 5). Wires the pure pieces to the game. The shared controller is reached only through K0's hooks:
// `controller.setMoveMode` and `Player.setVerticalIntent`.
import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GamePlugin } from '../core/plugins';
import type { Vec3Like } from '../core/events';
import type { MovementMode } from '../movement/types';
import { MOUNT_TUNING } from '../mount/tuning';
import { heightAt } from '../terrain/heightfield';
import { WADE_TUNING } from '../water/types';
import type { WaterService } from '../water/types';
import { CarryResets } from './carry/CarryResets';
import { Sleds } from './carry/Sleds';
import { fenVolumes, ferryNetwork, k1FenSurfaces } from './fenWater';
import { FerryRides } from './ferry/FerryRides';
import { ferryInteractId, ferryRoutes, ferryStopAnchor, m24Route, m24Volume, M24_POOL } from './sites';
import { TRAVERSAL_STRINGS_EN } from './strings.en';
import { envModelLibraryFor } from '../env/envStructureArt';
import { PUNT_LIFT, boatMesh, sledMesh, useEnvModel } from './visuals';
import { WaterPlayer, mountCapAt } from './water/WaterPlayer';
import { WaterVolumes } from './water/WaterVolumes';
import { ledgeProbe } from './water/ledge';
import { showToast } from '../waystones/toast';
import { flagConditionHolds } from '../core/flagCondition';
import { GlidePlayer } from './glide/GlidePlayer';
import { GLIDE_LANES, SHIMMER_FLAG, fallbackStand, glideInteractId } from './glide/lanes';
import { GlideShimmer } from './glide/shimmer';
import type { CarryService, FerryService, GlideService } from './service';
import '../mount/MountController';
import '../waystones/service';
import '../region/containment';
import './service';

/** K10's items (ruling P2): the boots are read as owned; the token is a pass, never spent. */
export const FEN_BOOTS_ID = 'gear.fen-boots';
export const FERRY_TOKEN_ID = 'key.ferry-token';
/** K12 writes it when M24 is done; the ferry runs from then on. */
export const FERRY_RUNNING_FLAG = 'story.m24.complete';
const DROWN_ATTACK_ID = 'traversal.drown';
/** How fast the camera swings in behind a glide (1/s). */
const GLIDE_CAMERA_EASE = 1.5;

/** What the plugin put outside its scoped context (the meshes in the scene, the mount's speed cap). */
const disposers: (() => void)[] = [];

function disposeMesh(o: THREE.Object3D): void {
  o.removeFromParent();
  o.userData.gone = true;
  o.traverse((m) => {
    // A generated model's geometry and materials belong to the model library (see useEnvModel).
    if (m instanceof THREE.Mesh && !m.userData.sharedModel) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}

const traversal: GamePlugin = {
  id: 'traversal',
  dependsOn: ['core'],
  dispose() {
    for (const d of disposers.splice(0)) d();
  },
  setup(ctx) {
    ctx.strings.register('en', TRAVERSAL_STRINGS_EN);
    const warn = (m: string) => console.warn(m);
    const player = ctx.world.player;
    const modes = () => ctx.services.get('movementMode');
    const mode = (): MovementMode => modes()?.current ?? 'walk';
    const setMode = (m: MovementMode, safe?: { position: Vec3Like; yaw: number } | null) => modes()?.set(m, safe ?? null);
    const toast = (key: string) => showToast(ctx.hud, ctx.strings.t(key));
    const fade = (o: number, s: number) => void ctx.hud.fade(o, s);

    /** The walkable surface under (x, z), probed down from `fromY` (interiors float above the terrain). */
    const groundAt = (x: number, z: number, fromY: number): number => {
      const hit = ctx.physics.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, 80, player.controller.collider);
      return hit ? hit.point.y : heightAt(x, z);
    };

    const volumes = new WaterVolumes({ groundAt, flags: ctx.state });
    let water!: WaterPlayer;
    let glide: GlidePlayer | undefined;
    /** Every K7 teleport goes through here, so neither the water nor the glide reads it as someone else's. */
    const ownTeleport = (p: Vec3Like, yaw?: number) => {
      water?.expect(p);
      glide?.expect(p);
      ctx.player.teleport({ x: p.x, y: p.y, z: p.z }, yaw);
    };

    const setVerticalIntent = (v: number | null) => player.setVerticalIntent(v);

    // The drowning hit is never lethal (ruling P3), even when Burn or Scars lowered max health.
    ctx.damage.addLethalHandler(DROWN_ATTACK_ID, (target, r) => target.id === PLAYER_ID && r.attackId === DROWN_ATTACK_ID);

    water = new WaterPlayer(volumes, {
      feet: () => ctx.player.feet,
      yaw: () => ctx.player.facingYaw,
      grounded: () => player.controller.grounded,
      teleport: (p, yaw) => ownTeleport(p, yaw),
      setControllerMode: (m) => player.controller.setMoveMode(m),
      setVerticalIntent,
      addModifier: (source, mod) => ctx.player.addMoveModifier(source, mod),
      movementMode: mode,
      setMovementMode: setMode,
      emit: ((type: string, p: unknown) => (ctx.events.emit as (t: string, p: unknown) => void)(type, p)) as never,
      toast,
      fade,
      rise: () => ctx.input.actions.down('jump'),
      sink: () => ctx.input.actions.down('sprint'),
      moving: () => ctx.player.moving,
      mounted: () => ctx.services.get('mount')?.mounted() ?? false,
      fenBoots: () => ctx.services.get('inventory')?.has(FEN_BOOTS_ID) ?? false,
      hurtNonLethal: (fraction) => {
        const a = ctx.player.actor;
        const amount = Math.min(Math.round(a.maxHealth * fraction), a.health - 1);
        if (amount > 0) ctx.damage.apply({ attackerId: null, targetId: PLAYER_ID, amount, poise: 0, kind: 'script', attackId: DROWN_ATTACK_ID });
      },
      probeLedge: ledgeProbe(ctx.physics, () => player.controller.collider),
      warn,
    });

    const service: WaterService = {
      register: (def) => volumes.register(def),
      registerRoute: (def) => volumes.registerRoute(def),
      depthAt: (x, z) => volumes.depthAt(x, z),
      volumeAt: (p) => volumes.volumeAt(p),
      get state() {
        return water.state;
      },
      get breath() {
        return water.breath;
      },
    };
    ctx.services.provide('water', service);

    // The M24 dive point (K1's hollow, K3's fence and anchors).
    volumes.register(m24Volume(M24_POOL));
    volumes.registerRoute(m24Route(M24_POOL));
    // The fen's wade and deep water (K1's surfaces): wading, the Fen Boots, the deep push-back.
    for (const v of fenVolumes(k1FenSurfaces(), warn)) volumes.register(v);

    // The Ashmare walks in any water and is pushed back from deep and dive water with the rider.
    let capOff: (() => void) | null = null;
    const mountCap = (x: number, z: number) => mountCapAt(volumes, x, z, MOUNT_TUNING.walkSpeed);

    // ---- the ferry (K1's channels when K1's module is in the build)
    const network = ferryNetwork();
    /** A stop's landing: K3's anchor when placed, else K1's point on the terrain. */
    const landing = (stopId: string): Vec3Like | null => {
      const a = ctx.anchors.find(ferryStopAnchor(stopId));
      if (a) return { ...a.position };
      const s = network.stops.find((q) => q.id === stopId);
      return s ? { x: s.x, y: heightAt(s.x, s.z) + 0.05, z: s.z } : null;
    };
    let boat: THREE.Object3D | null = null;
    disposers.push(() => {
      if (boat) disposeMesh(boat);
      boat = null;
    });
    const ferry = new FerryRides({
      feet: () => ctx.player.feet,
      yaw: () => ctx.player.facingYaw,
      hasToken: () => ctx.services.get('inventory')?.has(FERRY_TOKEN_ID) ?? false,
      running: () => ctx.state.getBool(FERRY_RUNNING_FLAG),
      inCombat: () => ctx.services.get('waystones')?.hostileAggro ?? false,
      busy: () => ctx.player.actor.dead || ctx.input.contexts.top() !== 'gameplay' || mode() !== 'walk',
      mounted: () => ctx.services.get('mount')?.mounted() ?? false,
      dismount: () => ctx.services.get('mount')?.dismount('script'),
      movementMode: mode,
      setMovementMode: setMode,
      addModifier: (source, mod) => ctx.player.addMoveModifier(source, mod),
      teleport: (p, yaw) => ownTeleport(p, yaw),
      safeTeleport: (p, yaw) => {
        const w = ctx.services.get('waystones');
        if (!w) return null;
        water.expect(p);
        glide?.expect(p);
        return w.safeTeleport({ x: p.x, y: p.y, z: p.z }, yaw);
      },
      landing,
      showBoat: (p) => {
        if (!boat) {
          boat = boatMesh();
          ctx.scene.add(boat);
          void useEnvModel(boat, 'prop.greyfen.ferry-punt', envModelLibraryFor(ctx.assets), PUNT_LIFT).catch(() => false);
        }
        boat.position.set(p.x, p.y, p.z);
        boat.rotation.set(0, p.yaw, 0);
        boat.visible = true;
      },
      hideBoat: () => {
        if (boat) boat.visible = false;
      },
      emit: ((type: string, p: unknown) => (ctx.events.emit as (t: string, p: unknown) => void)(type, p)) as never,
      toast,
      warn,
    });
    for (const r of ferryRoutes(network)) ferry.register(r);
    // Seated, the player takes no damage: a ride never ends in a death on the boat.
    ctx.damage.addModifier('traversal.ferry.seated', (req, target) => {
      if (ferry.riding && target.id === PLAYER_ID) req.outcome = 'immune';
    });
    const stopName = (id: string) => ctx.strings.t(`ferry.stop.${id}`);
    for (const stop of ferry.stops()) {
      ctx.interaction.register({
        id: ferryInteractId(stop),
        kind: 'use',
        position: (out) => {
          const p = landing(stop) ?? { x: 0, y: -1000, z: 0 };
          return out.set(p.x, p.y, p.z);
        },
        radius: 2.5,
        coneDegrees: 360,
        promptKey: 'ferry.prompt',
        promptParams: () => ({ dest: stopName(ferry.defaultDestination(stop) ?? stop) }),
        enabled: () => !ferry.riding,
        onInteract: () => {
          const to = ferry.defaultDestination(stop);
          if (to) ferry.board(stop, to);
        },
      });
    }
    // Seated: the skip prompt rides with the player (and, nearest of all, it takes the interact focus).
    const seatTmp = new THREE.Vector3();
    ctx.interaction.register({
      id: 'ferry:seated',
      kind: 'use',
      position: (out) => {
        const f = ctx.player.feet;
        return out.copy(seatTmp.set(f.x, f.y + 1, f.z));
      },
      radius: 3,
      coneDegrees: 360,
      promptKey: 'ferry.seated',
      enabled: () => ferry.riding,
      onInteract: () => ferry.skip(),
    });
    const ferryService: FerryService = {
      stops: () => ferry.stops(),
      destinations: (s) => ferry.destinations(s),
      refusal: (f, t) => ferry.refusal(f, t),
      ride: (f, t) => ferry.board(f, t),
      skip: () => ferry.skip(),
      get riding() {
        return ferry.riding;
      },
    };
    ctx.services.provide('ferry', ferryService);

    // ---- the carry reset and the sled
    const resets = new CarryResets({
      deepAt: (p) => {
        const v = volumes.volumeAt({ x: p.x, y: p.y + 0.05, z: p.z });
        if (!v) return false;
        return v.kind !== 'wade' || v.surfaceY - p.y > WADE_TUNING.maxDepth;
      },
      isOpen: (x, z) => ctx.services.get('containment')?.isOpen(x, z) ?? true,
      playerFeet: () => ctx.player.feet,
      fade,
      emit: (type, p) => ctx.events.emit(type, p),
      movementMode: mode,
      setMovementMode: (m) => setMode(m),
      warn,
    });
    const sledMeshes = new Map<string, THREE.Object3D>();
    disposers.push(() => {
      for (const m of sledMeshes.values()) disposeMesh(m);
      sledMeshes.clear();
    });
    const sleds = new Sleds(
      {
        feet: () => ctx.player.feet,
        yaw: () => ctx.player.facingYaw,
        groundAt,
        addModifier: (source, mod) => ctx.player.addMoveModifier(source, mod),
        show: (id, p, yaw) => {
          let m = sledMeshes.get(id);
          if (!m) {
            m = sledMesh();
            sledMeshes.set(id, m);
            ctx.scene.add(m);
            void useEnvModel(m, 'prop.dragonspine.supply-sled', envModelLibraryFor(ctx.assets)).catch(() => false);
          }
          m.position.set(p.x, p.y, p.z);
          m.rotation.set(0, yaw, 0);
          m.visible = true;
        },
        hide: (id) => {
          const m = sledMeshes.get(id);
          if (m) {
            disposeMesh(m);
            sledMeshes.delete(id);
          }
        },
        emit: (type, p) => ctx.events.emit(type, p),
      },
      resets,
    );
    const carryService: CarryService = {
      addSled: (def) => {
        const off = sleds.add(def);
        const iid = `sled:${def.id.replace(/^sled\./, '').replace(/\./g, '-')}`;
        const offI = ctx.interaction.register({
          id: iid,
          kind: 'use',
          position: (out) => {
            const p = sleds.position(def.id) ?? { x: 0, y: -1000, z: 0 };
            return out.set(p.x, p.y + 0.5, p.z);
          },
          radius: 3,
          coneDegrees: 360,
          get promptKey() {
            return sleds.held === def.id ? 'carry.sled.drop' : 'carry.sled.take';
          },
          // Never from the saddle: the haul refuses the mount (item 25), and riders keep the interact key.
          enabled: () =>
            (sleds.held === null || sleds.held === def.id) && (mode() === 'walk' || mode() === 'haul') && !(ctx.services.get('mount')?.mounted() ?? false),
          onInteract: () => {
            if (sleds.held === def.id) sleds.drop();
            else sleds.take(def.id);
          },
        });
        return () => {
          offI();
          off();
        };
      },
      track: (t) => resets.track(t),
      reset: (id) => resets.reset(id, 'asked'),
      checkpoint: (id) => resets.checkpoint(id),
      get heldSled() {
        return sleds.held;
      },
    };
    ctx.services.provide('carry', carryService);
    // A dialogue `event` effect may carry no payload.
    ctx.events.on('npc.carry.resetHaul', (e) => {
      const id = (e as { id?: unknown } | undefined)?.id;
      if (typeof id !== 'string' || !carryService.reset(id)) warn(`carry: "reset haul" for unknown or busy "${String(id)}"`);
    });
    ctx.events.on('carry.reset', () => toast('carry.reset.toast'));
    // A direct hit drops the sled; cold ticks, Burn and scripted damage never do (review B3).
    ctx.events.on('damage.dealt', (r) => {
      if (r.targetId !== PLAYER_ID || r.outcome !== 'hit' || !(r.dealt > 0) || !r.attackerId) return;
      if (r.kind === 'melee' || r.kind === 'spell') {
        sleds.onDirectHit();
        glidePlayer.onHit();
      }
    });

    // ---- the Dragonspine Glide (PR 2)
    const glideStand = (lane: (typeof GLIDE_LANES)[number]): Vec3Like => {
      const a = ctx.anchors.find(lane.def.anchorId);
      return a ? { ...a.position } : fallbackStand(lane.site, heightAt);
    };
    const glidePlayer = new GlidePlayer({
      feet: () => ctx.player.feet,
      grounded: () => player.controller.grounded,
      groundAt,
      launch: (vy) => player.controller.launch(vy),
      setControllerMode: (m, sinkRate) => player.controller.setMoveMode(m, { sinkRate }),
      setForcedMove: (m) => player.setForcedMove(m),
      steer: () => ctx.input.actions.axis('moveLeft', 'moveRight'),
      addModifier: (source, mod) => ctx.player.addMoveModifier(source, mod),
      movementMode: mode,
      setMovementMode: setMode,
      teleport: (p, yaw) => ownTeleport(p, yaw),
      fade,
      isOpen: (lane) => flagConditionHolds(lane.def.openWhen, ctx.state),
      stand: glideStand,
      busy: () => ctx.player.actor.dead || ctx.input.contexts.top() !== 'gameplay' || ferry.riding,
      dead: () => ctx.player.actor.dead,
      mounted: () => ctx.services.get('mount')?.mounted() ?? false,
      dismount: () => ctx.services.get('mount')?.dismount('script'),
      emit: ((type: string, p: unknown) => (ctx.events.emit as (t: string, p: unknown) => void)(type, p)) as never,
      toast,
    });
    glide = glidePlayer;
    disposers.push(() => glidePlayer.reset());
    const destName = (id: string) => ctx.strings.t(`glide.dest.${id}`);
    for (const lane of GLIDE_LANES) {
      ctx.interaction.register({
        id: glideInteractId(lane.site.id),
        kind: 'use',
        position: (out) => {
          const p = glideStand(lane);
          return out.set(p.x, p.y, p.z);
        },
        radius: 3,
        coneDegrees: 360,
        promptKey: 'glide.prompt',
        promptParams: () => ({ dest: destName(lane.site.id) }),
        // Shown once the ledge is open; a launch in another mode (hauling a sled) is refused with a toast.
        enabled: () =>
          glidePlayer.state === 'idle' && !glidePlayer.catchArmed && !ctx.player.actor.dead && !ferry.riding && flagConditionHolds(lane.def.openWhen, ctx.state),
        onInteract: () => void glidePlayer.launch(lane.site.id),
      });
    }
    // In the air the let-go prompt rides with the player (and, nearest of all, it takes the interact focus).
    const glideTmp = new THREE.Vector3();
    ctx.interaction.register({
      id: 'glide:let-go',
      kind: 'use',
      position: (out) => {
        const f = ctx.player.feet;
        return out.copy(glideTmp.set(f.x, f.y + 1, f.z));
      },
      radius: 3,
      coneDegrees: 360,
      promptKey: 'glide.letGo',
      enabled: () => glidePlayer.state === 'gliding',
      onInteract: () => glidePlayer.letGo(),
    });
    const glideService: GlideService = {
      launch: (site) => glidePlayer.launch(site),
      refusal: (site) => glidePlayer.refusal(site),
      letGo: () => glidePlayer.letGo(),
      get state() {
        return glidePlayer.state;
      },
      get ledgeId() {
        return glidePlayer.lane?.def.id ?? null;
      },
      get yaw() {
        return glidePlayer.yaw;
      },
      get heading() {
        return glidePlayer.lane?.def.heading ?? null;
      },
      get laneHalfAngle() {
        return glidePlayer.lane?.def.laneHalfAngle ?? null;
      },
      get lift() {
        return glidePlayer.lift;
      },
      get heightAboveGround() {
        return glidePlayer.heightAboveGround;
      },
      get catchArmed() {
        return glidePlayer.catchArmed;
      },
    };
    ctx.services.provide('glide', glideService);
    ctx.events.on('containment.pushed', () => glidePlayer.onContained());
    // Heat shimmer over the thermals and streaks along the slope-wind lanes, once the Last Anvil burns (design 7.5).
    const shimmer = new GlideShimmer(ctx.scene, () => ctx.player.feet);
    disposers.push(() => shimmer.dispose());

    let loadedThisRound = false;
    ctx.persist.register({
      key: 'traversal.carry',
      version: 1,
      serialize: () => ({ ...resets.serialize(), ...sleds.serialize() }),
      load: (data) => {
        loadedThisRound = true;
        resets.load(data);
        sleds.load(data);
      },
    });

    // A load: everything K7 holds on the player goes (review B2); an old save without the key starts the carries afresh.
    ctx.events.on('save.loaded', () => {
      water.reset();
      ferry.reset();
      glidePlayer.reset();
      if (!loadedThisRound) {
        resets.load(null);
        sleds.load(null);
      }
      loadedThisRound = false;
    });
    ctx.events.on('flag.changed', () => water.onFlagsChanged());
    // Fast travel by a waystone only (not a load, a respawn, a capture or a skip): held carries go back (item 25).
    ctx.events.on('fastTravel', () => resets.onTravel());

    ctx.systems.add({
      id: 'traversal.water',
      fixedPhase: 'intent',
      order: 50,
      fixedUpdate(dt) {
        const mount = ctx.services.get('mount');
        if (mount && !capOff) {
          capOff = mount.addSpeedCap(mountCap);
          disposers.push(() => capOff?.());
        }
        // The skip comes through the seated interactable below, so F never also reaches something by the landing.
        ferry.fixedUpdate(dt, false);
        water.fixedUpdate(dt);
        glidePlayer.fixedUpdate(dt);
        // The camera swings in behind the glide (gently, so mouse look still works).
        const rig = ctx.cameraRig;
        if (rig && glidePlayer.state === 'gliding') {
          const d = Math.atan2(Math.sin(glidePlayer.yaw - rig.yaw), Math.cos(glidePlayer.yaw - rig.yaw));
          rig.yaw += d * Math.min(1, GLIDE_CAMERA_EASE * dt);
        }
      },
    });
    ctx.systems.add({
      id: 'traversal.glide.shimmer',
      renderPhase: 'world',
      order: 72,
      render: (_alpha, frameTime) => shimmer.update(frameTime, ctx.state.getBool(SHIMMER_FLAG)),
    });
    ctx.systems.add({
      id: 'traversal.carry',
      fixedPhase: 'rules',
      order: 60,
      fixedUpdate(dt) {
        sleds.fixedUpdate();
        resets.fixedUpdate(dt);
      },
    });
  },
};

export default traversal;
