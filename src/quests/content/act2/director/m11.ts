// M11 Road of Cinders: the banner sends the column out along the Cinder Road, Gaut banters at three stages, the ring dismounts,
// the Footmen ambush the stone, the blooms wake the wraiths and the stone's speech closes the ride.
import { M11_STATION_ARC } from '../../../../region/act2/act2World';
import { roadPoint } from '../../../../terrain/shape/roadPoint';
import type { Kit, Off } from './kit';

const ROUTE_STEP = 120;

/** The column's route: the Cinder Road from the River Gate to a little short of the stone's station. */
export function m11Route(y: number): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  for (let s = 0; s < M11_STATION_ARC - 40; s += ROUTE_STEP) {
    const p = roadPoint('cinder-road', s, 0);
    pts.push({ x: p.x, y, z: p.z });
  }
  const end = roadPoint('cinder-road', M11_STATION_ARC - 40, 0);
  pts.push({ x: end.x, y, z: end.z });
  return pts;
}

export function installM11(k: Kit): Off[] {
  const { ctx } = k;
  const offs: Off[] = [];

  const gautSpeaks = (): void => {
    const d = ctx.services.get('dialogue');
    if (!d?.start('npc-gaut', 'gaut')) k.later(() => void ctx.services.get('dialogue')?.start('npc-gaut', 'gaut'));
  };

  const startEscort = (): void => {
    const esc = ctx.services.get('escort');
    if (!esc || esc.active()) return;
    const feet = ctx.player.feet;
    if (!esc.start({ id: 'm11', route: m11Route(feet.y), riders: 2 })) k.warn('M11: the escort did not start');
  };

  // The banner raised: the ride-out beat, then the column leaves. A load while still on the road restarts it.
  k.on('quest.objective', (e) => {
    if (e.questId !== 'm11' || e.objectiveId !== 'banner' || !e.done) return;
    k.set('story.m11.rideout');
    k.later(() => {
      gautSpeaks();
      startEscort();
    });
  });
  k.on('save.loaded', () => {
    if (k.active('m11') && k.objDone('m11', 'banner') && !k.objDone('m11', 'ring')) k.later(startEscort);
  });

  // Three stages of banter along the road, each once.
  k.on('trigger.enter', (e) => {
    if (e.actorId !== 'player' || !k.active('m11') || !ctx.services.get('escort')?.active()) return;
    const m = /^trg\.cinderreach\.m11\.stage\.(\d)$/.exec(e.triggerId);
    if (!m) return;
    const n = Number(m[1]);
    if (n <= k.num('story.m11.stageSeen')) return;
    k.set('story.m11.stageSeen', n);
    k.set('story.m11.stage', n);
    k.later(gautSpeaks);
  });

  // Arrival: the column dismounts; once they stand, the first ambush group comes out of the road.
  k.on('trigger.enter', (e) => {
    if (e.actorId !== 'player' || e.triggerId !== 'trg.cinderreach.m11.ring' || !k.active('m11')) return;
    const esc = ctx.services.get('escort');
    if (esc?.active()?.phase === 'riding') void esc.dismount();
  });
  // `armed` once this session spawned an ambush group: a load despawns the groups before it refills one, and a re-check
  // queued by that teardown must not read the empty groups as a cleared first ambush.
  let armed = false;
  const ambush = (n: 1 | 2): void => {
    if ((ctx.services.get('enemies')?.spawnGroup(`q12.m11.ambush-${n}`) ?? []).length > 0) armed = true;
  };
  k.on('escort.dismounted', (e) => {
    if (e.escortId === 'm11' && k.active('m11') && !k.objDone('m11', 'ambush')) k.later(() => ambush(1));
  });
  // The second group once the first three are down; a load mid-fight refills whichever group the count says.
  const ambushKills = (): number => k.progress('m11', 'ambush');
  // Re-checked on a death and also on a mercy or a despawn: a spared Footman leaves without dying (review-a #3).
  const checkAmbush = (): void => k.later(() => {
    if (!armed || !k.active('m11') || !ctx.services.get('enemies')) return;
    if (k.standing('q12.m11.ambush-1').length === 0 && k.standing('q12.m11.ambush-2').length === 0 && ambushKills() >= 3 && ambushKills() < 6) ambush(2);
  });
  k.on('actor.died', (e) => {
    if (e.spawnTag === 'm11.ambush' && k.active('m11')) checkAmbush();
  });
  k.onMemberLeft(() => {
    if (k.active('m11') && k.objDone('m11', 'ring') && !k.objDone('m11', 'ambush')) checkAmbush();
  });
  k.on('save.loaded', () => {
    armed = false;
    if (!k.active('m11') || !k.objDone('m11', 'ring') || k.objDone('m11', 'ambush')) return;
    k.later(() => ambush(ambushKills() < 3 ? 1 : 2));
  });

  // The first bloom cleansed wakes the wraiths.
  k.on('interact', (e) => {
    if (e.action !== 'mercy' && e.interactableId.startsWith('use:m11-bloom-') && k.active('m11')) k.set('story.m11.bloomHit');
  });

  // The stone lit: Gaut's speech. The ride is over when the quest is.
  k.on('waystone.rekindled', (e) => {
    if (e.waystoneId !== 'cinder-road' || !k.active('m11')) return;
    k.set('story.m11.speech');
    k.later(gautSpeaks);
  });
  k.on('quest.completed', (e) => {
    if (e.questId === 'm11') ctx.services.get('escort')?.stop();
  });
  return offs;
}
