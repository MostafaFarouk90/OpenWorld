import * as THREE from 'three';
import type { GamePlugin } from '../../core/plugins';
import { heightAt } from '../../terrain/heightfield';
import { buildCairn, disposeCairn } from '../golem/GolemBody';
import { GOLEM } from '../golem/params';
import { CrawlerBody } from '../crawler/CrawlerBody';
import { FOX } from '../fox/tuning';
import { QuadrupedBody } from '../quadruped/QuadrupedBody';
import { SHEEP } from '../quadruped/params';
import type { SheepView } from '../sheep/Herd';
import { CODEX_SIGHT, GROUND_CODEX, GROUND_CODEX_KINDS } from './codex';
import { createCooling } from './cooling';
import './events';
import { createFoxService } from './foxService';
import { createHerdService } from './herdService';
import { SettledForms, type SettledKind } from './settled';
import { GROUND_STRINGS_EN } from './strings.en';
import { DRAUGHT, DraughtThrow, type LandResult } from './throw';

const SETTLE_KINDS: readonly string[] = ['cinder-golem', 'slag-crawler'];
const HUNTERS = ['hunter-spearman', 'hunter-harpooner'] as const;
const GROUND_ORDER = 40;
const CODEX_PERIOD = 0.5;

type Hunter = (typeof HUNTERS)[number];

/**
 * A6b's ground enemies on the shared enemy manager: the `cooling`, `foxes` and `herd` services, the thrown Cooling Draught, the
 * golem's cairn and the crawler's curled form (persisted as `enemies.ground`), the hunters' `hunter.spared` witness event and the
 * bestiary entries. The enemies themselves live in `enemies/`.
 */
