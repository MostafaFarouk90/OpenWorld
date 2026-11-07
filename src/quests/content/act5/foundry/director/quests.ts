// The Foundry quests' set pieces (plans/act5-N11.md section 4): what cannot live in a quest def or a dialogue effect.
// - R27: the far seal follows F6 from the start; the line is ready once every prop, lamp and charge is set; the hold runs on
//   N4's siege service ('r27') once the player is in the tunnel, and `story.r27.held` follows `siege.completed`.
// - R28: the Heartshard lighting (10 Burn, refused over the cap), the lit count, the rite's toast.
// - R30: the camp anvil's rhythm run (the shipped BeatRun, never a hard fail), and the camp sings after the verse.
// - M53: the Scar band for Vey's third part; the truce's end arms F1's breakers and Vey withdraws.
// - D09: the d09 snapshot and the turned count on the first entry; the slag puzzle; the guards by F1 and Wenna's talk.
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck, toast } from '../../../act4/harrowmark/director/shared';
import { BeatRun } from '../../../act4/harrowmark/director/beat';
import { createSongBar } from '../../../act3/greyfen/director/songBar';
import { FOUNDRY_DESCENT_ID, FOUNDRY_RUNNELS, STOKERS_TUNNEL_ID } from '../../../../../caldera/interiors/sites';
import {
  D09_GUARDS_ARM, D09_SLAG, D09_SLAG_FAILS, D09_SLUICE, D09_TURNED, D09_WENNA_MET, M53_BROKEN_ARM, M53_SCAR_BAND, M53_TRUCE_SEEN,
  R27_CHARGE, R27_FAR_OPEN, R27_HELD, R27_LAMP, R27_LINE_READY, R27_PROP, R28_LIT, R28_PYRES, R30_TUNE, R30_TUNE_FAILS, R30_VERSE,
  SCARS_MIRROR_FLAG,
} from '../flags';
import { f1, f6, f8, guardsTurned } from '../readers';
import { scarBand } from '../scars';
import { R27_CHARGES, R27_ENTERED, R27_LAMPS, R27_PROPS } from '../r27.quest';
import { R28_BURN_COST, R28_LIGHT, R28_PYRE_NS, R28_RITE } from '../r28.quest';
import { R30_ANVIL, R30_SUNG } from '../r30.quest';
import { M53_WITHDRAWN } from '../m53.quest';
import { D09_ENTERED, D09_FLOOD_S, D09_LESSON_AFTER, D09_SLUICE_ORDER, D09_SLUICE_USE } from '../d09.quest';
import { D09_GUARD_PAIR_ARM } from '../spawners';
import { M53_PICKETS_ARM } from './tables';
import { LOG } from './generic';

const BURN_MAX = 100;

// ---- R27 --------------------------------------------------------------------------------------------------------------------
/** Every prop, lamp and charge is set (pure, for the tests). */
export const lineReady = (flag: (k: string) => boolean): boolean =>
  R27_PROPS.every((n) => flag(R27_PROP(n))) && R27_LAMPS.every((n) => flag(R27_LAMP(n))) && R27_CHARGES.every((n) => flag(R27_CHARGE(n)));

export function installR27(k: Kit): void {
  const siege = () => k.ctx.services.get('siege');
  const interiors = () => k.ctx.services.get('interiors');
  // F6 Leaders: the far end was never sealed, so N2's far seal opens from the start (the choice may close it again)
  const farFromF6 = (): void => {
    if (k.active('r27') && !k.objDone('r27', 'choose') && f6(k.ctx.state) === 'leaders' && !k.flag(R27_FAR_OPEN)) k.set(R27_FAR_OPEN);
  };
  k.on('quest.started', (e) => { if (e.questId === 'r27') k.later(farFromF6); });
  k.on('save.loaded', () => k.later(farFromF6));
  k.on('interior.entered', (e) => {
    if (e.interiorId === STOKERS_TUNNEL_ID && k.active('r27') && !k.flag(R27_ENTERED)) { k.set(R27_ENTERED); k.later(() => recheck(k)); }
  });
  k.on('flag.changed', (e) => {
    if (!e.key.startsWith('story.r27.') || k.flag(R27_LINE_READY) || !lineReady(k.flag)) return;
    k.set(R27_LINE_READY);
    toast(k, 'quest.r27.lineSet');
  });
  k.on('siege.completed', (e) => {
    if (e.siegeId === 'r27' && k.active('r27') && !k.flag(R27_HELD)) { k.set(R27_HELD); k.later(() => recheck(k)); }
  });
  // the hold: the step is current, the line is set and the player is in the tunnel; a load restarts it (N4's rule)
  k.every(30, () => {
    if (!k.active('r27') || !k.objCurrent('r27', 'hold') || k.flag(R27_HELD)) return;
    const s = siege();
    if (!s) return;
    if (s.completed('r27')) { k.set(R27_HELD); k.later(() => recheck(k)); return; }
    if (s.current || !k.flag(R27_LINE_READY) || interiors()?.current !== STOKERS_TUNNEL_ID) return;
    if (!s.start('r27')) k.warn(`${LOG} the tunnel siege would not start`);
  });
  k.on('flag.changed', (e) => {
    if (e.key === 'story.r27.choice' && e.value === 'collapse') toast(k, 'quest.r27.collapse');
  });
}

