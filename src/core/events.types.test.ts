import { describe, expectTypeOf, it } from 'vitest';
import type { CloseReason } from '../dialogue/DialogueRunner';
import type { DialogueEndReason, GameEventMap } from './events';

// Checked by `tsc --noEmit` (tests are part of the project); the runtime body is a no-op.
describe('dialogue.ended typing', () => {
  it('carries the typed reason the dialogue runner emits', () => {
    expectTypeOf<GameEventMap['dialogue.ended']['reason']>().toEqualTypeOf<DialogueEndReason | undefined>();
    expectTypeOf<CloseReason>().toEqualTypeOf<Exclude<DialogueEndReason, 'completed'>>();
    expectTypeOf<'completed'>().toMatchTypeOf<DialogueEndReason>();
  });
});
