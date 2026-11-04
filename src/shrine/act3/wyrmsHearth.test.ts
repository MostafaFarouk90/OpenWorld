import { describe, expect, it } from 'vitest';
import { WAYSTONE_LOCKS } from '../../waystones/tuning';
import { RUBBING_STRINGS_EN } from './strings.en';
import { WyrmsHearth } from './wyrmsHearth';

function setup(quests: Map<string, string> | null = new Map()) {
  const flags = new Set<string>();
  const log: string[] = [];
  const h = new WyrmsHearth({
    getBool: (k) => flags.has(k),
    setFlag: (k, v) => {
      log.push(`flag:${k}=${v}`);
      if (v) flags.add(k);
      else flags.delete(k);
    },
    questState: (id) => (quests ? (quests.get(id) ?? 'inactive') : undefined),
  });
  return { h, flags, quests, log };
}
const OPEN = 'shrine.wyrms-hearth.open';

describe("the Wyrm's Hearth gate", () => {
  it('is locked by the derived open flag', () => {
    expect(WAYSTONE_LOCKS['wyrms-hearth']).toBe(OPEN);
  });

  it('stays closed with M34 inactive or failed and no flags (M31 to M33)', () => {
    const t = setup();
    for (const q of ['inactive', 'failed']) {
      t.quests!.set('m34', q);
      t.h.deriveOpen();
      expect(t.flags.has(OPEN)).toBe(false);
    }
  });

  it('opens on each input alone', () => {
    const inputs: [string, (t: ReturnType<typeof setup>) => void][] = [
      ['m34 active', (t) => t.quests!.set('m34', 'active')],
      ['m34 completed', (t) => t.quests!.set('m34', 'completed')],
      ['story.m34.complete', (t) => t.flags.add('story.m34.complete')],
      ['shrine lit', (t) => t.flags.add('shrine.wyrms-hearth.lit')],
    ];
    for (const [name, apply] of inputs) {
      const t = setup();
      t.h.deriveOpen();
      expect(t.flags.has(OPEN), `${name} before`).toBe(false);
      apply(t);
      t.h.deriveOpen();
      expect(t.flags.has(OPEN), name).toBe(true);
    }
  });

  it('closes again when the inputs go away, and writes only on change', () => {
    const t = setup();
    t.quests!.set('m34', 'active');
    t.h.deriveOpen();
    t.h.deriveOpen();
    expect(t.log).toEqual([`flag:${OPEN}=true`]);
    t.quests!.set('m34', 'inactive');
    t.h.deriveOpen();
    expect(t.flags.has(OPEN)).toBe(false);
  });

  it('a missing quests service reads as closed and never throws', () => {
    const t = setup(null);
    expect(() => t.h.deriveOpen()).not.toThrow();
    expect(t.flags.has(OPEN)).toBe(false);
  });
});

describe('the anvil rubbings collection text', () => {
  it('names the Last Anvil and the Dragonspine sites', () => {
    const body = RUBBING_STRINGS_EN['codex.lore.anvil-rubbings.body'];
    expect(body).toContain('Last Anvil');
    expect(body).toContain('Dragonspine');
    for (const site of ['hawk nest', 'hunter cairn', 'frozen camp', 'glass vein', 'vista', 'ledge']) expect(body).toContain(site);
    expect(body).toContain('Twelve');
  });
});
