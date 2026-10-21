// M12 Cinderford Under Siege and R06 The Cinderford Well.
import type { Kit, Off } from './kit';

export const R06_RITE_GROUPS = ['q12.r06.rite-1', 'q12.r06.rite-2'] as const;

export function installM12(k: Kit): Off[] {
  const { ctx } = k;
  // Prep done: the raid starts, once. A7 persists the set, parks it when the player is away and restarts a failed wave
  // itself, so nothing here runs on a load.
  k.on('quest.objective', (e) => {
    if (e.questId !== 'm12' || e.objectiveId !== 'prep' || !e.done) return;
    k.later(() => {
      if (!ctx.services.get('waves')?.start('cinderford-raid')) k.warn('M12: the Cinderford raid did not start (already running or done)');
    });
  });
  return [];
}

export function installR06(k: Kit): Off[] {
  const { ctx } = k;
  const offs: Off[] = [];

  // Emberwright mirror: the quest's fire branch reads it as a flag.
  const syncClass = (): void => {
    const cls = ctx.services.get('classes')?.current();
    if (cls !== undefined) k.set('story.r06.emberwright', cls === 'emberwright');
  };
  syncClass();
  k.on('class.chosen', syncClass);
  k.on('class.changed', syncClass);
  k.on('save.loaded', syncClass);

  // Pennard's rite: two waves of ash-wraiths from the well, the second after the first is down.
  const spawnWave = (n: 1 | 2): void => void ctx.services.get('enemies')?.spawnGroup(R06_RITE_GROUPS[n - 1]);
  const riteLive = (): boolean => k.active('r06') && k.flag('story.r06.riteStarted') && !k.flag('story.r06.riteFinished');
  k.onNamed('story.r06.riteStart', () => {
    if (!k.active('r06') || k.num('story.r06.riteWave') > 0) return;
    k.set('story.r06.riteWave', 1);
    k.later(() => spawnWave(1));
  });
  k.on('actor.died', (e) => {
    if (e.spawnTag !== 'r06.rite' || !riteLive()) return;
    k.later(() => {
      const en = ctx.services.get('enemies');
      if (!en) return;
      const wave = k.num('story.r06.riteWave');
      if (en.alive(R06_RITE_GROUPS[wave - 1] ?? '').length > 0) return;
      if (wave === 1) {
        k.set('story.r06.riteWave', 2);
        spawnWave(2);
      } else if (wave === 2) {
        k.set('story.r06.riteFinished');
        k.clear('story.r06.riteStarted');
        k.emit('story.r06.riteDone');
      }
    });
  });
  // A load rebuilds the rite wave the player was in (the groups are ephemeral and the wave counter is saved).
  k.on('save.loaded', () => {
    if (!riteLive()) return;
    const wave = k.num('story.r06.riteWave');
    if (wave === 1 || wave === 2) k.later(() => spawnWave(wave));
  });

  // The choice flag is written last, when the quest completes: A3 hides the cast and boards the well on `sealed`.
  k.on('quest.completed', (e) => {
    if (e.questId !== 'r06') return;
    k.set('story.r06.choice', k.str('story.r06.branch') === 'seal' ? 'sealed' : 'cleansed');
    for (const g of R06_RITE_GROUPS) ctx.services.get('enemies')?.despawnGroup(g);
  });
  return offs;
}
