import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, STEWARD_GUARD, TELEGRAPH_STYLE, YARD_VETERAN } from '../enemies/defs';
import { ENEMY_STRINGS_EN } from '../enemies/strings.en';
import { KILL_XP_BASE } from '../progression/tuning';

describe('the steward-guard enemy kind (Deepgate\'s hall guards, A13\'s M20 stewards)', () => {
  it('is registered with a def, a telegraph style, a name and an XP row', () => {
    expect(ENEMY_DEFS['steward-guard']).toBe(STEWARD_GUARD);
    expect(TELEGRAPH_STYLE['steward-guard']).toBeDefined();
    expect(ENEMY_STRINGS_EN[STEWARD_GUARD.nameKey]).toBe('Steward Guard');
    expect(KILL_XP_BASE['steward-guard']).toBeGreaterThan(0);
  });

  it('fights (moves, not observer-only) at the Footman\'s full damage, not the yard veteran\'s sparring weight', () => {
    expect(STEWARD_GUARD.observerOnly).toBeUndefined();
    expect(STEWARD_GUARD.moves.length).toBeGreaterThan(0);
    const dmg = (d: typeof STEWARD_GUARD) => Math.max(...d.moves.map((m) => m.damage));
    expect(dmg(STEWARD_GUARD)).toBeGreaterThan(dmg(YARD_VETERAN));
  });

  it('gives no yield: sworn men do not surrender', () => {
    expect(STEWARD_GUARD.mercy).toBeUndefined();
  });

  it('wears Grisel green, apart from the Halvard-blue veteran', () => {
    const tint = STEWARD_GUARD.model.tint!;
    expect(tint).not.toBe(YARD_VETERAN.model.tint);
    const g = (tint >> 8) & 0xff;
    expect(g).toBeGreaterThan((tint >> 16) & 0xff);
    expect(g).toBeGreaterThan(tint & 0xff);
  });
});
