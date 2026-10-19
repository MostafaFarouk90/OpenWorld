import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { CORRIDOR_LAYOUT } from '../region/corridor.layout';
import { dialogueStrings } from './strings.en';

const find = (id: string) => [...BRIGHTWATER_LAYOUT.anchors, ...CORRIDOR_LAYOUT.anchors].find((a) => a.id === id)!;

describe("Gaut's directions to Hollin Ford (dev guide gap)", () => {
  const ford = find('ford.toll-post');
  const post = find('npc-post.gaut');
  const side = ford.x < post.x ? 'west' : 'east';
  const other = side === 'west' ? 'east' : 'west';
  const lines = ['dialogue.npc-gaut.m04-offer-2', 'dialogue.npc-gaut.m04-ford'].map((k) => (dialogueStrings as Record<string, string>)[k]);

  it('the ford lies west of Gaut\'s post in the layout', () => {
    expect(side).toBe('west');
  });
  it('his M04 lines name the real direction and never the opposite one', () => {
    for (const l of lines) expect(l).not.toMatch(new RegExp(`\\b${other}\\b`, 'i'));
    expect(lines.join(' ')).toMatch(new RegExp(`\\b${side}\\b`, 'i'));
  });
});
