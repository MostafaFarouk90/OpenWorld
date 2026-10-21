// D03 The Fall of Scorchhold: the outcome of Redmane's fight, the prisoners, the testimony host. The gate (A3's shut-gate toggle
// on `story.d03.gateDown`), the courtyard, the keep door and A8's arena run off flags the quest's own objectives write.
import type { Kit, Off } from './kit';

const BOSS = 'thrandil-redmane';
/** A8's outcome flag; 'spared' or 'defeated'. */
const A8_OUTCOME = `boss.${BOSS}.outcome`;

export function installD03(k: Kit): Off[] {
  const { ctx } = k;
  // The quest's own copy of the outcome, plus Redmane standing by Osgar's post when he was spared. No favour here: the
  // Spare hold already paid Oswin through BOSS_MERCY.
  const record = (outcome: 'spared' | 'defeated'): void => {
    if (k.str('story.d03.outcome')) return;
    k.set('story.d03.outcome', outcome);
    if (outcome === 'spared') k.set('story.d03.redmaneHeld');
  };
  k.on('boss.defeated', (e) => {
    if (e.bossId === BOSS) record('defeated');
  });
  k.on('boss.spared', (e) => {
    if (e.bossId === BOSS) record('spared');
  });
  // A freed prisoner has a word for the one who opened the cage.
  k.on('interact', (e) => {
    if (e.action !== 'mercy' && e.interactableId.startsWith('use:d03-prisoner-') && k.active('d03')) {
      k.later(() => void ctx.services.get('dialogue')?.start('scene-d03-prisoner', 'prisoner'));
    }
  });
  // A load (or a boss that ended before this listener existed) keeps A8's flag and ours in step.
  const sync = (): void => {
    const o = ctx.state.getString(A8_OUTCOME);
    if (o === 'spared' || o === 'defeated') record(o);
  };
  sync();
  k.on('save.loaded', sync);
  return [];
}
