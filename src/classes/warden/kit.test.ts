import { describe, expect, it } from 'vitest';
import { CLASSES_STRINGS_EN } from '../strings.en';
import { DEFAULT_KITS } from '../kits';
import { WARDEN_DRILL, WARDEN_KIT } from './kit';
import { WARDEN_CODEX_ENTRIES, WARDEN_CODEX_STRINGS_EN, WARDEN_STRINGS_EN } from './strings.en';

describe('Warden kit', () => {
  it('keeps thread 12\'s model, weapons, trainer and starter set; only the drill is its own', () => {
    expect(WARDEN_KIT).toEqual({ ...DEFAULT_KITS.warden, drill: WARDEN_DRILL });
    expect(WARDEN_KIT.trainer.npcId).toBe('stane');
    expect(WARDEN_KIT.model).toBe('barbarian');
    expect(WARDEN_KIT.mainhand.embedded).toBe('2H_Axe');
    expect(WARDEN_KIT.offhand).toBeNull();
  });

  it('drill steps are unique, positive, cover the keys 1 to 4, and block and dodge have a spar', () => {
    expect(new Set(WARDEN_DRILL.map((s) => s.id)).size).toBe(WARDEN_DRILL.length);
    expect(WARDEN_DRILL.map((s) => s.mechanic)).toEqual(['attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'skills', 'ability']);
    for (const s of WARDEN_DRILL) expect(s.count).toBeGreaterThanOrEqual(1);
    expect(WARDEN_DRILL.find((s) => s.id === 'block')?.spar?.spawnerId).toBe('classes.drill.blocker');
    expect(WARDEN_DRILL.find((s) => s.id === 'dodge')?.spar?.spawnerId).toBe('classes.drill.dodge');
  });

  it('every step has a Warden text, so no default text with the wrong count shows', () => {
    for (const s of WARDEN_DRILL) {
      const key = s.textKey ?? `classes.drill.warden.${s.id}`;
      expect(WARDEN_STRINGS_EN[key], key).toBeTruthy();
      expect(CLASSES_STRINGS_EN[`classes.drill.default.${s.id}`]).toBeTruthy();
    }
  });

  it('the codex entries have strings for name and body', () => {
    for (const e of WARDEN_CODEX_ENTRIES) {
      expect(WARDEN_CODEX_STRINGS_EN[e.nameKey]).toBeTruthy();
      expect(WARDEN_CODEX_STRINGS_EN[e.bodyKey]).toBeTruthy();
    }
  });
});
