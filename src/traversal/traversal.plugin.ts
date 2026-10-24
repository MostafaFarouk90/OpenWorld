// K7 PR 1: water (wading, the deep edge, diving), the Greyfen ferry, the sled and the carry reset (contracts v0.7
// items 4, 6, 7 and 25). Wires the pure pieces to the game. The shared controller is reached only through K0's hooks:
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
import { FerryRides } from './ferry/FerryRides';
import { ACT3_FERRY, ferryInteractId, ferryRoutes, ferryStopAnchor, m24Route, m24Volume, M24_POOL } from './sites';
import { TRAVERSAL_STRINGS_EN } from './strings.en';
import { boatMesh, sledMesh } from './visuals';
import { WaterPlayer, mountCapAt } from './water/WaterPlayer';
import { WaterVolumes } from './water/WaterVolumes';
import { ledgeProbe } from './water/ledge';
import { showToast } from '../waystones/toast';
import type { CarryService, FerryService } from './service';
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

const traversal: GamePlugin = {
  id: 'traversal',
  dependsOn: ['core'],
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
    /** Every K7 teleport goes through here, so the water system never reads it as someone else's. */
    const ownTeleport = (p: Vec3Like, yaw?: number) => {
      water?.expect(p);
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

    // The Ashmare walks in any water and is pushed back from deep and dive water with the rider.
    let capOff: (() => void) | null = null;
    const mountCap = (x: number, z: number) => mountCapAt(volumes, x, z, MOUNT_TUNING.walkSpeed);

    // ---- the ferry
    /** A stop's landing: K3's anchor when placed, else K1's point on the terrain. */
    const landing = (stopId: string): Vec3Like | null => {
      const a = ctx.anchors.find(ferryStopAnchor(stopId));
      if (a) return { ...a.position };
      const s = ACT3_FERRY.stops.find((q) => q.id === stopId);
      return s ? { x: s.x, y: heightAt(s.x, s.z) + 0.05, z: s.z } : null;
    };
    let boat: THREE.Object3D | null = null;
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
        return w.safeTeleport({ x: p.x, y: p.y, z: p.z }, yaw);
      },
      landing,
      showBoat: (p) => {
        if (!boat) {
          boat = boatMesh();
          ctx.scene.add(boat);
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
    for (const r of ferryRoutes(ACT3_FERRY)) ferry.register(r);
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
          }
          m.position.set(p.x, p.y, p.z);
          m.rotation.set(0, yaw, 0);
          m.visible = true;
        },
        hide: (id) => {
          const m = sledMeshes.get(id);
          if (m) {
            m.removeFromParent();
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
          enabled: () => (sleds.held === null || sleds.held === def.id) && (mode() === 'walk' || mode() === 'haul'),
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
    ctx.events.on('npc.carry.resetHaul', (e) => {
      if (!carryService.reset(e.id)) warn(`carry: "reset haul" for unknown or busy "${e.id}"`);
    });
    ctx.events.on('carry.reset', () => toast('carry.reset.toast'));
    // A direct hit drops the sled; cold ticks, Burn and scripted damage never do (review B3).
    ctx.events.on('damage.dealt', (r) => {
      if (r.targetId !== PLAYER_ID || r.outcome !== 'hit' || !(r.dealt > 0) || !r.attackerId) return;
      if (r.kind === 'melee' || r.kind === 'spell') sleds.onDirectHit();
    });

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
      if (!loadedThisRound) {
        resets.load(null);
        sleds.load(null);
      }
      loadedThisRound = false;
    });
    ctx.events.on('flag.changed', () => water.onFlagsChanged());

    let wasTravelling = false;
    ctx.systems.add({
      id: 'traversal.water',
      fixedPhase: 'intent',
      order: 50,
      fixedUpdate(dt) {
        const mount = ctx.services.get('mount');
        if (mount && !capOff) capOff = mount.addSpeedCap(mountCap);
        ferry.fixedUpdate(dt, ctx.input.actions.pressed('interact'));
        water.fixedUpdate(dt);
      },
    });
    ctx.systems.add({
      id: 'traversal.carry',
      fixedPhase: 'rules',
      order: 60,
      fixedUpdate(dt) {
        const travelling = ctx.services.get('waystones')?.travelling ?? false;
        if (travelling && !wasTravelling) resets.onTravel();
        wasTravelling = travelling;
        sleds.fixedUpdate();
        resets.fixedUpdate(dt);
      },
    });
  },
};

export default traversal;
