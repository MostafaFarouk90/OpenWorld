// The final ending director (N12 PR 2, plan 9, contracts v0.9 item 9): the steps after M56's choice, each awaited in turn.
//   1. the choice: at the confirm N11's M56 calls `holdSaves()`, then writes `story.m56.scars`, `story.m56.caelLives`,
//      the shrine and `story.m56.choice` last; M56 completes on its aftermath's last line;
//   2. `story.gate.end`, written once, when M56 completes (`act.ended { act: 5 }` emitted with it, once);
//   3. the cutscene for the choice (N11's scene; N11's director starts N8's ending theme on its `scene.started`);
//   4. the title card; 5. the epilogue (its speaker the M56 snapshot's top track, Tobb on a tie);
//   6. the credits (N8's cues stepped with the ballad's verses);
//   7. after: `codex.actEnding.a5.seen`, then `world.afterEnding`, N13's `wake()` awaited, the save hold released and one
//      save written.
// Flags are written only at steps 2 and 7. A load drops whatever is running: before the gate it releases any hold (a load
// before the confirm replays the choice); with the gate and no after-state it plays again from the cutscene; with the
// after-state it does nothing. Pure on its ports, so it is tested without a boot and runs headless on the virtual clock.
import type { CreditsDef, VerseStep } from '../hud/act5/credits';
import type { SlideDeck } from '../hud/act5/slides';
import type { FinalEndingDef } from './actEndings';
import { choiceOf, R30_VERSE_FLAG, type Act5EndingData, type EndingChoice, type FlagReader, type TitleCard } from './act5EndingData';

export type FinalEndingStep = 'idle' | 'cutscene' | 'card' | 'epilogue' | 'credits' | 'after' | 'done';

export interface FinalEndingPorts {
  getFlag: FlagReader;
  setFlag(key: string, value: true): void;
  emitActEnded(e: { act: number; endingId: string }): void;
  /** A dialogue, a HUD modal or a scene is up: the next step waits. */
  busy(): boolean;
  playScene(id: string): Promise<unknown>;
  showTitle(card: TitleCard): Promise<void>;
  showEpilogue(deck: SlideDeck): Promise<void>;
  showCredits(def: CreditsDef, onStep: (s: VerseStep) => void): Promise<void>;
  music: {
    credits(verse: string | undefined, tie: boolean): void;
    step(step: VerseStep, verse: string | undefined, tie: boolean): void;
    stop(): void;
  };
  /** N13's `afterEnding.wake()` (absent: skipped). Never rejects. */
  wake?(): Promise<void>;
  /** Raises the M56 save hold; returns its release. */
  suspendSaves(): () => void;
  save(): Promise<unknown>;
  warn?(msg: string): void;
}

export class FinalEndingDirector {
  private stepNow: FinalEndingStep = 'idle';
  private gen = 0;
  private running = false;
  private release: (() => void) | null = null;
  /** Per run, for tests and the chain's report. */
  readonly log: string[] = [];

  constructor(private readonly def: FinalEndingDef, private readonly data: Act5EndingData, private readonly ports: FinalEndingPorts) {}

  get step(): FinalEndingStep {
    return this.stepNow;
  }
  get holding(): boolean {
    return this.release !== null;
  }

  private get questDone(): boolean {
    return this.def.requires.every((q) => this.ports.getFlag(`story.${q}.complete`) === true);
  }

  /** N11 calls this at the M56 confirm, before writing the choice (idempotent). */
  holdSaves(): void {
    if (!this.release && this.ports.getFlag(this.def.afterState) !== true) this.release = this.ports.suspendSaves();
  }

  private releaseHold(): void {
    const r = this.release;
    this.release = null;
    r?.();
  }

  /** `quest.completed`: M56 done writes the gate once and the ending starts. */
  onQuestCompleted(questId: string): void {
    if (!this.def.requires.includes(questId)) return;
    this.writeGate();
  }

  private writeGate(): void {
    if (!this.questDone || this.ports.getFlag(this.def.gateFlag) === true) return;
    this.ports.setFlag(this.def.gateFlag, true);
    this.ports.emitActEnded({ act: this.def.act, endingId: this.def.endingId });
  }

  /** `save.loaded`: drop the running steps and re-derive. */
  onLoaded(): void {
    this.gen++;
    this.running = false;
    this.ports.music.stop();
    if (this.ports.getFlag(this.def.afterState) === true) {
      this.releaseHold();
      this.stepNow = 'done';
      return;
    }
    if (this.ports.getFlag(this.def.gateFlag) !== true) this.releaseHold();
    this.stepNow = 'idle';
  }

  /** Each fixed tick: starts the ending once the gate stands and nothing is in the way. */
  tick(): void {
    if (this.running || this.stepNow === 'done') return;
    if (this.ports.getFlag(this.def.afterState) === true) {
      this.stepNow = 'done';
      return;
    }
    // a save carrying M56 complete from before the director: write the gate on its first tick
    if (this.ports.getFlag(this.def.gateFlag) !== true) this.writeGate();
    if (this.ports.getFlag(this.def.gateFlag) !== true || this.ports.busy()) return;
    this.running = true;
    void this.run(this.gen);
  }

  private async run(gen: number): Promise<void> {
    const p = this.ports;
    const live = () => gen === this.gen;
    const enter = (s: FinalEndingStep) => {
      this.stepNow = s;
      this.log.push(s);
    };
    try {
      // the hold stands from here to the save, whether or not N11 raised it (a load with the gate set replays from here)
      this.holdSaves();
      let choice: EndingChoice | undefined = choiceOf(p.getFlag);
      if (!choice) {
        p.warn?.(`act5-ending: ${this.def.choiceFlag} unset with ${this.def.gateFlag}; playing the Rekindle cutscene`);
        choice = 'rekindle';
      }
      enter('cutscene');
      await p.playScene(this.data.cutscene(choice));
      if (!live()) return;
      enter('card');
      await p.showTitle(this.data.titleCardFor(p.getFlag));
      if (!live()) return;
      enter('epilogue');
      const ep = this.data.epilogueFor(p.getFlag);
      await p.showEpilogue({ speaker: ep.speaker, slides: ep.slides });
      if (!live()) return;
      enter('credits');
      const verseFlag = p.getFlag(R30_VERSE_FLAG);
      const verse = typeof verseFlag === 'string' ? verseFlag : undefined;
      p.music.credits(verse, ep.tie);
      await p.showCredits(this.data.creditsFor(p.getFlag), (s) => p.music.step(s, verse, ep.tie));
      p.music.stop();
      if (!live()) return;
      enter('after');
      p.setFlag(this.def.cardSeenFlag, true);
      p.setFlag(this.def.afterState, true);
      if (p.wake) await p.wake();
      if (!live()) return;
      this.releaseHold();
      await p.save();
      enter('done');
    } finally {
      if (live()) this.running = false;
    }
  }
}
