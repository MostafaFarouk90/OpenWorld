// Plugin `caldera-lava` (N3, plans/act5-N3.md 1.1 to 1.4): the `lava` service. Volumes burn (15%/s, never under 10%, never
// a kill) and throw Cael to a safe lip; vents cool their crusts; Surge crossings aim the Leap; the shader and haze strips
// draw. Nothing is registered by this plugin itself: N1 PR 2, N2 and N6 add the Caldera's lava (and the dev rig, ?lavarig).
import type RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { Vec3 } from '../../physics/PhysicsWorld';
import { CALDERA_CENTRE } from '../../region/act5Regions';
import type { LavaShape } from '../lava';
import '../events';
import './events';
import { Crossings } from './crossings';
import { LavaField, surfaceAt } from './LavaField';
import { lavaMaterial, makeLavaUniforms, type LavaUniforms } from './lavaMaterial';
import { hazeGeometries, hazeMesh, resample, shapeOrigin, surfaceGeometry } from './lavaMeshes';
import type { LavaService } from './service';
import { LAVA_STRINGS_EN } from './strings.en';
import { HAZE, LAVA_STRING_KEYS, VENT } from './tuning';
import type { CrustVentDef, LavaFieldDef, VentInfo } from './types';
import { VentClock } from './vents';

/** N7's soft heat-gear service (`heatWard`), read without its type so the two branches cannot collide. */
type HeatWardLike = { heatWard?(): { lava?: number } } | (() => { lava?: number });

interface VolumeView {
  group: THREE.Group;
  surface: THREE.Mesh;
  uniforms: LavaUniforms;
  baseY: number;
  untrackHaze: (() => void) | null;
}

interface CrustView {
  mesh: THREE.Mesh | null;
  uniforms: LavaUniforms | null;
  colliders: RAPIER.Collider[];
  target: number;
}