// ---- R28 --------------------------------------------------------------------------------------------------------------------
/** How many pyres are lit (pure). */
export const litCount = (flag: (k: string) => boolean): number => R28_PYRE_NS.filter((n) => flag(R28_LIT(n))).length;
/** The lighting is refused when its Burn would pass the cap. */
export const tooHotToLight = (burn: number): boolean => burn + R28_BURN_COST > BURN_MAX;

export function installR28(k: Kit): void {
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('r28') || !k.objCurrent('r28', 'rite')) return;
    const n = R28_PYRE_NS.find((i) => e.interactableId === R28_LIGHT(i));
    if (!n || k.flag(R28_LIT(n))) return;
    const spells = k.ctx.services.get('spells');
    if (!spells) { k.warn(`${LOG} no spells service: the pyre cannot be lit`); return; }
    if (tooHotToLight(spells.burn)) { toast(k, 'quest.r28.tooHot'); return; }
    spells.useShard(R28_BURN_COST, 'r28-pyre');
    k.set(R28_LIT(n));
    k.set(R28_PYRES, litCount(k.flag));
    toast(k, f8(k.ctx.state) === 'all' ? 'quest.r28.litWalkers' : 'quest.r28.lit');
  });
  k.on('flag.changed', (e) => { if (e.key === R28_RITE && e.value === true) toast(k, 'quest.r28.riteDone'); });
}

// ---- R30 --------------------------------------------------------------------------------------------------------------------
export const R30_BEAT = 'quest.r30.beat';

function mountBar(k: Kit, run: BeatRun, prefix: string): Off {
  const hud = (k.ctx as unknown as { hud?: { mount(slot: string, w: unknown): () => void } }).hud;
  const bar = createSongBar(typeof document === 'undefined' ? null : (document as never), () => run.view(), (key) => k.ctx.strings.t(key.replace('greyfen.q.r13.bar.', `${prefix}.bar.`)));
  return bar && hud ? hud.mount('bottom-center', { ...bar, id: `${prefix}.bar` }) : () => {};
}

export function installR30(k: Kit, offs: Off[], now: () => number = () => performance.now()): BeatRun {
  const run = new BeatRun({
    now, prefix: R30_BEAT, toast: (key) => toast(k, key),
    fails: () => k.num(R30_TUNE_FAILS), failed: () => k.set(R30_TUNE_FAILS, k.num(R30_TUNE_FAILS) + 1),
    done: () => {
      if (!k.active('r30') || !k.objCurrent('r30', 'tune')) return;
      k.set(R30_TUNE);
      k.later(() => recheck(k));
    },
  });
  k.on('interact', (e) => {
    if (e.action === 'interact' && e.interactableId === R30_ANVIL && k.active('r30') && k.objCurrent('r30', 'tune')) run.press(2);
  });
  k.every(6, () => run.update());
  k.on('save.loaded', () => run.reset());
  // the camp sings once Tobb's verse talk is over
  k.on('dialogue.ended', (e) => {
    if (e.npcId !== 'tobb' || !k.active('r30') || k.flag(R30_SUNG) || !k.ctx.state.getString(R30_VERSE)) return;
    k.after(60, () => {
      if (k.flag(R30_SUNG) || !k.active('r30')) return;
      k.set(R30_SUNG);
      toast(k, 'quest.r30.sung');
    });
  });
  offs.push(mountBar(k, run, R30_BEAT));
  return run;
}

// ---- M53 --------------------------------------------------------------------------------------------------------------------
export function installM53(k: Kit): void {
  const band = (): void => {
    if (!k.active('m53') || k.flag(M53_TRUCE_SEEN)) return;
    const b = scarBand(k.num(SCARS_MIRROR_FLAG));
    if (k.str(M53_SCAR_BAND) !== b) k.set(M53_SCAR_BAND, b);
  };
  k.on('quest.objective', () => k.later(band));
  k.on('save.loaded', () => k.later(band));
  k.every(30, band);
  const broken = (): void => {
    if (!k.active('m53') || !k.flag(M53_TRUCE_SEEN)) return;
    if (!k.flag(M53_WITHDRAWN)) { k.set(M53_WITHDRAWN); toast(k, 'quest.m53.withdrawn'); }
    const flag = f1(k.ctx.state) === 'confront' ? M53_BROKEN_ARM : M53_PICKETS_ARM;
    if (!k.flag(flag)) k.set(flag);
  };
  k.on('flag.changed', (e) => { if (e.key === M53_TRUCE_SEEN) k.later(broken); });
  k.on('save.loaded', () => k.later(broken));
}

