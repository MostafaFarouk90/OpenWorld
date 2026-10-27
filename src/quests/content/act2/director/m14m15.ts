// M14 Hushed Anvil Rites (the murals, the Anvil's song) and M15 The Hunters' Pens (witnesses, the cage, the first flight).
import type { Kit, Off } from './kit';

const KEEPER = 'npc-lantern-keeper';
/**
 * The npc id the mural reflections run under: they are Cael's own lines from the keeper's tree, and run as the keeper they
 * would end with a completed `dialogue.ended` for `lantern-keeper` and take the `keeper` talk credit (review-a #6).
 */
export const MURAL_NPC = 'hushed-anvil-mural';
/** Tempers M14's `temper` objective asks for (m14.quest.ts `required`). */
const TEMPERS_NEEDED = 2;
const CAGE_GROUP = 'q12.m15.cage';

export function installM14(k: Kit): Off[] {
  const { ctx } = k;
  const keeperSpeaks = (): void => void ctx.services.get('dialogue')?.start(KEEPER, 'lantern-keeper');

  // Each mural read raises its own reflection; the keeper tree reads `story.m14.mural` and clears it on its last line.
  k.on('interact', (e) => {
    const m = /^use:hushed-anvil-mural-(\d)$/.exec(e.interactableId);
    if (!m || e.action === 'mercy' || !k.active('m14')) return;
    k.set('story.m14.mural', Number(m[1]));
    k.later(() => void ctx.services.get('dialogue')?.start(KEEPER, MURAL_NPC));
  });

  // Tempers count from the quest's start, not from when the `temper` objective opens: the Anvil is usable as soon as M14 is
  // active, and an event before the objective is current is lost. The count and its flag are saved; the objective reads the
  // flag as its `doneWhen`, and the quests are asked to read it at once (a recheck, next tick: not from inside a flush).
  k.on('gear.tempered', () => {
    if (!k.active('m14') || k.flag('story.m14.tempered')) return;
    const n = k.num('story.m14.tempers') + 1;
    k.set('story.m14.tempers', n);
    if (n < TEMPERS_NEEDED) return;
    k.set('story.m14.tempered');
    k.later(() => ctx.services.get('quests')?.recheck?.());
  });

  // The second tempering lit, the Anvil sings: a hold the keeper speaks through, then the beat is set.
  k.on('quest.objective', (e) => {
    if (e.questId !== 'm14' || e.objectiveId !== 'temper' || !e.done) return;
    k.set('story.m14.singsHold');
    k.set('story.m14.singsPending');
    k.later(keeperSpeaks);
  });
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId !== KEEPER || !k.flag('story.m14.singsPending')) return;
    if (!k.flag('story.m14.singsHold')) {
      k.clear('story.m14.singsPending');
      k.emit('story.m14.set');
    } else if (e.reason !== 'completed') k.later(keeperSpeaks);
  });
  k.on('save.loaded', () => {
    if (k.active('m14') && k.flag('story.m14.singsPending') && !k.flag('story.m14.singsHold')) {
      k.clear('story.m14.singsPending');
      k.emit('story.m14.set');
    }
  });
  return [];
}

export function installM15(k: Kit): Off[] {
  const { ctx } = k;
  const seen = new Set<string>();

  // Hunters left alive and unhurt carry the story south: one witness per distinct hunter. The dedupe lives only in this
  // session: a load restores the count and brings the hunters back under the same ids, so it starts over (review-a #7).
  k.on('save.loaded', () => seen.clear());
  k.on('hunter.spared', (e) => {
    if (seen.has(e.actorId)) return;
    seen.add(e.actorId);
    k.set('story.a2.witnesses', k.num('story.a2.witnesses') + 1);
  });
  // A spare the player took back (struck the hunter before he walked off) is no witness, and the hunter may be spared again.
  k.on('mercy.revoked', (e) => {
    if (!seen.delete(e.actorId)) return;
    k.set('story.a2.witnesses', Math.max(0, k.num('story.a2.witnesses') - 1));
  });

  // The caged wyrmling is chained at the pen from the quest's start.
  // The remover is returned so a dispose takes the chain down with the director (review R1-4).
  const untether = ctx.services.get('wyrms')?.tether(CAGE_GROUP, [{ anchor: 'cinderreach.m15.cage' }]);

  // The cage opened: the chain falls, the wyrmling stretches, then it flies and the first flight is set.
  const flight = (): void => {
    k.set('story.m15.flown');
    k.emit('story.m15.set');
  };
  k.on('interact', (e) => {
    if (e.interactableId !== 'use:m15-cage' || e.action === 'mercy' || !k.active('m15')) return;
    k.later(() => {
      const id = ctx.services.get('enemies')?.alive(CAGE_GROUP)[0];
      if (!id || !ctx.services.get('wyrms')?.unchain(id)) {
        k.warn('M15: no caged wyrmling to free; the flight is set anyway');
        return flight();
      }
      k.set('story.m15.unchained');
    });
  });
  k.on('wyrm.unchained', (e) => {
    if (!k.active('m15') || k.flag('story.m15.flown')) return;
    k.after(240, () => {
      // Re-check: the world may have changed under the countdown (review R1-1).
      if (!k.active('m15') || k.flag('story.m15.flown')) return;
      ctx.services.get('wyrms')?.flyAway(e.actorId);
      flight();
    });
  });
  k.on('save.loaded', () => {
    if (k.active('m15') && k.flag('story.m15.cageOpen') && !k.flag('story.m15.flown')) {
      k.later(() => {
        // Recovery releases the caged wyrmling the way the normal path does, or it would stay visible at the pen.
        const id = ctx.services.get('enemies')?.alive(CAGE_GROUP)[0];
        if (id && !ctx.services.get('wyrms')?.flyAway(id)) void ctx.services.get('enemies')?.despawnGroup(CAGE_GROUP);
        flight();
      });
    }
    // The wyrmling flew in the saved world: the quest's start on this load must not stand it at the pen again (review R1-3).
    // Next tick, after the enemies plugin's own load handling has respawned the quest's groups.
    if (k.flag('story.m15.flown')) k.later(() => void ctx.services.get('enemies')?.despawnGroup(CAGE_GROUP));
  });
  return untether ? [untether] : [];
}