export function createLavaPlugin(): GamePlugin {
  let offs: Array<() => void> = [];
  return {
    id: 'caldera-lava',
    dependsOn: ['core'],
    setup(ctx: GameContext) {
      const cleanups: Array<() => void> = [];
      offs = cleanups;
      ctx.strings.register('en', LAVA_STRINGS_EN);
      const warn = (m: string): void => console.warn(`[caldera-lava] ${m}`);
      const actor = () => ctx.player.actor;

      const field = new LavaField({
        vitals: () => ({ health: actor().health, max: actor().maxHealth, dead: actor().dead }),
        damage: (amount) => ctx.damage.apply({ attackerId: null, targetId: actor().id, amount, poise: 0, kind: 'script', unblockable: true }),
        heal: (amount) => ctx.damage.heal(actor().id, amount),
        throwTo: async (to, yaw) => {
          const ws = ctx.services.get('waystones');
          if (ws) return (await ws.safeTeleport(to, yaw)).ok;
          ctx.player.teleport(to, yaw);
          return true;
        },
        entered: (volumeId) => ctx.events.emit('lava.entered', { volumeId }),
        thrown: (volumeId, to) => ctx.events.emit('lava.thrown', { volumeId, to: { ...to } }),
        pushMode: (getter) => {
          const mm = ctx.services.get('movementMode');
          return mm ? mm.push('lava-stair', getter) : () => {};
        },
        ward: () => {
          const s = (ctx.services as unknown as { get(n: string): HeatWardLike | undefined }).get('heatWard');
          const w = typeof s === 'function' ? s() : s?.heatWard?.();
          return typeof w?.lava === 'number' ? w.lava : 1;
        },
        warn,
      });
      const vents = new VentClock();
      const crossings = new Crossings();
      const views = new Map<string, VolumeView>();
      const crusts = new Map<string, CrustView>();
      let time = 0;

      const haze = () => ctx.services.get('heatHaze');
      const regionOffset = (o: THREE.Vector3) => ({ x: o.x - CALDERA_CENTRE.x, z: o.z - CALDERA_CENTRE.z });

      const buildView = (def: LavaFieldDef): VolumeView => {
        const height = (x: number, z: number) => surfaceAt({ def, surfaceY: def.surfaceY }, x, z);
        const origin = shapeOrigin(def.shape, def.surfaceY);
        const uniforms = makeLavaUniforms(regionOffset(origin));
        const surface = new THREE.Mesh(surfaceGeometry(def.shape, origin, height), lavaMaterial(uniforms));
        surface.name = `lava:${def.id}`;
        const group = new THREE.Group();
        group.name = `caldera-lava:${def.id}`;
        group.position.copy(origin);
        group.add(surface);
        for (const g of hazeGeometries(def.shape, origin, height, HAZE.cardHeight)) group.add(hazeMesh(g));
        ctx.scene.add(group);
        const h = haze();
        return { group, surface, uniforms, baseY: origin.y, untrackHaze: h ? h.track(group) : null };
      };

      const disposeView = (v: VolumeView): void => {
        v.untrackHaze?.();
        v.group.removeFromParent();
        v.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          for (const mat of ([] as THREE.Material[]).concat(m.material as THREE.Material)) mat.dispose();
        });
      };

      const crustColliders = (shape: LavaShape, top: (x: number, z: number) => number): RAPIER.Collider[] => {
        if (!ctx.physics.ready) return [];
        const R = ctx.physics.rapier;
        const half = VENT.crustThickness / 2;
        const make = (desc: RAPIER.ColliderDesc): RAPIER.Collider => {
          const c = ctx.physics.addStaticCollider(desc);
          c.setEnabled(false);
          return c;
        };
        if (shape.kind === 'box') {
          const cx = (shape.x0 + shape.x1) / 2;
          const cz = (shape.z0 + shape.z1) / 2;
          return [make(R.ColliderDesc.cuboid((shape.x1 - shape.x0) / 2, half, (shape.z1 - shape.z0) / 2).setTranslation(cx, top(cx, cz) - half, cz))];
        }
        if (shape.kind === 'circle') return [make(R.ColliderDesc.cylinder(half, shape.r).setTranslation(shape.x, top(shape.x, shape.z) - half, shape.z))];
        const pts = resample(shape.points, 2, 200);
        const out: RAPIER.Collider[] = [];
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1]!;
          const [bx, bz] = pts[i]!;
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 1e-3) continue;
          const mx = (ax + bx) / 2;
          const mz = (az + bz) / 2;
          const yaw = Math.atan2(bx - ax, bz - az); // the box's local +Z along the segment
          const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
          out.push(make(R.ColliderDesc.cuboid(shape.halfWidth, half, len / 2 + 0.05).setTranslation(mx, top(mx, mz) - half, mz).setRotation(q)));
        }
        return out;
      };

      const setCrust = (ventId: string, open: boolean): void => {
        field.setCrustSolid(ventId, open);
        const c = crusts.get(ventId);
        if (!c) return;
        for (const col of c.colliders) col.setEnabled(open);
        c.target = open ? 1 : 0;
        if (c.uniforms) c.uniforms.uCrack.value = 0;
      };

      const service: LavaService = {
        add(def) {
          const undo = field.add(def);
          let view: VolumeView;
          try {
            view = buildView(def);
          } catch (e) {
            undo();
            throw e;
          }
          views.set(def.id, view);
          return () => {
            undo();
            if (views.get(def.id) === view) views.delete(def.id);
            disposeView(view);
          };
        },
        addVent(def: CrustVentDef) {
          const vdef = field.def(def.volumeId);
          if (!vdef) throw new Error(`lava: vent "${def.id}" names an unknown volume "${def.volumeId}"`);
          const undoVent = vents.add(def);
          const undoCrust = field.addCrust(def.id, def.volumeId, def.crust);
          const surf = (x: number, z: number) => surfaceAt({ def: vdef, surfaceY: field.surface(def.volumeId) ?? vdef.surfaceY }, x, z);
          const c0 = shapeOrigin(def.crust, 0);
          const origin = shapeOrigin(def.crust, surf(c0.x, c0.z));
          const uniforms = makeLavaUniforms(regionOffset(origin), { swell: 0, cool: 0 });
          const mesh = new THREE.Mesh(surfaceGeometry(def.crust, origin, surf), lavaMaterial(uniforms));
          mesh.name = `lava-crust:${def.id}`;
          mesh.position.copy(origin);
          mesh.position.y += VENT.crustLift; // over the molten surface's swell
          ctx.scene.add(mesh);
          const view: CrustView = { mesh, uniforms, colliders: crustColliders(def.crust, (x, z) => surf(x, z) + VENT.crustLift), target: 0 };
          crusts.set(def.id, view);
          return () => {
            undoVent();
            undoCrust();
            if (crusts.get(def.id) === view) crusts.delete(def.id);
            mesh.removeFromParent();
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
            for (const c of view.colliders) ctx.physics.removeCollider(c);
          };
        },
        addCrossing: (def) => crossings.add(def),
        turnWheel(ventId) {
          const r = vents.turnWheel(ventId);
          if (r === 'hot') ctx.events.emit('hud.toast', { textKey: LAVA_STRING_KEYS.wheelHot });
          if (r === 'unknown') warn(`turnWheel: unknown vent "${ventId}"`);
          return r;
        },
        registerWheel(ventId, at) {
          const name = ventId.replace(/[^A-Za-z0-9_-]/g, '-');
          return ctx.interaction.register({
            id: `valve:${name}`,
            kind: 'valve',
            position: (out) => out.set(at.x, at.y, at.z),
            promptKey: LAVA_STRING_KEYS.wheelPrompt,
            enabled: () => vents.has(ventId) && !vents.isOpen(ventId),
            onInteract: () => void service.turnWheel(ventId),
          });
        },
        at: (x, y, z) => field.at(x, y, z),
        nearest: (x, z) => field.nearest(x, z),
        volumes: () => field.list(),
        vents: () =>
          vents.defs().map((d): VentInfo => {
            const open = vents.isOpen(d.id);
            return { id: d.id, at: { ...d.at }, state: open ? 'open' : 'closed', ...(open ? { closesInS: vents.closesIn(d.id) } : {}), ...(d.wheel !== undefined ? { wheel: d.wheel } : {}) };
          }),
        crossings: () => crossings.all(),
        aim: (feet, yaw) => crossings.aim(feet, yaw),
        lastSafeLip: () => field.lastSafeLip,
        safePoint: () => field.safePoint(),
        setSurface(id, y) {
          if (!field.setSurface(id, y)) return false;
          const v = views.get(id);
          if (v) v.group.position.y = v.baseY + (y - field.def(id)!.surfaceY);
          return true;
        },
        surface: (id) => field.surface(id),
        setLips: (id, lips) => field.setLips(id, lips),
      };
      cleanups.push(ctx.services.provide('lava', service));

      cleanups.push(
        ctx.systems.add({
          id: 'caldera.lava',
          fixedPhase: 'late',
          fixedUpdate(dt) {
            if (vents.defs().length > 0) {
              for (const t of vents.step(dt)) {
                if (t.kind === 'opened') {
                  setCrust(t.ventId, true);
                  ctx.events.emit('vent.opened', { ventId: t.ventId });
                } else if (t.kind === 'closing') {
                  const c = crusts.get(t.ventId);
                  if (c?.uniforms) c.uniforms.uCrack.value = 1;
                  ctx.events.emit('vent.closing', { ventId: t.ventId, inS: VENT.closingWarnS });
                } else {
                  setCrust(t.ventId, false);
                  ctx.events.emit('vent.closed', { ventId: t.ventId });
                }
              }
            }
            const f = ctx.player.feet;
            field.step(dt, { x: f.x, y: f.y, z: f.z }, ctx.world.player.controller.grounded);
          },
        }),
      );
      cleanups.push(
        ctx.systems.add({
          id: 'caldera.lava.look',
          renderPhase: 'world',
          render(_alpha, frameTime) {
            if (views.size === 0 && crusts.size === 0) return;
            const dt = Number.isFinite(frameTime) ? Math.min(0.25, Math.max(0, frameTime)) : 0;
            time += dt;
            const h = haze();
            for (const v of views.values()) {
              v.uniforms.uTime.value = time;
              // a volume added before the heat-haze plugin was up gets its haze once the service exists
              if (h && !v.untrackHaze) v.untrackHaze = h.track(v.group);
            }
            for (const c of crusts.values()) {
              if (!c.uniforms) continue;
              c.uniforms.uTime.value = time;
              const u = c.uniforms.uCool;
              const rate = c.target > u.value ? 1 / VENT.coolInS : 1 / VENT.meltS;
              u.value = c.target > u.value ? Math.min(c.target, u.value + rate * dt) : Math.max(c.target, u.value - rate * dt);
            }
          },
        }),
      );
      cleanups.push(
        ctx.events.on('save.loaded', () => {
          for (const id of vents.reset()) {
            setCrust(id, false);
            ctx.events.emit('vent.closed', { ventId: id });
          }
          const f = ctx.player.feet;
          void field.onLoaded({ x: f.x, y: f.y, z: f.z });
        }),
      );
      // The dev rig (1.7): dev builds only. `import.meta.env.DEV` is false in a production build, so the import is dropped.
      if (import.meta.env.DEV) {
        const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
        if (new URLSearchParams(search).has('lavarig')) {
          let undoRig: (() => void) | null = null;
          let gone = false;
          cleanups.push(() => {
            gone = true;
            undoRig?.();
          });
          void import('./devRig').then((m) => {
            if (!gone) undoRig = m.installLavaRig(ctx);
          });
        }
      }
      cleanups.push(() => {
        for (const v of views.values()) disposeView(v);
        views.clear();
        for (const c of crusts.values()) {
          c.mesh?.removeFromParent();
          for (const col of c.colliders) if (ctx.physics.ready) ctx.physics.removeCollider(col);
        }
        crusts.clear();
        field.dispose();
      });
    },
    dispose() {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (e) {
          console.warn('[caldera-lava] teardown step failed', e);
        }
      }
    },
  };
}

export default createLavaPlugin();

/** Exported for N1 PR 2's own `lava-stair` push over the whole stair: the service's safe point. */
export const lavaSafePoint = (ctx: GameContext): { position: Vec3; yaw: number } | null => ctx.services.get('lava')?.safePoint() ?? null;
