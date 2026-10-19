// `?act1=<quest>&new`: dev and smoke jumps to the start of an Act 1 quest (ids and rules in act1Jump.ts).
// Compiled out of production builds (import.meta.env.DEV).
import type { GamePlugin } from '../core/plugins';
import { createEffectRunner } from './effects';
import { Act1Jump, GIVER_STAND_OFF, parseAct1 } from './act1Jump';
import { POST_RULES, resolvePosts } from './posts';
import type { BusPort } from './ports';
import type { TutorialDirector } from '../tutorial/TutorialDirector';

const TELEPORT_TRIES = 30;

const plugin: GamePlugin = {
  id: 'act1-jump',
  dependsOn: ['core', 'quests', 'save', 'waystones'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const search = typeof location !== 'undefined' ? location.search : '';
    const parsed = parseAct1(search);
    if (!parsed) return;
    if ('error' in parsed) {
      console.warn(`[act1] jump refused: ${parsed.error}`);
      return;
    }
    const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
    const save = ctx.services.get('save');
    // Held for the session: a jumped game is never saved over the player's real save.
    // Never released: releasing would run the save deferred under the hold. The save plugin's dispose clears its
    // holds without saving.
    save?.suspend('act1-jump');
    const quests = ctx.services.require('quests');
    const runner = createEffectRunner({
      state: ctx.state, quests: quests as never, bus: ctx.events as unknown as BusPort, sourceId: 'act1-jump',
      progression: () => svc('progression'), inventory: () => svc('inventory'), npcs: () => svc('npcs'), enemies: () => svc('enemies'),
      warn: (m) => console.warn(`[act1] ${m}`),
    });
    let teleport: 'idle' | 'pending' | 'ok' = 'idle';
    let teleportTries = 0;
    // One safe teleport in flight at a time; a refused one (busy, terrain loading) is retried on a later tick, and
    // after TELEPORT_TRIES refusals the player is placed directly, as the tutorial's restart does.
    const place = (pos: { x: number; y: number; z: number }, yaw: number): boolean => {
      if (teleport === 'ok') return true;
      if (teleport === 'pending') return false;
      const ws = ctx.services.get('waystones');
      if (!ws || ++teleportTries > TELEPORT_TRIES) {
        ctx.player.teleport(pos, yaw);
        if (ctx.cameraRig) ctx.cameraRig.yaw = yaw;
        return true;
      }
      teleport = 'pending';
      void ws.safeTeleport(pos, yaw).then(
        (o) => { teleport = o.ok ? 'ok' : 'idle'; },
        () => { teleport = 'idle'; },
      );
      return false;
    };
    /** The NPC's post now: the quest post rules, else its layout post. */
    const postOf = (npcId: string): string => {
      const posts = resolvePosts(POST_RULES, { state: ctx.state, quests: quests as never });
      return posts[npcId]?.anchorId ?? `npc-post.${npcId}`;
    };
    const jump = new Act1Jump(parsed.id, {
      tutorial: () => (globalThis as { __tutorial?: TutorialDirector }).__tutorial,
      quests,
      runEffects: (effects) => {
        for (const r of runner.run(effects)) if (!r.ok) console.warn(`[act1] effect failed: ${r.error ?? ''}`);
      },
      setFlag: (flag, value) => ctx.state.setFlag(flag, value),
      rekindle: (id) => void svc('waystones')?.rekindle(id, 'script'),
      giveGold: (amount) => {
        for (const r of runner.run([{ giveGold: amount }])) if (!r.ok) console.warn(`[act1] gold grant failed: ${r.error ?? ''}`);
      },
      chooseClass: (id) => {
        const classes = svc('classes');
        if (!classes) return false;
        const r = classes.choose(id);
        if (!r.ok) return false;
        classes.skipDrill?.();
        return true;
      },
      teleportTo: (anchorId) => {
        const a = ctx.anchors.find(anchorId);
        if (!a) {
          console.warn(`[act1] anchor ${anchorId} missing; staying put`);
          return true;
        }
        return place(a.position, a.yaw);
      },
      standBy: (npcId) => {
        const anchorId = postOf(npcId);
        const a = ctx.anchors.find(anchorId);
        if (!a) {
          console.warn(`[act1] post ${anchorId} of ${npcId} missing; staying put`);
          return true;
        }
        // Yaw 0 faces -Z (NpcBehavior): stand in front of the giver, turned to face them.
        const fx = -Math.sin(a.yaw);
        const fz = -Math.cos(a.yaw);
        const pos = { x: a.position.x + fx * GIVER_STAND_OFF, y: a.position.y, z: a.position.z + fz * GIVER_STAND_OFF };
        return place(pos, a.yaw + Math.PI);
      },
      ready: () => !save || !save.loading,
      warn: (m) => console.warn(`[act1] ${m}`),
    });
    (globalThis as { __act1?: Act1Jump }).__act1 = jump;
    ctx.systems.add({
      id: 'act1-jump',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => jump.tick(),
    });
  },
  dispose() {
    delete (globalThis as { __act1?: unknown }).__act1;
  },
};

export default plugin;
