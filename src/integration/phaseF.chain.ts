/**
 * The shared body of the Phase F chain tests (run A and run B each in its own file, so each boot has a worker to itself): the
 * lower Dragonspine, the Greyfen (run B only, through the Phase E driver) and the summit played headless from the run's start
 * fixture, then the act's ending: one `act.ended`, one `story.gate.a4`, K15's card, the fade to the Wyrmwatch Lodge hearth and
 * the camp scene read once. Then the pacing over all 21 quests, K13's block shares, K4's two long legs and the XP census.
 */
import { expect } from 'vitest';
import type { ChapterHarness } from './chapterHarness';
import { bootPhaseF, measurePhaseF, phaseFGate, k4Legs, K13_PLANNED_SHARE, ambientCensus, xpLedger, censusLevels } from './phaseF';
import { PHASE_F_LOWER, PHASE_F_SUMMIT, playSpineQuest, type SpineChoices } from './phaseFDriver';
import { KILLS_FORCED, playGreyfenChain, readOpen, type GreyfenChoices } from './phaseEDriver';
import { PHASE_E_ORDER } from './phaseE';
import { act3TimingMarkdown } from './act3Timing';
import type { PhaseCTrail } from './phaseC';
import type { PhaseECardHandle } from './phaseE.plugin';
import { ACT3_ENDING } from './act3Ending.plugin';
import { ACT3_CAMP_DIALOGUE, ACT3_CAMP_LINES } from '../dialogue/content/act3/campScene.dialogue';
import { blockLevelFlag } from '../shrine/warmthBlocks';
import { summitLevel, SUMMIT_CAP_ABOVE_PLAYER } from '../enemies/level';
import { DRAGONSPINE_SPAWNERS as DRAGONSPINE_AMBIENT } from '../enemies/act3Spawners';
import { AREA_BANDS } from '../region/areas';
import { DRAGONSPINE_OPEN_FLAG } from '../quests/act3Jump';

/** What a run names: the sleds, the candle bundle, the eggs, the trial, the glide, Skarl (and the Greyfen's own in run B). */
const ALLOWED_SCRIPTED = [
  /^r15 sleds: hauled \d+ m along K4's routes, \d+ dropped by a stoop and taken up again$/,
  /^r17 shrine \d: carried \d+ m along candle\.r17\.(down|up)$/,
  /^r18 eggs: carried \d+ m along K4's routes$/,
  /^m31 trial: (won|yielded) after \d breaks, \d+ blows through the damage service(, T held on the yield prompt)?, \d+ s$/,
  /^d06 glide: flown by the game, \d+ m in \d+ s$/,
  /^skarl: (spared|defeated) after \d+ blows of 120 through the damage service(, T held in the release window)?, \d+ s$/,
  // the Greyfen's (Phase E)
  /^dive dive\.greyfen\./, /^ferry reedgate to mere: boarded by F without the stop menu$/, /^murkjaw: \d+ blows of 70 while hittable/,
  /^r13 song: struck on the virtual clock, 0 failed bars$/, /^m27 blinds: stepped \d+ m sneaking, (unseen|seen, pack fought)$/,
  /^m26 wake: (scene read|credited by her wake beat, the scene needs the renderer camera rig)$/,
];

const level = (h: ChapterHarness) => h.ctx.services.require('progression').level;

/** Shows the card (the HUD updates on render), closes it, waits out the fade and reads the camp scene. */
async function throughEnding(h: ChapterHarness): Promise<{ camps: number; nodes: number; cardShown: boolean }> {
  const card = h.ctx.services.require('actEndingCard');
  const dialogue = h.ctx.services.require('dialogue');
  const trail = { talks: [], scripted: [], order: [] } as PhaseCTrail;
  let nodes = 0;
  let cardShown = false;
  // The camp is the dialogue the last `dialogue.started` named.
  const campOpen = () => h.of('dialogue.started').at(-1)?.dialogueId === ACT3_CAMP_DIALOGUE;
  for (let i = 0; i < 400 && h.ctx.state.getFlag(ACT3_ENDING.campSeenFlag) !== true; i++) {
    h.ctx.hud.update(0.5);
    if (card.active()) {
      cardShown = true;
      card.dismiss();
    }
    if (dialogue.active) nodes += readOpen(h, trail, campOpen() ? ACT3_CAMP_DIALOGUE : 'scene-after');
    await h.runAsync(15);
  }
  const camps = h.of('dialogue.started').filter((e) => e.dialogueId === ACT3_CAMP_DIALOGUE).length;
  const campNodes = trail.talks.filter((t) => t.npc === ACT3_CAMP_DIALOGUE).reduce((n, t) => n + t.nodes, 0);
  void nodes;
  return { camps, nodes: campNodes, cardShown };
}

