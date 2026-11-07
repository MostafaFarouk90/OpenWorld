// v0.9 item 6: the favour snapshot (`WorldState.snapshotFavour`) and its readers (`bandAt`, `snapshotValue`, `highestTrack`).
import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { ACT5_SNAPSHOTS, FAVOUR_TRACKS, bandAt, highestTrack, snapshotFlag, snapshotTaken, snapshotValue } from './favour';
import { WorldState } from './WorldState';

function make() {
  const warn = vi.fn();
  const ws = new WorldState(new GameEvents(() => {}), warn);
  return { ws, warn };
}
/** Sets live favour to the five values (track order halvard / oswin / grisel / dragons / ashwalkers). */
function setFive(ws: WorldState, five: readonly number[]): void {
  FAVOUR_TRACKS.forEach((t, i) => ws.addFavour(t, five[i] - ws.favour(t), 'script'));
}

describe('favour.snapshot (item 6)', () => {
  it('names the three Act 5 snapshots', () => {
    expect([...ACT5_SNAPSHOTS]).toEqual(['m52', 'd09', 'm56']);
    expect(snapshotFlag('m52', 'halvard')).toBe('favour.snapshot.m52.halvard');
  });
  it("snapshot('m52') copies the five tracks once; a second call changes nothing and returns false", () => {
    const { ws } = make();
    setFive(ws, [71, 20, 25, 10, 19]);
    expect(snapshotTaken(ws, 'm52')).toBe(false);
    expect(ws.snapshotFavour('m52')).toBe(true);
    setFive(ws, [10, 90, 90, 90, 90]);
    expect(ws.snapshotFavour('m52')).toBe(false);
    expect(FAVOUR_TRACKS.map((t) => snapshotValue(ws, 'm52', t))).toEqual([71, 20, 25, 10, 19]);
  });
  it('a later favour change does not move bandAt', () => {
    const { ws } = make();
    setFive(ws, [71, 20, 25, 10, 19]);
    ws.snapshotFavour('m52');
    expect(bandAt(ws, 'm52', 'halvard')).toBe('hearthbound');
    ws.addFavour('halvard', -60, 'quest');
    expect(ws.favourBand('halvard')).toBe('cold');
    expect(bandAt(ws, 'm52', 'halvard')).toBe('hearthbound');
    expect(bandAt(ws, 'm52', 'oswin')).toBe('cold');
  });
  it('is saved with the world state and loads back', () => {
    const a = make();
    setFive(a.ws, [21, 52, 34, 51, 53]);
    a.ws.snapshotFavour('m52');
    const b = make();
    b.ws.load(JSON.parse(JSON.stringify(a.ws.serialize())));
    expect(FAVOUR_TRACKS.map((t) => snapshotValue(b.ws, 'm52', t))).toEqual([21, 52, 34, 51, 53]);
    expect(b.ws.snapshotFavour('m52')).toBe(false);
    expect(bandAt(b.ws, 'm52', 'oswin')).toBe('stoked');
  });
  it('before it is taken, or for an unknown track, the readers answer undefined', () => {
    const { ws } = make();
    expect(bandAt(ws, 'm52', 'halvard')).toBeUndefined();
    expect(snapshotValue(ws, 'm52', 'halvard')).toBeUndefined();
    expect(highestTrack(ws, 'm52')).toBeUndefined();
    ws.snapshotFavour('m52');
    expect(snapshotValue(ws, 'm52', 'nope' as never)).toBeUndefined();
  });
  it('an invalid id is refused with a warning', () => {
    const { ws, warn } = make();
    expect(ws.snapshotFavour('a.b')).toBe(false);
    expect(ws.snapshotFavour('')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('highestTrack names the top track, or a tie', () => {
    const { ws } = make();
    setFive(ws, [17, 56, 34, 51, 61]);
    ws.snapshotFavour('m56');
    expect(highestTrack(ws, 'm56')).toBe('ashwalkers');
    setFive(ws, [60, 60, 1, 1, 1]);
    ws.snapshotFavour('d09');
    expect(highestTrack(ws, 'd09')).toBe('tie');
  });
});
