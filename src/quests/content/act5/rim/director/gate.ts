// M47 and M48 on the rim and the Lava Stair: M47 starts by itself on the Act 5 gate (the M39 pattern), the hairpin is a trigger,
// the winch's toast, the first sight; M48's far lips are triggers (a crust walk and a Leap count the same), a vent wheel turns
// N3's vent when it exists (N1 PR 2 builds it; until then my stand-in wheel opens the step alone), the vents roar.
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck, toast } from '../../../act4/harrowmark/director/shared';
import { M47_HAIRPIN, M47_HAIRPIN_TRIGGER, M47_RIM_GATE_OPEN, M47_SIGHT_SCENE } from '../m47.quest';
import {
  M48_CHANNELS, M48_CHAN_TRIGGER, M48_CROSSED, M48_LEVER, M48_LEVER_CHANNELS, M48_VENTS_SCENE, M48_VENT_CHANNELS, M48_VENT_ID, M48_VENT_OPENED, M48_WHEEL, M48_WHEEL_ANCHOR,
} from '../m48.quest';
import { LOG, isPlayer, playWhenCurrent } from './generic';

export const ACT5_GATE = 'story.gate.a5';

export function installM47(k: Kit): void {
  const start = (): void => {
    if (!k.flag(ACT5_GATE) || k.qstate('m47') !== 'inactive') return;
    if (!k.ctx.services.get('quests')?.start('m47')) k.warn(`${LOG} M47 did not start on the Act 5 gate`);
  };
  k.on('flag.changed', (e) => { if (e.key === ACT5_GATE) k.later(start); });
  k.on('save.loaded', () => k.later(start));
  k.later(start);

  k.on('trigger.enter', (e) => {
    if (e.triggerId !== M47_HAIRPIN_TRIGGER || !isPlayer(k, e.actorId) || !k.active('m47') || k.flag(M47_HAIRPIN)) return;
    k.set(M47_HAIRPIN);
    k.later(() => recheck(k));
  });
  k.on('flag.changed', (e) => { if (e.key === M47_RIM_GATE_OPEN && e.value === true && k.active('m47')) toast(k, 'rim.q.m47.gate'); });
  playWhenCurrent(k, { quest: 'm47', objective: 'sight', scene: M47_SIGHT_SCENE });
}

/** A vent's wheel once its step is done: the quest prop goes with the step, so while the crossing is current the director
 * offers the same wheel again (only for N3's real vent, whose crust closes; a stand-in never closes). */
export const M48_REOPEN = (v: number): string => `use:m48-reopen-${v}`;

export function installM48(k: Kit): Off {
  // a far lip counts only while its crossing is the current step (the stair is one road, but a Leap back up must not skip ahead)
  k.on('trigger.enter', (e) => {
    if (!isPlayer(k, e.actorId) || !k.active('m48')) return;
    for (const n of M48_CHANNELS) {
      if (e.triggerId !== M48_CHAN_TRIGGER(n) || k.flag(M48_CROSSED(n))) continue;
      if (!k.objCurrent('m48', `chan${n}`)) return;
      k.set(M48_CROSSED(n));
      k.later(() => recheck(k));
    }
  });
  k.on('interact', (e) => {
    if (!k.active('m48')) return;
    for (let v = 1; v <= M48_VENT_CHANNELS.length; v++) {
      if (e.interactableId !== M48_WHEEL(v)) continue;
      const lava = k.ctx.services.get('lava');
      const known = lava?.vents().some((x) => x.id === M48_VENT_ID(v)) ?? false;
      const r = known ? lava!.turnWheel(M48_VENT_ID(v)) : 'opened';
      if (r === 'hot' || r === 'unknown' || r === 'no-wheel') return; // N3 toasts a hot wheel itself
      toast(k, 'rim.q.m48.vent');
      if (k.objCurrent('m48', `vent${v}`) && !k.flag(M48_VENT_OPENED(v))) { k.set(M48_VENT_OPENED(v)); k.later(() => recheck(k)); }
    }
    for (let l = 1; l <= M48_LEVER_CHANNELS.length; l++) if (e.interactableId === M48_LEVER(l)) toast(k, 'rim.q.m48.lever');
  });
  playWhenCurrent(k, { quest: 'm48', objective: 'roar', scene: M48_VENTS_SCENE });

  const interaction = (k.ctx as { interaction?: { register(i: unknown): Off } }).interaction;
  const offs = M48_VENT_CHANNELS.map((n, i) => {
    const v = i + 1;
    const real = (): boolean => k.ctx.services.get('lava')?.vents().some((x) => x.id === M48_VENT_ID(v)) ?? false;
    return interaction?.register({
      id: M48_REOPEN(v), kind: 'use', name: `m48-reopen-${v}`, radius: 2, promptKey: 'quest.prompt.a5r.wheel',
      position: (out: { x: number; y: number; z: number }) => {
        const a = k.ctx.anchors.find(M48_WHEEL_ANCHOR(v));
        if (a) { out.x = a.position.x; out.y = a.position.y; out.z = a.position.z; }
        return out;
      },
      // from the vent's own step being done until its channel (and, for the last vent, the roar) is crossed
      enabled: () => k.active('m48') && k.objDone('m48', `vent${v}`) && !k.objDone('m48', `chan${n}`) && real(),
      onInteract: () => { if (k.ctx.services.get('lava')?.turnWheel(M48_VENT_ID(v)) === 'opened') toast(k, 'rim.q.m48.vent'); },
    }) ?? (() => {});
  });
  return () => { for (const off of offs) off(); };
}
