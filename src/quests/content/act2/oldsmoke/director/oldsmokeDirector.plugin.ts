import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Kit, type Off } from '../../director/kit';
import { OLDSMOKE_TRIGGERS } from '../triggers';
import { OLDSMOKE_QUEST_IDS } from '../index';
import { M16_BRAZIER, M16_BRAZIER_ID } from '../m16.quest';
import { M22_BANNER } from '../m22.quest';

let offs: Off[] = [];

/** M16's scripted rekindle: the brazier is not a waystone anchor, so lighting it raises the same event a rekindled stone does (the 10 Burn, the toast, the music). */
export function installM16(k: Kit): void {
  k.on('interact', (e) => {
    if (e.action === 'mercy' || e.interactableId !== M16_BRAZIER || !k.active('m16')) return;
    k.ctx.events.emit('waystone.rekindled', { waystoneId: M16_BRAZIER_ID, cause: 'player' });
  });
}

/**
 * M22: the Council meets when Cael is in the Keep hall with the council objective open; the banner raised starts its
 * two-line scene. Both retry every half second until the dialogue opens (another modal may hold it for a tick), and the
 * council also starts when the objective opens with Cael already standing in the hall.
 */
export function installM22(k: Kit): void {
  const { ctx } = k;
  let inKeep = false;
  let bannerPending = false;
  const dialogueFree = (): boolean => !ctx.services.get('dialogue')?.active;
  k.on('trigger.enter', (e) => { if (e.actorId === 'player' && e.triggerId === 'trg.harrowmark.keep-hall') inKeep = true; });
  k.on('trigger.exit', (e) => { if (e.actorId === 'player' && e.triggerId === 'trg.harrowmark.keep-hall') inKeep = false; });
  k.on('interact', (e) => {
    if (e.action === 'mercy' || e.interactableId !== M22_BANNER || !k.active('m22')) return;
    bannerPending = true;
  });
  k.every(30, () => {
    if (!k.active('m22') || !dialogueFree()) return;
    if (bannerPending && k.objCurrent('m22', 'raised')) {
      if (ctx.services.get('dialogue')?.start('scene-m22-banner', 'wystan')) bannerPending = false;
    } else if (inKeep && k.objCurrent('m22', 'council')) {
      ctx.services.get('dialogue')?.start('scene-m22-council', 'wystan');
    }
  });
}

/**
 * Oldsmoke quest director (plans/act2-A13.md): the rules that cannot live in a quest def or the dialogue. It writes
 * `story.<id>.complete` for the Phase D quests and keeps it in step on a load. Choices, favour and the persuasion flags
 * are dialogue effects (the Act 1 pattern); A4 reads `story.r10.choice`, `story.m21.choice` and `story.m21.persuaded`.
 */
const plugin: GamePlugin = {
  id: 'oldsmoke-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'oldsmoke'],
  setup(ctx) {
    offs = [];
    const warn = (m: string): void => void console.warn(m);
    const { kit, tick } = makeKit(ctx, warn, offs);

    for (const t of OLDSMOKE_TRIGGERS) {
      const at = ctx.anchors.find(t.anchorId);
      if (!at) { warn(`[oldsmoke-quests] trigger ${t.id}: no anchor ${t.anchorId}`); continue; }
      offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
    }

    installM16(kit);
    installM22(kit);

    const syncComplete = (): void => {
      for (const id of OLDSMOKE_QUEST_IDS) if (kit.qstate(id) === 'completed') kit.set(`story.${id}.complete`);
    };
    kit.on('quest.completed', (e) => {
      if (OLDSMOKE_QUEST_IDS.includes(e.questId)) kit.set(`story.${e.questId}.complete`);
    });
    kit.on('save.loaded', syncComplete);

    offs.push(ctx.systems.add({ id: 'oldsmoke-quests.tick', fixedPhase: 'rules', order: 10, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