const plugin: GamePlugin = {
  id: 'enemies.ground',
  dependsOn: ['enemies'],
  setup(ctx) {
    const svc = ctx.services as unknown as { get(name: string): any };
    const enemies = ctx.services.get('enemies');
    if (!enemies) return;
    const g = enemies.ground;
    const offs: Array<() => void> = [];

    ctx.strings.register('en', GROUND_STRINGS_EN);

    // ---- cooling
    const cooling = createCooling({
      get: (id) => g.get(id),
      all: () => g.all(),
      emit: (kind, actorId) => ctx.events.emit('cooling.hit', { actorId, kind }),
    });
    ctx.services.provide('cooling', cooling);

    // ---- foxes
    const foxes = createFoxService({
      foxes: () => g.all().filter((e) => e.def.kind === 'kindling-fox' && e.fox),
      anchor: (id) => ctx.anchors.find(id)?.position,
      arrived: (foxId, stop) => ctx.events.emit('fox.arrived', { foxId, stop }),
    });
    ctx.services.provide('foxes', foxes);
    const fedKey = (spawnerId: string): string => `fox.fed.${spawnerId}`;
    const foxFeed = {
      id: 'use:fox-feed',
      kind: 'release' as const,
      action: 'interact' as const,
      radius: FOX.feedRadius,
      coneDegrees: 360,
      holdSeconds: FOX.feedHoldSeconds,
      promptKey: 'enemies.feed.fox',
      name: 'Kindling Fox',
      target: null as ReturnType<typeof g.all>[number] | null,
      position(out: THREE.Vector3) {
        return this.target ? out.copy(this.target.feet) : out.set(0, -1e4, 0);
      },
      enabled() {
        const f = ctx.player.feet;
        let best: typeof this.target = null;
        let bestD = FOX.feedRadius + 1;
        for (const e of g.all()) {
          if (e.def.kind !== 'kindling-fox' || !e.active || !e.fox || e.fox.state === 'leading' || !e.spawnerId) continue;
          if (ctx.state.getBool(fedKey(e.spawnerId), false)) continue;
          const d = Math.hypot(e.feet.x - f.x, e.feet.z - f.z);
          if (d < bestD) {
            best = e;
            bestD = d;
          }
        }
        this.target = best;
        return best !== null && (svc.get('inventory')?.count(FOX.foodItem) ?? 0) > 0;
      },
      onInteract() {
        const fox = this.target;
        const inv = svc.get('inventory');
        if (!fox?.spawnerId || !fox.fox || !inv?.remove(FOX.foodItem, 1)) return;
        const cache = ctx.anchors.find(FOX.cacheAnchor);
        if (!cache) return;
        ctx.state.setFlag(fedKey(fox.spawnerId), true);
        fox.fox.lead([{ x: cache.position.x, z: cache.position.z }], { done: () => ctx.events.emit('fox.cache', { foxId: fox.id }) });
      },
    };
    offs.push(ctx.interaction.register(foxFeed as never));

    // ---- herd
    const sheepViews = new Set<QuadrupedBody>();
    const herdSvc = createHerdService({
      anchor: (id) => ctx.anchors.find(id)?.position,
      joined: (herdId, n) => ctx.events.emit('herd.joined', { herdId, n }),
      scattered: (herdId, n) => ctx.events.emit('herd.scattered', { herdId, n }),
      env: () => ({
        player: () => ctx.player.feet,
        rng: () => Math.random(),
        makeView: (): SheepView => {
          const body = new QuadrupedBody(SHEEP);
          sheepViews.add(body);
          ctx.scene.add(body.root);
          body.play('Idle');
          return {
            place: (x, z, yaw) => {
              body.root.position.set(x, heightAt(x, z), z);
              body.root.rotation.y = yaw;
            },
            setSpeed: (mps) => body.setSpeed(mps),
            update: (dt) => body.fixedUpdate(dt),
            dispose: () => {
              ctx.scene.remove(body.root);
              body.dispose();
              sheepViews.delete(body);
            },
          };
        },
      }),
    });
    ctx.services.provide('herd', herdSvc);

    // ---- settled forms (cairn, curled crawler)
    const settled = new SettledForms(ctx.scene, {
      build: (kind) => (kind === 'cinder-golem' ? buildCairn(GOLEM) : CrawlerBody.buildCurled()),
      free: (kind, o) => (kind === 'cinder-golem' ? disposeCairn(o) : CrawlerBody.disposeProp(o)),
    });
    ctx.persist.register({ key: 'enemies.ground', version: 1, serialize: () => settled.serialize(), load: (d) => settled.load(d) });

    // ---- hunter.spared and settling, from the shared `mercy` event
    const sparedSeen = new Set<string>();
    offs.push(
      ctx.events.on('mercy', (ev) => {
        if (!ev.actorId) return;
        if (ev.verb === 'spare' && (HUNTERS as readonly string[]).includes(ev.creature) && !sparedSeen.has(ev.actorId)) {
          sparedSeen.add(ev.actorId);
          ctx.events.emit('hunter.spared', { actorId: ev.actorId, kind: ev.creature as Hunter });
        }
        if (ev.verb === 'calm' && SETTLE_KINDS.includes(ev.creature)) {
          const e = g.get(ev.actorId);
          if (e) settled.add({ kind: ev.creature as SettledKind, x: e.feet.x, y: e.feet.y, z: e.feet.z, yaw: e.facing });
        }
      }),
    );
    offs.push(ctx.events.on('save.loaded', () => sparedSeen.clear()));

    // ---- the Cooling Draught
    let flask: THREE.Mesh | null = null;
    const flaskAt = (p: { x: number; y: number; z: number } | null): void => {
      if (!p) {
        if (flask) ctx.scene.remove(flask);
        return;
      }
      if (!flask) {
        flask = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8fd6ff }));
      }
      if (!flask.parent) ctx.scene.add(flask);
      flask.position.set(p.x, p.y, p.z);
    };
    const thrower = new DraughtThrow({
      unlocked: () => enemies.mercyUnlocked('calm'),
      count: () => svc.get('inventory')?.count(DRAUGHT.itemId) ?? 0,
      consume: () => svc.get('inventory')?.remove(DRAUGHT.itemId, 1) === true,
      targets: () => g.all().filter((e) => e.def.kind === 'slag-crawler' && e.active && !e.inMercyExit),
      origin: (out) => {
        const f = ctx.player.feet;
        out.x = f.x;
        out.y = f.y + 1.4;
        out.z = f.z;
        return out;
      },
      fly: flaskAt,
      land: (_at, within): LandResult => {
        for (const t of within) if (g.calmByThrow(t.id)) return 'calmed';
        for (const t of within) if (cooling.hit(t.id, ctx.player.actor.id, 'draught')) return 'cooled';
        return 'miss';
      },
    });
    const throwItem = {
      id: 'use:cooling-draught',
      kind: 'release' as const,
      action: 'interact' as const,
      radius: DRAUGHT.range,
      coneDegrees: 360,
      promptKey: 'enemies.throw.draught',
      name: 'Cooling Draught',
      position(out: THREE.Vector3) {
        const t = thrower.pick(ctx.player.feet);
        return t ? out.set(t.feet.x, t.feet.y, t.feet.z) : out.set(0, -1e4, 0);
      },
      enabled: () => thrower.can(ctx.player.feet),
      onInteract: () => void thrower.start(ctx.player.feet),
    };
    offs.push(ctx.interaction.register(throwItem as never));

    // ---- codex
    const codex = svc.get('codex');
    if (codex?.register) offs.push(codex.register(GROUND_CODEX));
    let codexClock = 0;

    offs.push(
      ctx.systems.add({
        id: 'enemies.ground',
        fixedPhase: 'afterCombat',
        order: GROUND_ORDER,
        fixedUpdate(dt) {
          thrower.update(dt);
          herdSvc.step(dt);
          codexClock += dt;
          if (codexClock < CODEX_PERIOD) return;
          codexClock = 0;
          const c = svc.get('codex');
          if (!c?.unlock) return;
          const f = ctx.player.feet;
          for (const e of g.all()) {
            if (!(GROUND_CODEX_KINDS as readonly string[]).includes(e.def.kind) || !e.active) continue;
            if (Math.hypot(e.feet.x - f.x, e.feet.z - f.z) <= CODEX_SIGHT) c.unlock(e.def.kind);
          }
        },
      }),
    );
    const clear = (): void => {
      thrower.clear();
      herdSvc.clear();
    };
    offs.push(ctx.events.on('save.loaded', clear));
    offs.push(() => {
      clear();
      settled.clear();
    });
    (plugin as { _offs?: Array<() => void> })._offs = offs;
  },
  dispose() {
    const offs = (plugin as { _offs?: Array<() => void> })._offs;
    for (const off of offs ?? []) off();
    (plugin as { _offs?: Array<() => void> })._offs = undefined;
  },
};

export default plugin;
