// v0.8 item 10: trainer posts that move by flag, and a desk another NPC takes over (L7: Rook takes the Knight desk).
import { describe, expect, it } from 'vitest';
import { DEFAULT_KITS, TRAINER_POSTS, npcBastionPost, trainerAnchor, trainerId, trainerPlacement, type TrainerPostRow } from './kits';

const flags = (f: Record<string, boolean>) => ({ getFlag: (k: string) => f[k] });
const knight = DEFAULT_KITS.knight;
const ROWS: TrainerPostRow[] = [
  { npcId: knight.trainer.npcId, post: 'ashgate.refuge.trainer.gaut', when: { all: ['story.m38.complete'] } },
  { classId: 'knight', npcId: 'rook', post: 'ashgate.refuge.trainer.rook', when: { all: ['story.m41.complete'] }, nameKey: 'npc.rook.name' },
];

describe('trainerPlacement', () => {
  it('with no rows holding, every desk is the shipped Bastion desk', () => {
    for (const kit of Object.values(DEFAULT_KITS)) {
      expect(trainerPlacement(kit, flags({}), ROWS)).toEqual({
        npcId: kit.trainer.npcId,
        interactableId: trainerId(kit),
        deskAnchor: trainerAnchor(kit),
        postAnchor: npcBastionPost(kit),
        nameKey: kit.trainer.nameKey,
        moved: false,
      });
    }
  });
  it('a row without classId moves the shipped trainer (the same interactable)', () => {
    const p = trainerPlacement(knight, flags({ 'story.m38.complete': true }), ROWS);
    expect(p).toMatchObject({ npcId: knight.trainer.npcId, interactableId: trainerId(knight), deskAnchor: 'ashgate.refuge.trainer.gaut', moved: true });
  });
  it('a row with classId gives the class desk to another NPC; the last holding row wins', () => {
    const p = trainerPlacement(knight, flags({ 'story.m38.complete': true, 'story.m41.complete': true }), ROWS);
    expect(p).toEqual({ npcId: 'rook', interactableId: 'trainer:rook', deskAnchor: 'ashgate.refuge.trainer.rook', postAnchor: 'ashgate.refuge.trainer.rook', nameKey: 'npc.rook.name', moved: true });
  });
  it('rows for one class never move another class', () => {
    expect(trainerPlacement(DEFAULT_KITS.warden, flags({ 'story.m41.complete': true, 'story.m38.complete': true }), ROWS).moved).toBe(false);
  });
  it('ships the refuge rows (L7): before M41 every desk is the shipped desk, after it Rook holds the Knight desk', () => {
    for (const kit of Object.values(DEFAULT_KITS)) expect(trainerPlacement(kit, flags({ 'story.m38.complete': true })).moved).toBe(false);
    const after = flags({ 'story.m38.complete': true, 'story.m39.complete': true, 'story.m41.complete': true });
    expect(trainerPlacement(knight, after)).toMatchObject({ npcId: 'rook', interactableId: 'trainer:rook', deskAnchor: 'ashgate.refuge.trainer.rook', nameKey: 'classes.trainer.rook' });
    for (const id of ['warden', 'emberwright', 'ashblade', 'pathfinder'] as const) {
      const kit = DEFAULT_KITS[id];
      expect(trainerPlacement(kit, after)).toMatchObject({ npcId: kit.trainer.npcId, interactableId: trainerId(kit), deskAnchor: `ashgate.refuge.trainer.${kit.trainer.npcId}`, moved: true });
    }
    expect(TRAINER_POSTS.length).toBe(5);
  });
});
