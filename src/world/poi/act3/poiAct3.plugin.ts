// Plugin `poi-act3` (thread K2): the Act 3 points of interest, Leap spots, the six Dragonspine rubbings and the road dressing.
// Anchors, triggers and spur corridors are defined eagerly (other threads look them up); structures, props, chests and the
// interactables are built per cluster while the player is within CLUSTER_BUILD_RADIUS and torn down past CLUSTER_KEEP_RADIUS,
// so start-up anywhere outside Act 3 builds nothing. A2's plugin (`poi`) is untouched; this one reuses its pieces.
import * as THREE from 'three';
import { Chest } from '../../../interaction/Chest';
import { createEffectRunner } from '../../../quests/effects';
import { installPoiRewards } from '../../../quests/poi';
import { codexEntry } from '../../../codex/entries';
import '../../../codex/service';
import '../../../shrine/act3/rubbings';
import { ModelBatches } from '../../../assets/swap/ModelBatches';
import { modelLibraryFor } from '../../../assets/swap/ModelLibrary';
import { envModelLibraryFor } from '../../../env/envStructureArt';
import { heightAt } from '../../../terrain/heightfield';
import { BuildingLookup } from '../../../region/buildingLookup';
import { groundRange } from '../../../region/geometry';
import { buildStructures, coreFactories } from '../../../region/StructureBuilder';
import { createStructureArt, type StructureArt } from '../../../region/structureArt';
import { REGION_INFO } from '../../../region/regions';
import { resolveLayout } from '../../../region/resolveLayout';
import type { StructureSpec } from '../../../region/layoutTypes';
import type { GamePlugin } from '../../../core/plugins';
import { showToast } from '../../../waystones/toast';
import { roadPoint } from '../../../terrain/shape/roadPoint';
import { registerPoiKinds } from '../kinds';
import { buildProc, disposeProc } from '../proc';
import type { PoiPart, ProcKind } from '../types';
import {
  A3_RUBBING_HOLD_SECONDS,
  ACT3_POI_GOLD,
  POI_A3_STRINGS_EN,
  a3DiscoveredFlag,
  a3LootFor,
  a3LoreCodexId,
  a3TakenFlag,
  buildA3Rewards,
  rubbingSites,
} from './content';
import { ACT3_DRESSING_PLACED, dressingCluster, type PlacedDressing } from './dressing';
import { registerA3Kinds } from './kinds';
import { ACT3_POI_PLACEMENTS, ACT3_POI_PLACED, a3AnchorPrefix, a3TriggerId, type A3Placement, type PlacedA3 } from './place';
import { A3_COLLIDER_KIND, LEDGE_HEIGHT } from './templates';

export const A3_CLUSTER_BUILD_RADIUS = 1500;
export const A3_CLUSTER_KEEP_RADIUS = 1700;
export const POI_A3_SYSTEM_ID = 'poi-act3.tick';

export interface PoiAct3Options {
  heightAt?: (x: number, z: number) => number;
  placements?: readonly A3Placement[];
  placed?: readonly PlacedA3[];
  dressing?: readonly PlacedDressing[];
  /** Where toasts go (default: the HUD); tests read them. */
  toast?: (text: string) => void;
}

/** A null-land Leap cache hangs off its road on a spur that opens with the region the road leads to (A2's pattern). */
export function a3SpurCorridorFor(p: A3Placement, placed: PlacedA3) {
  if (p.region !== 'fenroad' && p.region !== 'spineroad') return null;
  if (!('road' in p.where)) return null;
  const r = roadPoint(p.where.road, p.where.s, 0);
  return {
    id: `corridor.poi.a3.${p.site.id}`,
    points: [[r.x, r.z], [placed.pose.x, placed.pose.z]] as [number, number][],
    halfWidth: placed.radius + 10,
    openWhen: p.region === 'fenroad' ? REGION_INFO.greyfen.openWhen : REGION_INFO.dragonspine.openWhen,
  };
}

/** The art for K2's structures: `poi-a3-collider` draws nothing (its model is a part); the rest is A2's art (rock, lookout). */
function a3Art(base: StructureArt): StructureArt {
  return async (spec: StructureSpec) => {
    if (spec.kind === A3_COLLIDER_KIND) {
      const g = new THREE.Group();
      g.name = `${A3_COLLIDER_KIND}:${spec.id}`;
      return g;
    }
    return base(spec);
  };
}

