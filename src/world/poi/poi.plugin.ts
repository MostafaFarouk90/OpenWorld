// Plugin `poi` (thread A2): the Act 2 points of interest. Anchors and triggers are defined eagerly (other threads look
// them up); structures, props and chests are built per cluster while the player is within CLUSTER_BUILD_RADIUS and torn
// down on leaving, so Act 1 start-up builds nothing. Discovery, Leap rewards, Fox-Fire chests and the fox cache live here.
import * as THREE from 'three';
import { Chest } from '../../interaction/Chest';
import { createEffectRunner } from '../../quests/effects';
import { installPoiRewards } from '../../quests/poi';
import { codexEntry } from '../../codex/entries';
import '../../codex/service';
import { ModelBatches } from '../../assets/swap/ModelBatches';
import { modelLibraryFor } from '../../assets/swap/ModelLibrary';
import { heightAt } from '../../terrain/heightfield';
import { BuildingLookup } from '../../region/buildingLookup';
import { buildStructures, coreFactories } from '../../region/StructureBuilder';
import { createStructureArt } from '../../region/structureArt';
import { REGION_INFO, engineBox } from '../../region/regions';
import { resolveLayout } from '../../region/resolveLayout';
import type { GamePlugin } from '../../core/plugins';
import { showToast } from '../../waystones/toast';
import { roadPoint } from '../../terrain/shape/roadPoint';
import {
  ACT2_POI_GOLD,
  lootFor,
} from './loot';
import {
  FOXFIRE_CHESTS,
  FOX_CACHE_ANCHOR,
  FOX_CACHE_CHEST_ID,
  FOX_CACHE_FLAG,
  FOX_CACHE_POS,
  POI_STRINGS_EN,
  buildRewards,
  discoveredFlag,
  takenFlag,
  foxChestId,
  foxChestPos,
  loreCodexId,
} from './content';
import { FOX_FIRE_FLAG, foxFireReveals } from './foxFire';
import { registerPoiKinds } from './kinds';
import { placePiece, type PlacedPoi } from './place';
import { ACT2_POI_PLACEMENTS, resolvePose, type PoiPlacement } from './placement.act2';
import { buildProc, disposeProc } from './proc';
import { RevealedChest } from './reveal';
import type { ProcKind } from './types';

export const CLUSTER_BUILD_RADIUS = 1500;
export const CLUSTER_KEEP_RADIUS = 1700;
export const POI_SYSTEM_ID = 'poi.tick';
export const FOX_CACHE_EVENT = 'fox.cache';

export interface PoiPluginOptions {
  heightAt?: (x: number, z: number) => number;
  placements?: readonly PoiPlacement[];
}

/** A spur corridor from the road to a site that lies outside the Cinderreach box (the first ~6 km of the Cinder Road). */
export function spurCorridorFor(p: PoiPlacement, radius: number) {
  const pose = resolvePose(p);
  const covers = (id: 'cinderreach' | 'oldsmoke'): boolean => {
    const b = engineBox(id);
    return pose.x - radius >= b.x0 && pose.x + radius < b.x1 && pose.z - radius >= b.z0 && pose.z + radius < b.z1;
  };
  // A site inside a region box opens with that region; the rest hang off the road on a spur that opens with Cinderreach.
  if (covers('cinderreach') || covers('oldsmoke')) return null;
  const r = roadPoint(p.road, p.s, 0);
  return {
    id: `corridor.poi.a2.${p.site.id}`,
    points: [[r.x, r.z], [pose.x, pose.z]] as [number, number][],
    halfWidth: radius + 10,
    openWhen: p.road === 'oldsmoke-pass' ? REGION_INFO.oldsmoke.openWhen : REGION_INFO.cinderreach.openWhen,
  };
}

