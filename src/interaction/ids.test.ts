import { describe, expect, it } from 'vitest';
import { FLAG_KEY } from '../state/WorldState';
import { flagKeyFor, parseInteractableId } from './ids';

describe('interactable ids', () => {
  it('parses kind and name', () => {
    expect(parseInteractableId('chest:bakery-barrel')).toEqual({ kind: 'chest', name: 'bakery-barrel' });
    expect(parseInteractableId('npc:edda_1')).toEqual({ kind: 'npc', name: 'edda_1' });
  });
  it.each(['', 'door', 'door:', ':x', 'Door:x', 'door:a b', 'door:a.b', 'door:a:b', 'door1:x'])('rejects %j', (id) => {
    expect(() => parseInteractableId(id)).toThrow(/Invalid interactable id/);
  });
  it('builds flag keys that pass FLAG_KEY', () => {
    expect(flagKeyFor('door:bakery', 'open')).toBe('door.bakery.open');
    expect(flagKeyFor('chest:bakery-barrel', 'opened')).toBe('chest.bakery-barrel.opened');
    expect(FLAG_KEY.test(flagKeyFor('door:bakery', 'open'))).toBe(true);
  });
  it('flagKeyFor throws on a bad id', () => {
    expect(() => flagKeyFor('bad', 'open')).toThrow();
  });
});
