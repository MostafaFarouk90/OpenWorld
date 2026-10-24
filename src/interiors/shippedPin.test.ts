// Pins every shipped interior's solids, anchors, bounds and nav grid against a flat ground, so the additive v0.7 fields
// (`sunken`, blocker `base` and `startClosed`, K3 and K4) can never change an interior that does not use them.
import { describe, expect, it } from 'vitest';
import { ACT3_INTERIORS } from './act3';
import { ALL_INTERIORS } from './interiors.plugin';
import { layoutInterior } from './layout';

const PINNED: Record<string, string> = {
  'chapel-vault': 'f1dbea1e3d89dc70',
  'tilted-anvil': 'cd4562314ed7e28d',
  'keep-hall': '024145c710fd14f1',
  'counting-house': '0578f0a9400cba15',
  archive: '5ecf866c6167239c',
  underways: '2805bc93372663f3',
  'scorchhold-keep': 'f16d0f793d529f01',
  'grisel-hall': '4c0e390c5b4a33cc',
  'mine-deepgate-shaft': 'eece4ded5d36573d',
  'mine-old-galleries': 'fbf8461da5a425b5',
  'mine-lower-galleries': 'a651cc2146a41d43',
  'mine-weeping-bellows': 'd35a9f217d4e9ddd',
  'mine-deepdelve': 'bc3d501542978ab7',
};

/** 64-bit FNV-1a as two 32-bit halves, hex. */
function fnv(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const hashOf = (id: string): string => {
  const def = ALL_INTERIORS.find((d) => d.id === id);
  if (!def) throw new Error(`no interior ${id}`);
  const l = layoutInterior(def, () => 0);
  return fnv(JSON.stringify({ b: l.boxes, a: l.anchors, n: l.nav, bo: l.bounds, f: l.floorY }));
};

describe('shipped interiors are unchanged by the v0.7 interior fields', () => {
  it('pins every Act 1 and Act 2 interior', () => {
    const act3 = new Set(ACT3_INTERIORS.map((d) => d.id));
    const shipped = ALL_INTERIORS.map((d) => d.id).filter((id) => !act3.has(id));
    expect(shipped.sort()).toEqual(Object.keys(PINNED).sort());
  });
  for (const [id, hash] of Object.entries(PINNED)) {
    it(`${id} lays out exactly as before`, () => expect(hashOf(id)).toBe(hash));
  }
});
