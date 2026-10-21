import type { GamePlugin } from '../core/plugins';
import { withTutorialLead } from './tutorialLead';
import '../tutorial/service';
import { heightAt } from '../terrain/heightfield';
import '../waystones/service';
import '../quests/service';
import { createLeadSource, killObjectiveLeads, m05ObjectiveLead, type LeadMarker } from '../quests/leads';
import { KILL_FAILSAFE_QUESTS, currentKillTargets } from '../quests/killFailsafe';
import '../shrine/service';
import { FogGrid, buildMarkers, mapExtent, type MapMarker } from './MapModel';
import { createMapSources } from './MapSources';
import { createMapModal } from './MapView';
import { createMinimap } from './Minimap';
import { MAP_STRINGS_EN } from './strings.en';
import { renderLocalTile, renderTerrainBitmap, minimapTilePlan, type TerrainBitmap } from './TerrainBitmap';
import { DEFAULT_WORLD_BOUNDS, MAP_TUNING } from './tuning';
import type { MapViewModel } from './viewTypes';
import { openRegionAt, regionChips, type RegionChip } from './regionLayer';
import '../region/containment';


const map: GamePlugin = {
  id: 'map',
  dependsOn: ['core', 'waystones'],
  setup(ctx) {
    ctx.strings.register('en', MAP_STRINGS_EN);
    const bounds = { ...DEFAULT_WORLD_BOUNDS };
    let fog = FogGrid.forBounds(bounds);
    const waystones = () => ctx.services.get('waystones');

    ctx.persist.register({
      key: 'map',
      // v2: widened world. v1 was a 4 km square with the same origin and cells; its explored cells are
      // copied one by one (FogGrid.migrate), so a header mismatch never wipes them.
      version: 2,
      serialize: () => ({ fog: fog.encode() }),
      load: (data) => {
        const d = typeof data === 'object' && data !== null ? (data as { fog?: unknown }) : {};
        fog = FogGrid.migrate(d.fog, FogGrid.forBounds(bounds).spec);
      },
    });

    const sources = createMapSources(
      {
        gates: ctx.gates,
        events: ctx.events,
        service: (name) => (ctx.services as unknown as { get(n: string): unknown }).get(name),
        flag: (key) => ctx.state.getBool(key),
        anchor: (id) => {
          const p = ctx.anchors.find(id)?.position;
          return p ? { x: p.x, z: p.z } : undefined;
        },
      },
      (k, p) => ctx.strings.t(k, p),
    );

    // Quest-offer leads, re-derived when quest state changes or a save loads (the cache is dropped while a
    // giver is not placed yet, so it fills in once the NPC exists).
    const leadSource = createLeadSource({
      env: () => ({ state: ctx.state, quests: ctx.services.get('quests') ?? { state: () => 'inactive', objectiveDone: () => false } }),
      npcPosition: (id) => ctx.services.get('npcs')?.position(id),
      anchor: (id) => ctx.anchors.find(id)?.position,
      warn: (m) => console.warn(`[map] ${m}`),
    });
    let leads: LeadMarker[] | null = null;
    const dropLeads = () => { leads = null; };
    for (const e of ['quest.started', 'quest.completed', 'quest.failed', 'save.loaded'] as const) ctx.events.on(e, dropLeads);
    const currentLeads = (): LeadMarker[] => {
      if (!leads) {
        const fresh = leadSource.markers();
        if (leadSource.skipped) return fresh;
        leads = fresh;
      }
      return leads;
    };

    // Where an active quest's current objective is (M05 Tobb): the gold marker the offer lead was.
    const objectiveLeads = (): LeadMarker[] => {
      const quests = ctx.services.get('quests');
      if (!quests) return [];
      const kills = killObjectiveLeads({
        targets: () => (ctx.state.getBool('tutorial.complete') ? currentKillTargets(quests, KILL_FAILSAFE_QUESTS) : []),
        nearestLiving: (tag) => {
          const f = ctx.player.feet;
          let best: { x: number; z: number } | undefined;
          let bestD = Infinity;
          for (const a of ctx.actors.all()) {
            if (a.dead || (a as { spawnTag?: string }).spawnTag !== tag || !a.root) continue;
            const d = (a.root.position.x - f.x) ** 2 + (a.root.position.z - f.z) ** 2;
            if (d < bestD) { bestD = d; best = { x: a.root.position.x, z: a.root.position.z }; }
          }
          return best;
        },
      });
      return [...kills, ...m05ObjectiveLead({
        questState: (id) => quests.state(id),
        objectiveDone: (q, o) => quests.objectiveDone(q, o),
        nextWardstone: () => ctx.services.get('shrine')?.nextWardstone() ?? null,
        anchor: (id) => ctx.anchors.find(id)?.position,
        // Tobb is a companion once M05 starts: his NPC position is where he stood at the handover.
        npcPosition: (id) => {
          const aid = id === 'tobb' ? ctx.services.get('companions')?.actorId('tobb') : null;
          const root = aid ? ctx.actors.get(aid)?.root : undefined;
          return root ? { x: root.position.x, z: root.position.z } : ctx.services.get('npcs')?.position(id);
        },
      })];
    };

    // Terrain bitmaps are rendered in time-boxed slices, one slice per frame.
    let full: TerrainBitmap | null = null;
    const px = mapExtent(bounds, MAP_TUNING.fullMapPixels);
    const fullGen = renderTerrainBitmap(heightAt, { bounds, width: px.width, height: px.height });
    let tile: { bitmap: TerrainBitmap; centerX: number; centerZ: number } | null = null;
    let tileGen: ReturnType<typeof renderLocalTile> | null = null;
    let tileCenter = { x: 0, z: 0 };
    let tileGenUrgent = false;

    const stepGenerators = () => {
      if (!full) {
        const r = fullGen.next();
        if (r.done) full = r.value;
      }
      const f = ctx.player.feet;
      const plan = minimapTilePlan(tile, f.x, f.z);
      // A build begun far from where the player now is would land off-centre: drop it and start from here.
      if (plan === 'urgent' && tileGen && (!tileGenUrgent || Math.hypot(f.x - tileCenter.x, f.z - tileCenter.z) > MAP_TUNING.minimapRefreshDistance)) tileGen = null;
      if (!tileGen && plan !== 'ok') {
        tileCenter = { x: f.x, z: f.z };
        tileGenUrgent = plan === 'urgent';
        tileGen = renderLocalTile(heightAt, f.x, f.z, plan === 'urgent' ? { budgetMs: MAP_TUNING.minimapUrgentSliceBudgetMs } : {});
      }
      if (tileGen) {
        const r = tileGen.next();
        if (r.done) {
          tile = { bitmap: r.value, centerX: tileCenter.x, centerZ: tileCenter.z };
          tileGen = null;
        }
      }
    };

    // Region chips follow containment.openRegions(), polled where the views redraw (no new events). The array is reused
    // while the open set is unchanged.
    let chips: RegionChip[] = regionChips([]);

    const openNow = () => ctx.services.get('containment')?.openRegions() ?? [];
    let openSig = '';
    const currentChips = (): RegionChip[] => {
      const open = openNow();
      const sig = open.join(',');
      if (sig !== openSig) {
        openSig = sig;
        chips = regionChips(open);

      }
      return chips;
    };

    const model: MapViewModel = {
      bounds,
      fullBitmap: () => full,
      minimapTile: () => tile,
      fog: () => fog,
      markers: (): MapMarker[] =>
        buildMarkers({
          waystones: (waystones()?.ids() ?? []).flatMap((id) => {
            const p = waystones()?.position(id);
            if (!p) return [];
            const lit = waystones()?.isLit(id) ?? false;
            return [{ id, x: p.x, z: p.z, state: lit ? ('rekindled' as const) : ('dormant' as const), discovered: lit || fog.isRevealed(p.x, p.z), label: id }];
          }),
          shrines: sources.litShrines(),
          poi: [...sources.posts((x, z) => fog.isRevealed(x, z)), ...sources.a2Pois()],
          fog: sources.fogWall(),
          quest: withTutorialLead([...currentLeads(), ...objectiveLeads()], ctx.services.get('tutorial')),
        }),
      regions: currentChips,
      regionCaption: () => {
        const id = openRegionAt(ctx.player.feet.x, ctx.player.feet.z, openNow());
        return id ? ctx.strings.t(`map.region.${id}`) : null;
      },
      forge: () => sources.forge(),
      legend: () => sources.legend(ctx.player.feet.x, ctx.player.feet.z),
      player: () => ({ x: ctx.player.feet.x, z: ctx.player.feet.z, yaw: ctx.player.facingYaw }),
      travelBlockedReason: () => waystones()?.travelBlockedReason() ?? 'busy',
      travel: (id) => void waystones()?.travel(id),
      t: (k, p) => ctx.strings.t(k, p),
    };

    let closeModal: (() => void) | null = null;
    ctx.systems.add({
      id: 'map.input',
      fixedPhase: 'input',
      order: 0,
      fixedUpdate() {
        if (typeof document === 'undefined') return;
        if (ctx.hud.modalOpen === 'map.modal' && (ctx.input.actions.pressed('map') || ctx.input.actions.pressed('menu'))) {
          closeModal?.();
          return;
        }
        if (!ctx.input.actions.pressed('map') || ctx.input.contexts.top() !== 'gameplay' || ctx.hud.modalOpen) return;
        const widget = createMapModal({ model, close: () => closeModal?.() });
        closeModal = ctx.hud.openModal(widget);
        if (closeModal) {
          widget.focusDefault();
          ctx.services.get('prompts')?.success('map');
        }
      },
    });

    let sinceReveal = 0;
    ctx.systems.add({
      id: 'map.fog',
      fixedPhase: 'late',
      order: 50,
      fixedUpdate(dt) {
        sinceReveal += dt;
        if (sinceReveal < 1 / MAP_TUNING.fogRevealHz) return;
        sinceReveal = 0;
        const f = ctx.player.feet;
        fog.reveal(f.x, f.z, MAP_TUNING.revealRadius);
      },
    });

    ctx.systems.add({
      id: 'map.bitmaps',
      renderPhase: 'hud',
      order: 100,
      render: stepGenerators,
    });

    if (typeof document !== 'undefined') {
      ctx.hud.mount('top-right', createMinimap({ model }));
    }
  },
};

export default map;
