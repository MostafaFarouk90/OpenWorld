// M14 Hushed Anvil Rites (the murals, the Anvil's song) and M15 The Hunters' Pens (witnesses, the cage, the first flight).
import type { Kit, Off } from './kit';

const KEEPER = 'npc-lantern-keeper';
const CAGE_GROUP = 'q12.m15.cage';

export function installM14(k: Kit): Off[] {
  const { ctx } = k;
  const keeperSpeaks = (): void => void ctx.services.get('dialogue')?.start(KEEPER, 'lantern-keeper');

  // Each mural read raises its own reflection; the keeper tree reads `story.m14.mural` and clears it on its last line.
  k.on('interact', (e) => {
    const m = /^use:hushed-anvil-mural-(\d)$/.exec(e.interactableId);
    if (!m || e.action === 'mercy' || !k.active('m14')) return;
    k.set('story.m14.mural', Number(m[1]));
    k.later(keeperSpeaks);
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

  // Hunters left alive and unhurt carry the story south: one witness per distinct hunter.
  k.on('hunter.spared', (e) => {
    if (seen.has(e.actorId)) return;
    seen.add(e.actorId);
    k.set('story.a2.witnesses', k.num('story.a2.witnesses') + 1);
  });

  // The caged wyrmling is chained at the pen from the quest's start.
  ctx.services.get('wyrms')?.tether(CAGE_GROUP, [{ anchor: 'cinderreach.m15.cage' }]);

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
      ctx.services.get('wyrms')?.flyAway(e.actorId);
      flight();
    });
  });
  k.on('save.loaded', () => {
    if (k.active('m15') && k.flag('story.m15.cageOpen') && !k.flag('story.m15.flown')) k.later(flight);
  });
  return [];
}
