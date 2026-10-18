import { describe, expect, it } from 'vitest';
import { ASSETS } from '../assets/AssetManifest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { NPC_DEFS } from './npcDefs';
import { NPC_STRINGS_EN } from './strings.en';

describe('NPC_DEFS', () => {
  it('has a def for every layout npc and nothing else', () => {
    expect(NPC_DEFS.map((d) => d.id).sort()).toEqual(BRIGHTWATER_LAYOUT.npcs.map((n) => n.id).sort());
  });
  it('every layout npc post is an anchor of the layout', () => {
    const anchors = new Set(BRIGHTWATER_LAYOUT.anchors.map((a) => a.id));
    for (const n of BRIGHTWATER_LAYOUT.npcs) expect(anchors.has(n.post), n.id).toBe(true);
  });
  it('model ids exist in ASSETS and name keys in the string table', () => {
    for (const d of NPC_DEFS) {
      expect(ASSETS, d.id).toHaveProperty(d.model);
      expect(NPC_STRINGS_EN[d.nameKey], d.id).toBeTruthy();
      expect(d.nameKey).toBe(`npc.${d.id}.name`);
      expect(d.dialogueId).toBe(`npc-${d.id}`);
    }
  });
  it('matches the design names and models', () => {
    const by = Object.fromEntries(NPC_DEFS.map((d) => [d.id, d]));
    expect(NPC_STRINGS_EN['npc.stane.name']).toBe('Marshal Osric Stane');
    expect(by.edda.model).toBe('rogueHooded');
    expect(by.wynn.scale).toBe(0.95);
    expect(by.gaut.tint).not.toBeNull();
    expect(NPC_STRINGS_EN['npc.silent']).toBe('They have nothing to say yet.');
  });
});