export async function runPhaseF(run: 'a' | 'b', spine: SpineChoices, greyfen?: GreyfenChoices): Promise<string> {
  KILLS_FORCED.length = 0;
  const h = await bootPhaseF(run);
  const notes: string[] = [];
  // Census numbers other threads own (the jump's XP, the Warmth lock, the quest rewards) are reported, never retuned here.
  const findings: string[] = [];
  try {
    const qs = h.ctx.services.require('quests');
    const trails: Record<string, PhaseCTrail> = {};
    const play = async (q: string) => {
      trails[q] = { talks: [], scripted: [], order: [] };
      await playSpineQuest(h, trails[q], q, spine);
    };
    const arrivals: string[] = [];
    const arrival = (block: string, playerLevel: number) => {
      const L = h.ctx.state.getNumber(blockLevelFlag(block));
      arrivals.push(`${block}: block level ${L} at player level ${playerLevel}`);
      expect(L, `${block} locked`).toBeGreaterThan(0);
      if (L > playerLevel + 2) findings.push(`${block} locked at ${L}, ${L - playerLevel} over the player's ${playerLevel} (rule: at most 2)`);
    };

    // The lower Dragonspine (its block locks on arrival at the lodge).
    const lowerAt = level(h);
    for (const q of PHASE_F_LOWER) await play(q);
    arrival('dragonspine-lower', lowerAt);

    // Run B: the Greyfen second, through the Phase E driver; the peaks card is closed as the player would.
    if (greyfen) {
      const fenAt = level(h);
      Object.assign(trails, await playGreyfenChain(h, PHASE_E_ORDER, greyfen));
      const peaks = (globalThis as { __phaseECard?: PhaseECardHandle }).__phaseECard;
      expect(peaks?.visible, 'the peaks card after D05').toBe(true);
      peaks?.dismiss();
      await h.runAsync(10);
      arrival('greyfen', fenAt);
    }

    // The summit door: the mercy-heavy level at M31's start, and no summit spawn above it by more than 3 (Q9).
    const ambient = ambientCensus();
    const prog = h.ctx.services.require('progression') as unknown as { xp: number; level: number };
    const atM31 = censusLevels(prog.xp, xpLedger(h.of('xp.gained')), ambient.total);
    // Every summit spawn rolls on the area's band (26 to 28) and is capped at spawn: the top roll against the mercy-heavy level.
    expect(DRAGONSPINE_AMBIENT.some((d) => d.area === 'dragonspine-summit')).toBe(true);
    const summitTop = summitLevel(AREA_BANDS['dragonspine-summit'].band, 1, atM31.mercyHeavy);
    expect(SUMMIT_CAP_ABOVE_PLAYER).toBe(3);
    expect(summitTop, `summit spawns at most 3 over the mercy-heavy level ${atM31.mercyHeavy}`).toBeLessThanOrEqual(atM31.mercyHeavy + 3);
    notes.push(`M31 start: chain level ${prog.level} (${prog.xp} XP), mercy-heavy full play level ${atM31.mercyHeavy} (${atM31.mercyHeavyXp} XP), summit spawns at most ${summitTop}`);

    for (const q of PHASE_F_SUMMIT) await play(q);
    const all = [...PHASE_F_LOWER, ...(greyfen ? PHASE_E_ORDER : []), ...PHASE_F_SUMMIT];
    for (const q of all) expect(qs.state(q), q).toBe('completed');
    expect(h.ctx.state.getString('story.m31.choice')).toBe(spine.m31);
    expect(h.ctx.state.getString('boss.corvin-skarl.outcome')).toBe(spine.d06);
    expect(h.ctx.state.getBool(DRAGONSPINE_OPEN_FLAG), 'nothing wrote the retired hold').toBe(false);

    // The ending: once, with the card, the fade to the hearth and the camp scene.
    const ending = await throughEnding(h);
    expect(h.of('act.ended').filter((e) => e.act === 3)).toEqual([{ act: 3, endingId: ACT3_ENDING.endingId }]);
    expect(h.ctx.state.getFlag(ACT3_ENDING.gateFlag)).toBe(true);
    expect(ending.cardShown, 'the card').toBe(true);
    expect(ending.camps, 'the camp scene once').toBe(1);
    expect(ending.nodes).toBe(ACT3_CAMP_LINES.length);
    const hearth = h.ctx.anchors.find(ACT3_ENDING.campAnchorId!)!.position;
    const f = h.ctx.player.feet;
    expect(Math.hypot(f.x - hearth.x, f.z - hearth.z), 'at the lodge hearth').toBeLessThan(20);

    // The census at the end.
    const ledger = xpLedger(h.of('xp.gained'));
    const end = censusLevels(prog.xp, ledger, 0);
    const mercyEnd = censusLevels(prog.xp, ledger, ambient.total);
    notes.push(`end: chain level ${end.chain} (${prog.xp} XP; kill XP ${Math.round(ledger.kill)}, other ${Math.round(ledger.other)}), mercy-heavy ${mercyEnd.mercyHeavy}; ambient census ${ambient.total} (Greyfen ${ambient.greyfen}, lower ${ambient.lower}, summit ${ambient.summit})`);
    expect(ambient.total).toBeGreaterThanOrEqual(10_000);
    if (end.chain < 24 || end.chain > 25) findings.push(`chain level ${end.chain} at the end (brief: 24 to 25)`);
    if (mercyEnd.mercyHeavy < 22) findings.push(`mercy-heavy level ${mercyEnd.mercyHeavy} at the end (brief: at least 22)`);

    // Every shortcut named, and only the known ones; no kill the damage service refused.
    const scripted = Object.values(trails).flatMap((t) => t.scripted);
    expect(scripted.filter((s) => !ALLOWED_SCRIPTED.some((r) => r.test(s)))).toEqual([]);
    expect(KILLS_FORCED).toEqual([]);

    // Pacing: all 21 quests, the act at 50% or more, every quest at 40% or more (under 45% reported).
    const { report, planned } = measurePhaseF(trails);
    const md = act3TimingMarkdown(report);
    const gate = phaseFGate(report);
    expect(gate.reasons, md).toEqual([]);
    const legs = k4Legs().map((l) => `${l.quest.toUpperCase()} ${l.mode} ${l.metres.toFixed(0)} m (planned ${l.plannedM}), travel ${(l.travelShare * 100).toFixed(0)}% of the estimate before the 30% cap`);
    notes.push(
      `blocks: lower ${((report.blocks.spine?.share ?? 0) * 100).toFixed(1)}% (K13 planned ${K13_PLANNED_SHARE.spine * 100}%), summit ${((report.blocks.summit?.share ?? 0) * 100).toFixed(1)}% (planned ${K13_PLANNED_SHARE.summit * 100}%), act ${(report.act.share * 100).toFixed(1)}%`,
      `under 45%: ${report.reported.join(', ') || 'none'}; planned nodes kept for: ${planned.join(', ') || 'none'}`,
      `K4 legs: ${legs.join('; ')}`,
      `arrivals: ${arrivals.join('; ')}`,
      `census findings (reported): ${findings.join('; ') || 'none'}`,
    );
    return `${md}\n\n${notes.join('\n')}\n\nscripted: ${scripted.join('; ')}`;
  } finally {
    console.log([...notes, `findings: ${findings.join('; ') || 'none'}`].join('\n'));
    h.dispose();
  }
}
