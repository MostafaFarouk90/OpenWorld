// `?act2=<quest>&new`: dev and smoke jumps to the giver of a Phase C quest (ids and rules in act2Jump.ts); the Act 1 prerequisites
// are replayed with the Act 1 ending silenced. Optional `&class=<id>` picks the M07 class (R06 differs for the Emberwright).
// Compiled out of production builds (import.meta.env.DEV).
import type { GamePlugin } from '../core/plugins';
import { createEffectRunner } from './effects';
import { ACT2_GIVER_STAND_OFF, Act2Jump, parseAct2 } from './act2Jump';
import { POST_RULES, resolvePosts } from './posts';
import type { BusPort } from './ports';
import type { TutorialDirector } from '../tutorial/TutorialDirector';
import '../region/containment';
import { heightAt } from '../terrain/heightfield';

const TELEPORT_TRIES = 30;

const plugin: GamePlugin = {
  id: 'act2-jump',
  dependsOn: ['core', 'quests', 'save', 'waystones'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const search = typeof location !== 'undefined' ? location.search : '';
    const parsed = parseAct2(search);
    if (!parsed) return;
    if ('error' in parsed) {
      console.warn(`[act2] jump refused: ${parsed.error}`);
      return;
    }
    const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
    const save = ctx.services.get('save');
    // Held for the session: a jumped game is never saved over the player's real save.
    // Never released: releasing would run the save deferred under the hold. The save plugin's dispose clears its
    // holds without saving.
    save?.suspend('act2-jump');
    const quests = ctx.services.require('quests');
    const runner = createEffectRunner({
      state: ctx.state, quests: quests as never, bus: ctx.events as unknown as BusPort, sourceId: 'act2-jump',
      progression: () => svc('progression'), inventory: () => svc('inventory'), npcs: () => svc('npcs'), enemies: () => svc('enemies'),
      warn: (m) => console.warn(`[act2] ${m}`),
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
        // safeTeleport contains its target itself (v0.6); the direct placement goes through the same clamp.
        const at = ctx.services.get('containment')?.clamp(pos) ?? pos;
        ctx.player.teleport(at === pos ? pos : { ...at, y: heightAt(at.x, at.z) + 0.05 }, yaw);
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
    const jump = new Act2Jump(parsed.id, {
      tutorial: () => (globalThis as { __tutorial?: TutorialDirector }).__tutorial,
      quests,
      runEffects: (effects) => {
        for (const r of runner.run(effects)) if (!r.ok) console.warn(`[act2] effect failed: ${r.error ?? ''}`);
      },
      setFlag: (flag, value) => ctx.state.setFlag(flag, value),
      rekindle: (id) => void svc('waystones')?.rekindle(id, 'script'),
      giveGold: (amount) => {
        for (const r of runner.run([{ giveGold: amount }])) if (!r.ok) console.warn(`[act2] gold grant failed: ${r.error ?? ''}`);
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
          console.warn(`[act2] anchor ${anchorId} missing; staying put`);
          return true;
        }
        return place(a.position, a.yaw);
      },
      standBy: (npcId) => {
        const a = ctx.anchors.find(postOf(npcId));
        if (!a) {
          // An NPC no post rule moves (Maud, Hrolf) stands at its layout post: stand south of where the world put it.
          const at = svc('npcs')?.position(npcId) as { x: number; y: number; z: number } | undefined;
          if (!at) {
            console.warn(`[act2] giver ${npcId} has no post and no position; staying put`);
            return true;
          }
          return place({ x: at.x, y: at.y, z: at.z + ACT2_GIVER_STAND_OFF }, 0);
        }
        // Yaw 0 faces -Z (NpcBehavior): stand in front of the giver, turned to face them.
        const fx = -Math.sin(a.yaw);
        const fz = -Math.cos(a.yaw);
        const pos = { x: a.position.x + fx * ACT2_GIVER_STAND_OFF, y: a.position.y, z: a.position.z + fz * ACT2_GIVER_STAND_OFF };
        return place(pos, a.yaw + Math.PI);
      },
      hasQuest: (id) => quests.objectives(id).length > 0,
      closeDialogue: () => {
        const d = ctx.services.get('dialogue');
        if (!d?.active) return false;
        d.close();
        return true;
      },
      ready: () => !save || !save.loading,
      warn: (m) => console.warn(`[act2] ${m}`),
    }, parsed.classId); // `&class=<id>` (review-b L1: it was parsed and then dropped, so every jump played the Knight)
    (globalThis as { __act2?: Act2Jump }).__act2 = jump;
    ctx.systems.add({
      id: 'act2-jump',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => jump.tick(),
    });
  },
  dispose() {
    delete (globalThis as { __act2?: unknown }).__act2;
  },
};

export default plugin;