// ---- D09 --------------------------------------------------------------------------------------------------------------------
/** The guard pairs to arm for a turned count (0 both, 2 the second only, 4 none). */
export const pairsToArm = (turned: number): (0 | 1)[] => (turned >= 4 ? [] : turned >= 2 ? [1] : [0, 1]);

/** The slag puzzle's next sluice after `done` correct pulls, and whether `n` is it. */
export const nextSluice = (done: number): number | undefined => D09_SLUICE_ORDER[done];

export function installD09(k: Kit): void {
  const enter = (): void => {
    if (!k.active('d09') || k.flag(D09_ENTERED)) return;
    k.ctx.state.snapshotFavour('d09');
    k.set(D09_TURNED, f1(k.ctx.state) === 'confront' ? 0 : guardsTurned(k.ctx.state));
    k.set(D09_ENTERED);
    k.later(() => recheck(k));
  };
  k.on('interior.entered', (e) => { if (e.interiorId === FOUNDRY_DESCENT_ID) enter(); });

  // the guards: Confront arms both pairs as the step comes up; Spy waits for Wenna's talk and arms the pairs she did not turn
  const guards = (): void => {
    if (!k.active('d09') || !k.objCurrent('d09', 'guards') || k.flag(D09_GUARDS_ARM)) return;
    const confront = f1(k.ctx.state) === 'confront';
    if (!confront && !k.flag(D09_WENNA_MET)) return;
    for (const i of pairsToArm(confront ? 0 : k.num(D09_TURNED))) k.set(D09_GUARD_PAIR_ARM(i));
    k.set(D09_GUARDS_ARM);
  };
  k.on('quest.objective', () => k.later(guards));
  k.on('flag.changed', (e) => { if (e.key === D09_WENNA_MET) k.later(guards); });
  k.on('save.loaded', () => k.later(guards));

  // the slag: the plate's order; a wrong sluice floods the runnels for 8 s and resets; after two fails the next one is named
  const done = (): number => D09_SLUICE_ORDER.filter((n) => k.flag(D09_SLUICE(n))).length;
  let floodOff: (() => void) | null = null;
  const flood = (): void => {
    const lava = k.ctx.services.get('lava');
    const a = k.ctx.anchors.find('caldera.int.foundry.sluice.1');
    if (!lava || !a || floodOff) return;
    // the sluice anchor is local (-18, 12): the interior's origin follows from it (N2's world = origin + local)
    const ox = a.position.x + 18;
    const oz = a.position.z - 12;
    // dry floor clear of every runnel (local (-12, 16), (12, 16), (0, 26)): the nearest one takes a thrown player
    const y = a.position.y;
    const lips = [{ x: ox - 12, y, z: oz + 16 }, { x: ox + 12, y, z: oz + 16 }, { x: ox, y, z: oz + 26 }];
    const undo = FOUNDRY_RUNNELS.map((r, i) => {
      try {
        return lava.add({
          id: `caldera.q.f.d09.flood.${i + 1}`, shape: { kind: 'box', x0: ox + r.x0, z0: oz + r.z0, x1: ox + r.x1, z1: oz + r.z1 },
          surfaceY: a.position.y - 0.05, damagePctPerS: 15, safeLips: lips, depth: 2,
        });
      } catch (err) {
        k.warn(`${LOG} flood ${i + 1}: ${String(err)}`);
        return () => {};
      }
    });
    floodOff = () => { for (const u of undo) u(); floodOff = null; };
    k.after(D09_FLOOD_S * 60, () => floodOff?.());
  };
  k.on('save.loaded', () => floodOff?.());
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('d09') || !k.objCurrent('d09', 'slag') || k.flag(D09_SLAG)) return;
    const n = D09_SLUICE_ORDER.find((i) => e.interactableId === D09_SLUICE_USE(i));
    if (!n) return;
    if (n !== nextSluice(done())) {
      for (const i of D09_SLUICE_ORDER) k.clear(D09_SLUICE(i));
      const fails = k.num(D09_SLAG_FAILS) + 1;
      k.set(D09_SLAG_FAILS, fails);
      flood();
      toast(k, 'quest.d09.slagFlood');
      if (fails >= D09_LESSON_AFTER) toast(k, `quest.d09.slagNext.${nextSluice(0)}`);
      return;
    }
    k.set(D09_SLUICE(n));
    if (done() < D09_SLUICE_ORDER.length) {
      toast(k, k.num(D09_SLAG_FAILS) >= D09_LESSON_AFTER ? `quest.d09.slagNext.${nextSluice(done())}` : 'quest.d09.sluiceRight');
      return;
    }
    k.set(D09_SLAG);
    toast(k, 'quest.d09.slagDone');
    k.later(() => recheck(k));
  });
}