export function createPoiPlugin(opts: PoiPluginOptions = {}): GamePlugin {
  const height = opts.heightAt ?? heightAt;
  const placements = opts.placements ?? ACT2_POI_PLACEMENTS;
  const cleanups: Array<() => void> = [];
  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('poi: teardown step failed', err);
      }
    }
  };

  return {
    id: 'poi',
    dependsOn: ['core', 'region'],
    setup(ctx) {
      try {
        cleanups.push(ctx.strings.register('en', POI_STRINGS_EN));
        cleanups.push(registerPoiKinds());
        const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
        const on = ctx.events.on.bind(ctx.events) as (type: string, l: (p: any) => void) => () => void;
        const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
        const toast = (text: string) => showToast(ctx.hud, text);

        // ---- eager data: anchors, triggers, spur corridors, codex -----------------------------------
        const placed: PlacedPoi[] = placements.map((p) => placePiece(p.site, resolvePose(p)));
        const containment = ctx.services.get('containment');
        for (const [i, p] of placements.entries()) {
          const resolved = resolveLayout(placed[i].layout, height);
          for (const a of resolved.anchors) cleanups.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
          for (const t of resolved.triggers) cleanups.push(ctx.triggers.add({ id: t.id, who: t.who, once: t.once, shape: t.shape }));
          const spur = spurCorridorFor(p, placed[i].radius);
          if (spur && containment) cleanups.push(containment.addCorridor(spur));
        }
        const cacheY = height(FOX_CACHE_POS.x, FOX_CACHE_POS.z);
        cleanups.push(ctx.anchors.define({ id: FOX_CACHE_ANCHOR, position: { x: FOX_CACHE_POS.x, y: cacheY, z: FOX_CACHE_POS.z }, yaw: 0, tags: ['poi'] }));

        const codex = svc('codex');
        const loreIds = placements.filter((p) => p.site.template === 'lore-stone').map((p) => p.site.id);
        if (codex?.register && loreIds.length) {
          const off = codex.register(loreIds.map((id) => codexEntry('lore', loreCodexId(id), `poi-${id}`)));
          if (typeof off === 'function') cleanups.push(off);
        }

        // ---- discovery ---------------------------------------------------------------------------
        const byTrigger = new Map(placed.map((p) => [`trg.poi.a2.${p.id}.discover`, p]));
        cleanups.push(
          on('trigger.enter', (e: { triggerId?: string; actorId?: string }) => {
            const p = e?.triggerId ? byTrigger.get(e.triggerId) : undefined;
            if (!p || ctx.state.getBool(discoveredFlag(p.id))) return;
            ctx.state.setFlag(discoveredFlag(p.id), true);
            emit('discover', { placeId: p.id, kind: 'poi' });
            toast(ctx.strings.t('poi.a2.found', { name: ctx.strings.t(`poi.a2.name.${p.template}`) }));
          }),
        );

        // ---- Leap caches and lore stones: once-flagged rewards ----------------------------------------
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
          sourceId: 'poi',
          inventory: () => svc('inventory'),
          progression: () => svc('progression'),
          warn: (m) => console.warn(m),
        });
        const rewards = buildRewards(ACT2_POI_GOLD);
        const goldOf = new Map(rewards.map((r) => [r.interactableId, r.effects.reduce((n, e) => n + ('giveGold' in e ? e.giveGold : 0), 0)]));
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
            const g = e?.interactableId ? goldOf.get(e.interactableId) : undefined;
            const r = rewards.find((x) => x.interactableId === e?.interactableId);
            if (g && r && ctx.state.getBool(r.onceFlag)) toast(ctx.strings.t('economy.gold.found', { gold: g }));
          }),
        );

        // ---- chest gold (own table; CHEST_GOLD is Act 1's) ---------------------------------------------
        cleanups.push(
          on('loot.granted', (e: { sourceId?: string }) => {
            const gold = e?.sourceId ? ACT2_POI_GOLD[e.sourceId] : undefined;
            if (!gold) return;
            const inv = svc('inventory');
            if (!inv?.addGold) return;
            inv.addGold(gold);
            toast(ctx.strings.t('economy.gold.found', { gold }));
          }),
        );

        // ---- Fox-Fire chests and the fox cache -----------------------------------------------------
        const chestObj = (x: number, z: number): THREE.Object3D => {
          const o = new THREE.Group();
          o.position.set(x, height(x, z), z);
          return o;
        };
        const makeChest = (id: string, x: number, z: number, loot: ReturnType<typeof lootFor>, parent: THREE.Group) => () => {
          const object = chestObj(x, z);
          const chestMesh = buildProc('bedroll', 0.5);
          object.add(chestMesh);
          parent.add(object);
          const chest = new Chest(ctx, { id, object, loot, name: 'chest' });
          return {
            dispose() {
              chest.dispose();
              object.removeFromParent();
              disposeProc(object);
            },
          };
        };
        const revealGroup = new THREE.Group();
        revealGroup.name = 'poi-reveal';
        ctx.scene.add(revealGroup);
        cleanups.push(() => {
          ctx.scene.remove(revealGroup);
        });
        const glimmered = new Set<string>();
        const foxChests = FOXFIRE_CHESTS.map((f) => {
          const pos = foxChestPos(f);
          const id = foxChestId(f.n);
          return {
            pos,
            chest: new RevealedChest(
              id,
              makeChest(id, pos.x, pos.z, lootFor('foxfire'), revealGroup),
              () => ctx.state.getBool(`chest.${id.slice(id.indexOf(':') + 1)}.opened`),
              () => {
                if (glimmered.has(id)) return;
                glimmered.add(id);
                toast(ctx.strings.t('poi.a2.foxfire.glimmer'));
              },
            ),
          };
        });
        const cache = new RevealedChest(
          FOX_CACHE_CHEST_ID,
          makeChest(FOX_CACHE_CHEST_ID, FOX_CACHE_POS.x, FOX_CACHE_POS.z, lootFor('fox-cache'), revealGroup),
          () => ctx.state.getBool(`chest.${FOX_CACHE_CHEST_ID.slice(FOX_CACHE_CHEST_ID.indexOf(':') + 1)}.opened`),
        );
        const syncReveal = (): void => {
          const feet = ctx.player.feet;
          const buff = ctx.state.getBool(FOX_FIRE_FLAG);
          for (const f of foxChests) f.chest.sync(foxFireReveals(buff, feet.x - f.pos.x, feet.z - f.pos.z));
          cache.sync(ctx.state.getBool(FOX_CACHE_FLAG));
        };
        // A6b emits fox.cache when the fed fox reaches the cache; we own the flag (runtime guard: the type may not exist yet).
        cleanups.push(
          on(FOX_CACHE_EVENT, (e: { foxId?: unknown } | null | undefined) => {
            if (typeof e?.foxId !== 'string' || e.foxId === '') return;
            if (!ctx.state.getBool(FOX_CACHE_FLAG)) ctx.state.setFlag(FOX_CACHE_FLAG, true);
            syncReveal();
          }),
        );
        cleanups.push(on('save.loaded', () => syncReveal()));
        cleanups.push(() => {
          for (const f of foxChests) f.chest.dispose();
          cache.dispose();
        });

        // ---- per-cluster build --------------------------------------------------------------------------
        const clusters = new Map<string, { members: PlacedPoi[]; cx: number; cz: number; built: { dispose(): void } | null; building: boolean }>();
        placements.forEach((p, i) => {
          const c = clusters.get(p.cluster) ?? { members: [], cx: 0, cz: 0, built: null, building: false };
          c.members.push(placed[i]);
          clusters.set(p.cluster, c);
        });
        for (const c of clusters.values()) {
          c.cx = c.members.reduce((s, m) => s + m.pose.x, 0) / c.members.length;
          c.cz = c.members.reduce((s, m) => s + m.pose.z, 0) / c.members.length;
        }
        const lookup = new BuildingLookup(undefined, undefined, createStructureArt(modelLibraryFor(ctx.assets)));
        const buildCluster = (c: { members: PlacedPoi[]; built: { dispose(): void } | null; building: boolean }): void => {
          c.building = true;
          const root = new THREE.Group();
          root.name = 'poi-cluster';
          ctx.scene.add(root);
          const structures = buildStructures(
            { ...ctx, rapier: ctx.physics.rapier, ...coreFactories(ctx) },
            { structures: c.members.flatMap((m) => m.layout.structures) },
            height,
            lookup,
          );
          const chests: Chest[] = [];
          const uses: Array<() => void> = [];
          const procs: THREE.Object3D[] = [];
          let disposed = false;
          for (const m of c.members) {
            for (const it of m.piece.interactables) {
              const a = ctx.anchors.get(`poi.a2.${m.id}.${it.anchor}`);
              if (it.kind === 'use') {
                if (it.prop) {
                  const prop = buildProc(it.prop);
                  prop.position.set(a.position.x, a.position.y, a.position.z);
                  prop.rotation.y = a.yaw;
                  root.add(prop);
                  procs.push(prop);
                }
                const flag = takenFlag(m.id);
                uses.push(
                  ctx.interaction.register({
                    id: it.id,
                    kind: 'use',
                    position: (out) => out.set(a.position.x, a.position.y, a.position.z),
                    radius: 2.5,
                    promptKey: 'interact.use',
                    enabled: () => !ctx.state.getBool(flag),
                    onInteract() {},
                  }),
                );
                continue;
              }
              const object = new THREE.Group();
              object.position.set(a.position.x, a.position.y, a.position.z);
              root.add(object);
              chests.push(new Chest(ctx, { id: it.id, object, loot: lootFor(m.template) }));
            }
            for (const part of m.parts) {
              if (!part.asset.startsWith('proc:')) continue;
              const g = buildProc(part.asset.slice(5) as ProcKind, part.scale);
              g.position.set(part.x, height(part.x, part.z) + (part.dy ?? 0), part.z);
              g.rotation.y = (part.yawDeg * Math.PI) / 180;
              root.add(g);
              procs.push(g);
            }
          }
          const lib = modelLibraryFor(ctx.assets);
          const batches = new ModelBatches();
          void (async () => {
            const tmp = new THREE.Matrix4();
            for (const m of c.members) {
              for (const part of m.parts) {
                if (part.asset.startsWith('proc:') || disposed) continue;
                const t = await lib.template(part.asset);
                if (!t || disposed) continue;
                const y = height(part.x, part.z) + (part.dy ?? 0);
                tmp.compose(
                  new THREE.Vector3(part.x, y, part.z),
                  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (part.yawDeg * Math.PI) / 180),
                  new THREE.Vector3(part.scale, part.scale, part.scale),
                );
                batches.add(m.id, t, tmp);
              }
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
              for (const u of uses) u();
              structures.dispose();
              for (const p of procs) disposeProc(p);
              root.removeFromParent();
              // Model geometry belongs to the library; only the instance buffers are ours.
              root.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
            },
          };
          c.building = false;
        };
        const syncClusters = (): void => {
          const feet = ctx.player.feet;
          for (const c of clusters.values()) {
            const d = Math.hypot(feet.x - c.cx, feet.z - c.cz);
            if (!c.built && d <= CLUSTER_BUILD_RADIUS && !c.building) buildCluster(c);
            else if (c.built && d > CLUSTER_KEEP_RADIUS) {
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
            id: POI_SYSTEM_ID,
            fixedPhase: 'rules',
            order: 400,
            fixedUpdate(dt) {
              syncReveal();
              acc += dt;
              if (acc >= 1) {
                acc = 0;
                syncClusters();
              }
            },
          }),
        );
        syncClusters();
        syncReveal();
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

export default createPoiPlugin();
