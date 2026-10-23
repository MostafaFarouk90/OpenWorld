import type { CoreContext as Ctx } from '../../region/coreTypes';
import { LOWER_SEALED_DOOR, LOWER_SHORTCUT_GATE } from './lowerGalleries';

/** The shortcut gate stays shut until A9 opens Weeping Bellows' way through; the sealed door until Wenna's quest (M19) starts. */
export const LOWER_GATE_OPEN_FLAG = 'world.bellows.shortcutOpen';
/** A13's M19 doors objective writes it (the lift stop for the Lower Galleries opens earlier, on story.m19.started). */
export const LOWER_DOOR_OPEN_FLAG = 'story.m19.doorOpen';

/** Blocker id and the flag that opens it. */
export const LOWER_BLOCKS: readonly { blocker: string; openFlag: string }[] = [
  { blocker: LOWER_SHORTCUT_GATE, openFlag: LOWER_GATE_OPEN_FLAG },
  { blocker: LOWER_SEALED_DOOR, openFlag: LOWER_DOOR_OPEN_FLAG },
];

/**
 * Closes each Lower Galleries blocker until its flag is true. Re-evaluated at setup, when either flag changes, on `save.loaded`
 * (which replaces the flags wholesale) and on entering an interior (the service may arrive after setup). Returns the undo, which
 * leaves both blockers open as the def has them.
 */
export function registerLowerGalleries(ctx: Ctx): () => void {
  const apply = () => {
    const interiors = ctx.services.get('interiors');
    if (!interiors) return;
    for (const b of LOWER_BLOCKS) interiors.setBlocker(b.blocker, !ctx.state.getBool(b.openFlag));
  };
  apply();
  const flags = new Set(LOWER_BLOCKS.map((b) => b.openFlag));
  const offs = [
    ctx.events.on('flag.changed', ({ key }) => {
      if (flags.has(key)) apply();
    }),
    ctx.events.on('save.loaded', apply),
    ctx.events.on('interior.entered', apply),
  ];
  return () => {
    offs.forEach((off) => off());
    const interiors = ctx.services.get('interiors');
    if (interiors) for (const b of LOWER_BLOCKS) interiors.setBlocker(b.blocker, false);
  };
}
