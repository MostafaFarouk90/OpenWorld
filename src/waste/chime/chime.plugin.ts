// Plugin `waste-chime` (Act 4 L1 PR 2, plans/act4-L1.md section 17): the Singing Slag's puzzle in the game. While M45 is
// under way and the shrine is unlit, attack keys 1 to 4 pressed on the strike stone play the phrases (a press is a strike;
// the first starts the phrase). The third phrase lights the shrine once (`shrine.singing-slag.lit`, `shrine.rekindled`, so
// the shipped warmth service gives W = 7) and emits `waste.chime.solved` for L11 (Ulthred's voice, M45's hand-in). The
// pillars, the slag mound and the glass drift are drawn here; the lit look is re-derived from the flag every tick.
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import type { Action } from '../../input/actions';
import { shrineFlag } from '../../shrine/warmth';
import { heightAt } from '../../terrain/heightfield';
import { GLASS_DRIFT, SLAG } from '../wasteSites';
import { createChimeBar } from './chimeBar';
import { ChimePuzzle } from './chimePuzzle';
import { ChimeVisuals } from './chimeVisuals';
import { CHIME_FAILS_FLAG, CHIME_LIVE_FLAG, CHIME_PHRASE_FLAG, CHIME_SOLVED_EVENT, CHIME_TUNING as T } from './phrases';
import { CHIME_STRINGS_EN } from './strings.en';

export const SINGING_SLAG_ID = 'singing-slag';
const KEYS: readonly Action[] = ['attack1', 'attack2', 'attack3', 'attack4'];

export interface ChimePluginOptions {
  heightAt?: (x: number, z: number) => number;
  now?: () => number;
}

export function createChimePlugin(opts: ChimePluginOptions = {}): GamePlugin {
  return {
    id: 'waste-chime',
    dependsOn: ['core', 'waste'],
    setup(ctx: GameContext) {
      const now = opts.now ?? (() => performance.now());
      const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
      const toast = (textKey: string) => emit('hud.toast', { textKey });
      ctx.strings.register('en', CHIME_STRINGS_EN);
      const lit = () => ctx.state.getBool(shrineFlag(SINGING_SLAG_ID));
      const live = () => ctx.state.getBool(CHIME_LIVE_FLAG) && !lit();

      const solve = () => {
        if (!lit()) {
          ctx.state.setFlag(shrineFlag(SINGING_SLAG_ID), true);
          emit('shrine.rekindled', { shrineId: SINGING_SLAG_ID });
        }
        emit(CHIME_SOLVED_EVENT, { shrineId: SINGING_SLAG_ID });
        (ctx.services.get('quests') as { recheck?(): void } | undefined)?.recheck?.();
      };
      const puzzle = new ChimePuzzle({
        now,
        phrase: () => ctx.state.getNumber(CHIME_PHRASE_FLAG),
        setPhrase: (n) => ctx.state.setFlag(CHIME_PHRASE_FLAG, n),
        fails: () => ctx.state.getNumber(CHIME_FAILS_FLAG),
        setFails: (n) => ctx.state.setFlag(CHIME_FAILS_FLAG, n),
        toast,
        solved: solve,
      });
      // A load mid-phrase restarts it (the phrase count and fails are flags and stand).
      ctx.events.on('save.loaded', () => puzzle.reset());

      const h = opts.heightAt ?? heightAt;
      const visuals = new ChimeVisuals({ pillars: SLAG.pillars, shrine: SLAG.shrine, drift: GLASS_DRIFT, heightAt: h });
      ctx.scene.add(visuals.root);

      const hud = (ctx as unknown as { hud?: { mount(slot: string, w: unknown): () => void } }).hud;
      const bar = createChimeBar(typeof document === 'undefined' ? null : (document as never), () => puzzle.view(), (key, vars) => ctx.strings.t(key, vars));
      const unmount = bar && hud ? hud.mount('bottom-center', bar) : () => {};
      const prompts = () => ctx.services.get('prompts');
      let prompting = false;
      const setPrompt = (on: boolean) => {
        if (on === prompting) return;
        prompting = on;
        if (on) prompts()?.show('waste-chime', 'attack1', 'waste.chime.prompt', { force: true });
        else prompts()?.hide('waste-chime');
      };

      const onStone = (): boolean => {
        const f = ctx.player.feet;
        return Math.hypot(f.x - SLAG.strike[0], f.z - SLAG.strike[1]) <= T.strikeRadius;
      };

      ctx.systems.add({
        id: 'waste-chime.tick',
        fixedPhase: 'rules',
        order: 117,
        renderPhase: 'world',
        fixedUpdate() {
          const t = now();
          const playing = live() && ctx.input.contexts.top() === 'gameplay' && !ctx.player.actor.dead && onStone();
          if (!playing) {
            if (puzzle.running || puzzle.replaying) puzzle.reset(); // leaving the stone, a menu or death: the phrase starts over
          } else {
            for (let k = 0; k < KEYS.length; k++) {
              const a = KEYS[k]!;
              if (!ctx.input.actions.pressed(a)) continue;
              const stamped = (ctx.input as unknown as { pressedAtMs?(a: string): number | null | undefined }).pressedAtMs?.(a);
              puzzle.press(k + 1, stamped ?? t);
            }
          }
          puzzle.update(t);
          setPrompt(playing && !puzzle.running && !puzzle.replaying);
          visuals.setLit(lit());
          visuals.setGlow(puzzle.glow(t));
        },
        render(_alpha, frameTime) {
          visuals.update(frameTime);
        },
        dispose() {
          setPrompt(false);
          unmount();
          visuals.dispose();
        },
      });
    },
  };
}

export default createChimePlugin();
