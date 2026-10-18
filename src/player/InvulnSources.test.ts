import { describe, expect, it } from 'vitest';
import { InvulnSources } from './InvulnSources';

const make = () => {
  const actor = { invulnerable: false };
  return { actor, gate: new InvulnSources(actor) };
};

describe('InvulnSources', () => {
  it('starts vulnerable', () => {
    const { actor, gate } = make();
    expect(actor.invulnerable).toBe(false);
    expect(gate.active).toBe(false);
  });

  it('sets and clears the flag with a single source', () => {
    const { actor, gate } = make();
    gate.add('dodge');
    expect(actor.invulnerable).toBe(true);
    expect(gate.has('dodge')).toBe(true);
    gate.remove('dodge');
    expect(actor.invulnerable).toBe(false);
    expect(gate.has('dodge')).toBe(false);
  });

  it('adding the same source twice is idempotent', () => {
    const { actor, gate } = make();
    gate.add('dodge');
    gate.add('dodge');
    gate.remove('dodge');
    expect(actor.invulnerable).toBe(false);
  });

  it('removing an unknown source is a no-op', () => {
    const { actor, gate } = make();
    gate.remove('nothing');
    expect(actor.invulnerable).toBe(false);
    gate.add('dodge');
    gate.remove('nothing');
    expect(actor.invulnerable).toBe(true);
  });

  it('overlap: removing dodge first keeps secondWind', () => {
    const { actor, gate } = make();
    gate.add('dodge');
    gate.add('secondWind');
    gate.remove('dodge');
    expect(actor.invulnerable).toBe(true);
    gate.remove('secondWind');
    expect(actor.invulnerable).toBe(false);
  });

  it('overlap: removing secondWind first keeps dodge', () => {
    const { actor, gate } = make();
    gate.add('dodge');
    gate.add('secondWind');
    gate.remove('secondWind');
    expect(actor.invulnerable).toBe(true);
    gate.remove('dodge');
    expect(actor.invulnerable).toBe(false);
  });
});
