// M11 Road of Cinders: the banner sends the column out along the Cinder Road, Gaut banters at three stages, the ring dismounts,
// the Footmen ambush the stone, the blooms wake the wraiths and the stone's speech closes the ride.
import { M11_STATION_ARC } from '../../../../region/act2/act2World';
import { roadPoint } from '../../../../terrain/shape/roadPoint';
import type { Kit, Off } from './kit';

const ROUTE_STEP = 120;
/** The npc id the stone speech runs under (not `gaut`, whose `report` talk credit it must not take), and its played flag. */
export const SPEECH_NPC = 'gaut-stone-speech';
const SPEECH_DONE = 'story.m11.speechDone';

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

  // The stone lit: Gaut's speech, once, after the ambush. The stone fires its event once, so it may have been lit on an
  // earlier ride, during the ambush (the speech then waits for the last Footman) or after it. The speech runs under its own
  // npc id: under `gaut` its completed `dialogue.ended` would take M11's `report` talk credit and his report lines would
  // never play (review-fixes-review F1, F5).
  const stoneLit = (): boolean => k.flag('waystone.cinder-road.lit');
  // A death closes the speech; it is owed again only once the player has respawned (review finding 1: it reopened over the body).
  let awaitingRespawn = false;
  const speechDue = (): boolean =>
    !awaitingRespawn && k.active('m11') && k.objDone('m11', 'ambush') && stoneLit() && !k.flag(SPEECH_DONE);
  let speechWaiting = false;
  const speak = (): void => {
    if (!speechDue()) {
      speechWaiting = false;
      return;
    }
    k.set('story.m11.speech');
    if (ctx.services.get('dialogue')?.start('npc-gaut', SPEECH_NPC)) {
      k.set(SPEECH_DONE);
      speechWaiting = false;
    } else {
      // Another dialogue holds the screen: the flag stays off the tree until the speech can really start.
      k.clear('story.m11.speech');
      speechWaiting = true;
    }
  };
  const speechSoon = (): void => k.later(speak);
  k.on('quest.objective', (e) => {
    if (e.questId === 'm11' && e.objectiveId === 'ambush' && e.done) speechSoon();
  });
  k.on('waystone.rekindled', (e) => {
    if (e.waystoneId === 'cinder-road') speechSoon();
  });
  k.on('dialogue.ended', (e) => {
    // The speech cut short (death, a script close): both flags would stay set and talking to Gaut would then play it under
    // `gaut`, eating the report credit. Re-arm it (review F1).
    // A load re-derives it in `save.loaded` below, so it is skipped here (review finding 3); a death waits for the respawn.
    if (e.npcId === SPEECH_NPC && e.reason !== 'completed' && e.reason !== 'load' && e.reason !== 'dispose') {
      k.clear('story.m11.speech');
      k.clear(SPEECH_DONE);
      if (e.reason === 'death') awaitingRespawn = true;
      else speechSoon();
      return;
    }
    if (speechWaiting) speechSoon();
  });
  k.on('player.respawned', () => {
    if (!awaitingRespawn) return;
    awaitingRespawn = false;
    speechSoon();
  });
  // A refused start may have been a menu, not a dialogue: no `dialogue.ended` follows that (review F2).
  k.on('ui.modal', (e) => {
    if (!e.open && speechWaiting) speechSoon();
  });
  // A load re-derives it: the speech is owed again unless it has played (a load mid-speech replays it from the start).
  k.on('save.loaded', () => {
    speechWaiting = false;
    awaitingRespawn = false;
    if (k.flag('story.m11.speech')) {
      k.clear('story.m11.speech');
      k.clear(SPEECH_DONE);
    }
    speechSoon();
  });
  k.on('quest.completed', (e) => {
    if (e.questId === 'm11') ctx.services.get('escort')?.stop();
  });
  return offs;
}