interface Cluster {
  pois: PlacedA3[];
  dressing: PlacedDressing[];
  cx: number;
  cz: number;
  built: { dispose(): void } | null;
}

export function createPoiAct3Plugin(opts: PoiAct3Options = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const placements = opts.placements ?? ACT3_POI_PLACEMENTS;
  const placedAll = opts.placed ?? ACT3_POI_PLACED;
  const dressingAll = opts.dressing ?? ACT3_DRESSING_PLACED;
  const cleanups: Array<() => void> = [];
  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('poi-act3: teardown step failed', err);
      }
    }
  };

  return {
    id: 'poi-act3',
    dependsOn: ['core', 'region', 'codex', 'anvil-rubbings'],
    setup(ctx) {
      try {
        cleanups.push(ctx.strings.register('en', POI_A3_STRINGS_EN));
        cleanups.push(registerPoiKinds());
        cleanups.push(registerA3Kinds());
        const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
        const on = ctx.events.on.bind(ctx.events) as (type: string, l: (p: any) => void) => () => void;
        const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
        const show = opts.toast ?? ((text: string) => showToast(ctx.hud, text));
        const toast = (key: string, params?: Record<string, string | number>) => show(ctx.strings.t(key, params));

        // ---- eager data: anchors (a ledge's anchors sit on its built top), triggers, spur corridors ----------
        const containment = ctx.services.get('containment');
        placedAll.forEach((pl, i) => {
          const resolved = resolveLayout(pl.layout, height);
          const ledge = pl.layout.structures.find((s) => s.role === 'ledge');
          const ledgeY = ledge ? groundRange(ledge, height, 1).max + (ledge.height ?? LEDGE_HEIGHT) : null;
          for (const a of resolved.anchors) {
            const onLedge = ledgeY !== null && (a.tags ?? []).includes('leap-gated');
            const position = onLedge ? { ...a.position, y: ledgeY } : a.position;
            cleanups.push(ctx.anchors.define({ id: a.id, position, yaw: a.yaw, tags: a.tags }));
          }
          for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));
          const p = placements[i];
          const spur = p ? a3SpurCorridorFor(p, pl) : null;
          if (spur && containment) cleanups.push(containment.addCorridor(spur));
        });

        // ---- codex: the song stone (the rubbings' entries are K9's service's) --------------------------
        const codex = svc('codex');
        const songs = placedAll.filter((p) => p.template === 'song-stone');
        if (codex?.register && songs.length) {
          const off = codex.register(songs.map((p) => codexEntry('lore', a3LoreCodexId(p.id), `poi-${p.id}`)));
          if (typeof off === 'function') cleanups.push(off);
        }

        // ---- rubbings: registered with K9's service; taken with a hold at the stone ------------------
        const rubbings = rubbingSites(placedAll);
        const rubbingSvc = ctx.services.get('anvilRubbings');
        if (rubbingSvc) cleanups.push(rubbingSvc.register(rubbings.map((r) => ({ id: r.rubbing }))));
        else if (rubbings.length) console.warn('poi-act3: no anvilRubbings service, the Dragonspine rubbings are off');
        const takeRubbing = (id: string): void => {
          const s = ctx.services.get('anvilRubbings');
          if (!s || !s.take(id)) return;
          if (s.readable()) toast('rubbing.taken', { title: ctx.strings.t(`codex.lore.rubbing-${id}.name`) });
          else toast('rubbing.locked');
        };

        // ---- discovery -------------------------------------------------------------------------------
        const byTrigger = new Map(placedAll.map((p) => [a3TriggerId(p.region, p.id), p]));
        cleanups.push(
          on('trigger.enter', (e: { triggerId?: string }) => {
            const p = e?.triggerId ? byTrigger.get(e.triggerId) : undefined;
            if (!p || ctx.state.getBool(a3DiscoveredFlag(p.id))) return;
            ctx.state.setFlag(a3DiscoveredFlag(p.id), true);
            emit('discover', { placeId: p.id, kind: 'poi' });
            toast('poi.a3.found', { name: ctx.strings.t(`poi.a3.name.${p.template}`) });
          }),
        );

        // ---- Leap caches and the song stone: once-flagged rewards -------------------------------------
        const bus = { on, emit };
        const statePort = {
          getFlag: (k: string) => ctx.state.getFlag(k),
          setFlag: (k: string, v: boolean | number | string) => ctx.state.setFlag(k, v),
        } as never;
        const quests = { state: () => 'inactive', objectiveDone: () => false, start: () => false, complete: () => false, completeObjective: () => false };
        const runner = createEffectRunner({
          state: statePort,
          quests: quests as never,
          bus,
          sourceId: 'poi-act3',
          inventory: () => svc('inventory'),
          progression: () => svc('progression'),
          warn: (m) => console.warn(m),
        });
        const rewards = buildA3Rewards(placedAll);
        cleanups.push(
          installPoiRewards(rewards as never, {
            bus,
            state: statePort,
            run: (effects) => runner.run(effects),
            warn: (m) => console.warn(m),
            codexUnlock: (id) => svc('codex')?.unlock?.(id),
          }),
        );
        cleanups.push(
          on('interact', (e: { interactableId?: string }) => {
            const r = rewards.find((x) => x.interactableId === e?.interactableId);
            const g = r ? ACT3_POI_GOLD[r.interactableId] : undefined;
            if (g && r && ctx.state.getBool(r.onceFlag)) toast('economy.gold.found', { gold: g });
          }),
        );
        // Chest gold (own table; Act 1's CHEST_GOLD and Act 2's ACT2_POI_GOLD never hold these ids).
        cleanups.push(
          on('loot.granted', (e: { sourceId?: string }) => {
            const gold = e?.sourceId ? ACT3_POI_GOLD[e.sourceId] : undefined;
            if (!gold || !e.sourceId?.startsWith('chest:')) return;
            const inv = svc('inventory');
            if (!inv?.addGold) return;
            inv.addGold(gold);
            toast('economy.gold.found', { gold });
          }),
        );

        // ---- per-cluster build ---------------------------------------------------------------------
        const clusters = new Map<string, Cluster>();
        const clusterOf = (key: string): Cluster => {
          let c = clusters.get(key);
          if (!c) clusters.set(key, (c = { pois: [], dressing: [], cx: 0, cz: 0, built: null }));
          return c;
        };
        for (const p of placedAll) clusterOf(p.cluster).pois.push(p);
        for (const d of dressingAll) clusterOf(dressingCluster(d.site)).dressing.push(d);
        for (const c of clusters.values()) {
          const pts = [...c.pois.map((p) => p.pose), ...c.dressing.map((d) => d.pose)];
          c.cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          c.cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        }
        const lookup = new BuildingLookup(undefined, undefined, a3Art(createStructureArt(modelLibraryFor(ctx.assets))));
        const anchorPos = (p: PlacedA3, local: string) => ctx.anchors.get(`${a3AnchorPrefix(p.region, p.id)}${local}`).position;

        const buildCluster = (c: Cluster): void => {
          const root = new THREE.Group();
          root.name = 'poi-act3-cluster';
          ctx.scene.add(root);
          const structures = buildStructures(
            { ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) },
            { structures: [...c.pois.flatMap((m) => m.layout.structures), ...c.dressing.flatMap((d) => d.structures)] },
            height,
            lookup,
          );
          const chests: Chest[] = [];
          const offs: Array<() => void> = [];
          const procs: THREE.Object3D[] = [];
          let disposed = false;
          const addProc = (kind: ProcKind, x: number, y: number, z: number, yaw: number, scale = 1) => {
            const g = buildProc(kind, scale);
            g.position.set(x, y, z);
            g.rotation.y = yaw;
            root.add(g);
            procs.push(g);
          };
          for (const m of c.pois) {
            for (const it of m.piece.interactables) {
              const a = anchorPos(m, it.anchor);
              const at = (out: THREE.Vector3) => out.set(a.x, a.y, a.z);
              if (it.kind === 'chest') {
                const object = new THREE.Group();
                object.position.set(a.x, a.y, a.z);
                root.add(object);
                chests.push(new Chest(ctx, { id: it.id, object, loot: a3LootFor(m) }));
              } else if (it.kind === 'rubbing') {
                const id = it.id.slice('use:poi-a3-rubbing-'.length);
                offs.push(
                  ctx.interaction.register({
                    id: it.id,
                    kind: 'use',
                    position: at,
                    radius: 2.5,
                    coneDegrees: 360,
                    holdSeconds: A3_RUBBING_HOLD_SECONDS,
                    promptKey: 'poi.a3.rubbing.prompt',
                    enabled: () => !!ctx.services.get('anvilRubbings') && !ctx.services.get('anvilRubbings')!.taken(id),
                    onInteract: () => takeRubbing(id),
                  }),
                );
              } else {
                if (it.prop) addProc(it.prop, a.x, a.y, a.z, 0);
                const flag = a3TakenFlag(m.id);
                offs.push(
                  ctx.interaction.register({
                    id: it.id,
                    kind: 'use',
                    position: at,
                    radius: 2.5,
                    promptKey: m.template === 'song-stone' ? 'poi.a3.song.prompt' : 'interact.use',
                    enabled: () => !ctx.state.getBool(flag),
                    onInteract() {},
                  }),
                );
              }
            }
          }
          const parts: Array<{ owner: string; part: PoiPart; y: number }> = [];
          for (const m of c.pois) {
            const ledge = m.layout.structures.find((s) => s.role === 'ledge');
            const ledgeY = ledge ? groundRange(ledge, height, 1).max : null;
            for (const pt of m.parts) {
              // A part lifted by the ledge height stands on the ledge's built top, not on the ground under it.
              const base = ledgeY !== null && pt.dy === LEDGE_HEIGHT ? ledgeY : height(pt.x, pt.z);
              parts.push({ owner: m.id, part: pt, y: base + (pt.dy ?? 0) });
            }
          }
          for (const d of c.dressing) for (const pt of d.parts) parts.push({ owner: d.site.id, part: pt, y: height(pt.x, pt.z) + (pt.dy ?? 0) });
          for (const { part: pt, y } of parts) {
            if (pt.asset.startsWith('proc:')) addProc(pt.asset.slice(5) as ProcKind, pt.x, y, pt.z, (pt.yawDeg * Math.PI) / 180, pt.scale);
          }
          const lib = envModelLibraryFor(ctx.assets);
          const batches = new ModelBatches();
          void (async () => {
            const tmp = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const up = new THREE.Vector3(0, 1, 0);
            for (const { owner, part: pt, y } of parts) {
              if (pt.asset.startsWith('proc:') || disposed) continue;
              let t = null;
              try {
                t = await lib.template(pt.asset);
              } catch (err) {
                console.warn(`poi-act3: ${pt.asset} failed to load`, err);
              }
              if (!t || disposed) continue;
              tmp.compose(new THREE.Vector3(pt.x, y, pt.z), q.setFromAxisAngle(up, (pt.yawDeg * Math.PI) / 180), new THREE.Vector3(pt.scale, pt.scale, pt.scale));
              batches.add(owner, t, tmp);
            }
            if (disposed) return;
            const { groups } = batches.build();
            for (const g of groups.values()) root.add(g);
          })();
          void structures.upgrade();
          c.built = {
            dispose() {
              if (disposed) return;
              disposed = true;
              for (const ch of chests) ch.dispose();
              for (const off of offs) off();
              structures.dispose();
              for (const p of procs) disposeProc(p);
              root.removeFromParent();
              root.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
            },
          };
        };
        const syncClusters = (): void => {
          const feet = ctx.player.feet;
          for (const c of clusters.values()) {
            const d = Math.hypot(feet.x - c.cx, feet.z - c.cz);
            if (!c.built && d <= A3_CLUSTER_BUILD_RADIUS) buildCluster(c);
            else if (c.built && d > A3_CLUSTER_KEEP_RADIUS) {
              c.built.dispose();
              c.built = null;
            }
          }
        };
        cleanups.push(() => {
          for (const c of clusters.values()) {
            c.built?.dispose();
            c.built = null;
          }
        });
        cleanups.push(on('save.loaded', () => syncClusters()));
        let acc = 0;
        cleanups.push(
          ctx.systems.add({
            id: POI_A3_SYSTEM_ID,
            fixedPhase: 'rules',
            order: 401,
            fixedUpdate(dt) {
              acc += dt;
              if (acc >= 1) {
                acc = 0;
                syncClusters();
              }
            },
          }),
        );
        syncClusters();
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createPoiAct3Plugin();
