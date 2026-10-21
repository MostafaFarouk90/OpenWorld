import { describe, expect, it } from 'vitest';
import { GameEvents } from '../core/events';
import { FlagGates } from '../state/FlagGates';
import { WorldState } from '../state/WorldState';
import { ACT2_POI_PLACEMENTS } from '../world/poi/placement.act2';
import { discoveredFlag, takenFlag } from '../world/poi/content';
import { act2PoiSites, createMapSources } from './MapSources';
import { MAP_STRINGS_EN } from './strings.en';

function make(anchors: Record<string, { x: number; z: number }> = {}) {
  const events = new GameEvents(() => {});
  const state = new WorldState(events, () => {});
  const gates = new FlagGates(state, events, () => {});
  const t = (k: string, p?: Record<string, string | number>) => (MAP_STRINGS_EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]));
  const src = createMapSources({ gates, events, service: () => undefined, flag: (k) => state.getBool(k), anchor: (id) => anchors[id] }, t);
  return { state, src, events };
}

describe('Act 2 POI markers', () => {
  it('lists every placement with a finite world position', () => {
    const sites = act2PoiSites();
    expect(sites).toHaveLength(ACT2_POI_PLACEMENTS.length);
    for (const s of sites) expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
  });

  it('hides a POI before it is discovered and shows it after', () => {
    const { state, src } = make();
    expect(src.a2Pois()).toEqual([]);
    state.setFlag(discoveredFlag('camp-1'), true);
    const pois = src.a2Pois();
    expect(pois).toHaveLength(1);
    expect(pois[0]!.id).toBe('poi.a2.camp-1');
    expect(pois[0]!.label).toBe('Roadside camp');
  });

  it('marks an emptied POI once taken', () => {
    const { state, src } = make();
    state.setFlag(discoveredFlag('cave-1'), true);
    state.setFlag(takenFlag('cave-1'), true);
    expect(src.a2Pois()[0]!.label).toBe('Cave mouth (emptied)');
  });

  it('a taken flag without discovery shows nothing', () => {
    const { state, src } = make();
    state.setFlag(takenFlag('cave-1'), true);
    expect(src.a2Pois()).toEqual([]);
  });

  it('without a flag reader nothing is drawn, and a throwing reader is survived', () => {
    const events = new GameEvents(() => {});
    const state = new WorldState(events, () => {});
    const gates = new FlagGates(state, events, () => {});
    expect(createMapSources({ gates, events, service: () => undefined }).a2Pois()).toEqual([]);
    const bad = createMapSources({ gates, events, service: () => undefined, flag: () => { throw new Error('x'); } });
    expect(bad.a2Pois()).toEqual([]);
  });

  it('survives a load: flags set by a save show without events', () => {
    const { state, src, events } = make();
    state.load({ flags: { [discoveredFlag('vista-1')]: true } });
    events.emit('save.loaded', { slot: 't' });
    expect(src.a2Pois().map((p) => p.id)).toEqual(['poi.a2.vista-1']);
  });
});

describe('lit shrine from an anchor', () => {
  it('the Hushed Anvil marker uses the published anchor once lit', () => {
    const { state, src } = make({ 'cinderreach.hushed-anvil.site': { x: 17000, z: 1200 } });
    expect(src.litShrines().map((s) => s.id)).toEqual([]);
    state.setFlag('shrine.hushed-anvil.lit', true);
    expect(src.litShrines()).toEqual([{ id: 'shrine.hushed-anvil', x: 17000, z: 1200, label: 'Hushed Anvil' }]);
  });

  it('no marker if the anchor is missing', () => {
    const { state, src } = make();
    state.setFlag('shrine.hushed-anvil.lit', true);
    expect(src.litShrines()).toEqual([]);
  });
});
