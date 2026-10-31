// K12: Greyfen dialogue content checks: every tree and note validates, strings resolve, the Pathfinder book is granted once,
// the R12 and R14 choices set their flags, and the talk table matches real trees and segments.
import { describe, expect, it } from 'vitest';
import { evalCondition } from '../../../../quests/conditions';
import type { Condition, DialogueDef, Effect } from '../../../../quests/types';
import { dialogueStrings, npcNameFallbackStrings } from '../../../strings.en';
import { questStrings } from '../../../../quests/strings.en';
import { dialogueDefs } from '../../index';
import { GREYFEN_DIALOGUES, GREYFEN_DIALOGUE_STRINGS, GREYFEN_TREES } from './index';
import { GREYFEN_TALKS } from './talks';

const all: Record<string, string> = { ...questStrings, ...dialogueStrings, ...npcNameFallbackStrings };
const byId = new Map(GREYFEN_DIALOGUES.map((d) => [d.id, d]));
const fxOf = (d: DialogueDef): Effect[] =>
  d.nodes.flatMap((n) => [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.effects ?? [])]) as Effect[];

describe('greyfen dialogue content', () => {
  it('is registered in the shared dialogue index', () => {
    for (const d of GREYFEN_DIALOGUES) expect(dialogueDefs.find((x) => x.id === d.id), d.id).toBeTruthy();
  });
  it('every node text key resolves to a string', () => {
    for (const d of GREYFEN_DIALOGUES) for (const n of d.nodes) {
      expect(all[n.textKey] ?? GREYFEN_DIALOGUE_STRINGS[n.textKey], `${d.id}/${n.id}`).toBeTruthy();
    }
  });
  it('every choice text key resolves and every target exists', () => {
    for (const d of GREYFEN_DIALOGUES) {
      const ids = new Set(d.nodes.map((n) => n.id));
      for (const n of d.nodes) {
        if (n.next) expect(ids.has(n.next), `${d.id}/${n.id}`).toBe(true);
        for (const c of n.choices ?? []) {
          expect(all[c.textKey], `${d.id}/${n.id}/${c.id}`).toBeTruthy();
          if (c.next) expect(ids.has(c.next), `${d.id}/${n.id}/${c.id}`).toBe(true);
        }
      }
    }
  });
  it('never names the player character literally', () => {
    for (const [k, v] of Object.entries(GREYFEN_DIALOGUE_STRINGS)) expect(v, k).not.toMatch(/\bCael\b/);
  });
  it('the talk table points at real trees and segments', () => {
    for (const t of GREYFEN_TALKS) {
      const tree = GREYFEN_TREES.find((x) => x.def.id === t.tree);
      expect(tree, `${t.quest}.${t.objective}: ${t.tree}`).toBeTruthy();
      const ids = tree!.def.nodes.map((n) => n.id);
      expect(ids.some((i) => i === t.seg || i.startsWith(`${t.seg}-`)), `${t.tree}/${t.seg}`).toBe(true);
    }
  });
  it('grants the Pathfinder master book once, behind the flag', () => {
    const leofa = byId.get('npc-leofa')!;
    const nodes = leofa.nodes.filter((n) => JSON.stringify(n.effects ?? []).includes('grantMasterBook'));
    expect(nodes.length).toBe(1);
    const when = nodes[0]!.when as Condition;
    const env = (given: boolean) => ({ state: { getFlag: (k: string) => (k === 'trainer.pathfinder.masterBook' ? given : undefined) }, quests: { state: () => 'inactive', objectiveDone: () => false }, favourBand: () => 'banked' }) as never;
    expect(evalCondition(when, env(false))).toBe(true);
    expect(evalCondition(when, env(true))).toBe(false);
  });
  it('R12 choices set the pick and announce it', () => {
    const s = JSON.stringify(fxOf(byId.get('npc-dudda')!));
    expect(s).toContain('story.r12.pick');
    expect(s).toContain('story.r12.picked');
    expect(s).toContain('burned');
    expect(s).toContain('cut');
  });
  it('R14 choices set the choice and announce it', () => {
    const s = JSON.stringify(fxOf(byId.get('npc-deserter')!));
    expect(s).toContain('story.r14.choice');
    expect(s).toContain('story.r14.chosen');
    expect(s).toContain('returned');
    expect(s).toContain('released');
  });
});
