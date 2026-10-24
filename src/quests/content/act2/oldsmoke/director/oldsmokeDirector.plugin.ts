import type { GamePlugin } from '../../../../../core/plugins';
import { makeKit, type Kit, type Off } from '../../director/kit';
import { OLDSMOKE_TRIGGERS } from '../all';
import { installM18, installM19 } from '../mines/m18m19.content';
import { installM20, installD04 } from '../mines/m20d04.content';
import { M17R08_NPC_DEFS, M17R08_NPCS, M17R08_NPC_STRINGS } from '../mines/m17r08.content';
import { M18M19_NPC_DEFS, M18M19_NPCS, M18M19_NPC_STRINGS } from '../mines/m18m19.content';
import { M20D04_NPC_DEFS, M20D04_NPCS, M20D04_NPC_STRINGS } from '../mines/m20d04.content';
import { OLDSMOKE_QUEST_IDS } from '../index';
import { M16_BRAZIER, M16_BRAZIER_ID } from '../m16.quest';
import { KEEP_HALL_ID } from '../../../../../interiors/harrowmark/keepHall';

const KEEP_HALL_TRIGGER = 'trg.harrowmark.keep-hall';

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
 * two-line scene as soon as that objective is current and Cael is in the hall. Both are derived from the quest and the world
 * on every half second (nothing is held in memory, so a save and load between the banner and its scene loses nothing) and
 * retry until the dialogue opens (another modal may hold it for a tick). "In the hall" is the Keep hall interior, not the
 * 3 m strip of the M08 trigger, which a load or a teleport into the hall never enters.
 */
export function installM22(k: Kit): void {
  const { ctx } = k;
  const dialogueFree = (): boolean => !ctx.services.get('dialogue')?.active;
  const inKeep = (): boolean => ctx.services.get('interiors')?.current === KEEP_HALL_ID || ctx.triggers.isInside?.(KEEP_HALL_TRIGGER, 'player') === true;
  k.every(30, () => {
    if (!k.active('m22') || !dialogueFree() || !inKeep()) return;
    if (k.objCurrent('m22', 'raised')) ctx.services.get('dialogue')?.start('scene-m22-banner', 'wystan');
    else if (k.objCurrent('m22', 'council')) ctx.services.get('dialogue')?.start('scene-m22-council', 'wystan');
  });
}

/**
 * M21: the loyalists' fight follows a failed case, but only once the audience is over. The dialogue writes the choice (and
 * `story.m21.persuaded` before it); this writes `story.m21.loyalistsOut`, which the spawner reads, when the `audience` talk is
 * credited, not mid-dialogue: an aborted talk cannot start a fight, and a talk that is repeated cannot start it twice.
 */
export function installM21(k: Kit): void {
  k.on('quest.objective', (e) => {
    if (e.questId !== 'm21' || e.objectiveId !== 'audience' || !e.done) return;
    if (k.str('story.m21.choice') === 'confront' && !k.flag('story.m21.persuaded')) k.set('story.m21.loyalistsOut');
  });
}

/**
 * Oldsmoke quest director (plans/act2-A13.md): the rules that cannot live in a quest def or the dialogue. It writes
 * `story.<id>.complete` for the Phase D quests and keeps it in step on a load. Choices, favour and the persuasion flags
 * are dialogue effects (the Act 1 pattern); A4 reads `story.r10.choice`, `story.m21.choice` and `story.m21.persuaded`.
 */
const plugin: GamePlugin = {
  id: 'oldsmoke-quests',
  dependsOn: ['core', 'quests', 'dialogue', 'enemies', 'oldsmoke', 'npcs', 'wyrms', 'interiors'],
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
    installM21(kit);
    installM18(kit);
    offs.push(installM19(kit));
    offs.push(...installM20(kit), ...installD04(kit));

    // The mine quests' minor cast stands on A4's mine anchors: best effort, like A4's own cast.
    try {
      const npcs = ctx.services.get('npcs');
      if (!npcs) throw new Error('the npcs service is missing');
      offs.push(ctx.strings.register('en', { ...M17R08_NPC_STRINGS, ...M18M19_NPC_STRINGS, ...M20D04_NPC_STRINGS }));
      offs.push(npcs.register([...M17R08_NPCS, ...M18M19_NPCS, ...M20D04_NPCS], [...M17R08_NPC_DEFS, ...M18M19_NPC_DEFS, ...M20D04_NPC_DEFS]));
    } catch (err) {
      warn(`[oldsmoke-quests] could not register the mine cast: ${String(err)}`);
    }

    const syncComplete = (): void => {
      for (const id of OLDSMOKE_QUEST_IDS) if (kit.qstate(id) === 'completed') kit.set(`story.${id}.complete`);
    };
    kit.on('quest.completed', (e) => {
      if (OLDSMOKE_QUEST_IDS.includes(e.questId)) kit.set(`story.${e.questId}.complete`);
    });
    kit.on('save.loaded', syncComplete);

    // R09's `clerk` objective is credited by a `doneWhen` flag (the clerk leaves when R10 ends on the miners' side), which only a
    // recheck reads: credit it at once when `story.r10.choice` is written, not at the next load.
    kit.on('flag.changed', (e) => {
      if (e.key === 'story.r10.choice') ctx.services.get('quests')?.recheck?.();
    });

    offs.push(ctx.systems.add({ id: 'oldsmoke-quests.tick', fixedPhase: 'rules', order: 10, fixedUpdate: () => tick() }));
  },
  dispose() {
    for (const off of offs.splice(0)) off();
  },
};

export default plugin;
