// K15 PR 1 on the map: the Act 3 region chips and forge marks (already on main, pinned here) and the block chips in the view.
import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../../core/events';
import { flagConditionHolds } from '../../core/flagCondition';
import { REGION_IDS, REGION_INFO, type RegionId } from '../../region/regions';
import { FlagGates } from '../../state/FlagGates';
import { WorldState } from '../../state/WorldState';
import { SHRINE_POSITIONS } from '../ForgeMarks';
import { FogGrid, buildMarkers } from '../MapModel';
import { createMapSources } from '../MapSources';
import { createMapModal } from '../MapView';
import { regionChips } from '../regionLayer';
import { MAP_STRINGS_EN } from '../strings.en';
import { DEFAULT_WORLD_BOUNDS } from '../tuning';
import type { MapViewModel } from '../viewTypes';
import type { BlockChip } from './blockChips';
import { MAP_ACT3_STRINGS_EN } from './strings.en';

const TEXT: Record<string, string> = { ...MAP_STRINGS_EN, ...MAP_ACT3_STRINGS_EN };
const t = (k: string, p?: Record<string, string | number>) => (TEXT[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]));

/** The regions the containment service would list for these flags (its own rule). */
function openFor(flags: Record<string, boolean>): RegionId[] {
  const events = new GameEvents(() => {});
  const state = new WorldState(events, () => {});
  state.load({ flags });
  return REGION_IDS.filter((id) => !REGION_INFO[id].reserved && flagConditionHolds(REGION_INFO[id].openWhen, state));
}
const names = (open: RegionId[]) => regionChips(open).map((c) => [c.id, t(c.labelKey)] as const);

describe('Act 3 region chips', () => {
  it("before story.gate.a3 the Greyfen and the Dragonspine read 'Unknown lands'", () => {
    const open = openFor({ 'story.d03.complete': true });
    expect(open).not.toContain('greyfen');
    const byId = Object.fromEntries(names(open));
    expect(byId.greyfen).toBe('Unknown lands');
    expect(byId.dragonspine).toBe('Unknown lands');
  });

  it('the gate names the Greyfen; the Dragonspine waits for its phase hold, then both are named', () => {
    const gate = Object.fromEntries(names(openFor({ 'story.gate.a3': true })));
    expect(gate.greyfen).toBe('The Greyfen');
    expect(gate.dragonspine).toBe('Unknown lands');
    const both = Object.fromEntries(names(openFor({ 'story.gate.a3': true, 'story.phase.dragonspineOpen': true })));
    expect(both.greyfen).toBe('The Greyfen');
    expect(both.dragonspine).toBe('The Dragonspine');
  });

  it('both Act 3 boxes lie inside the map bounds', () => {
    const b = DEFAULT_WORLD_BOUNDS;
    for (const c of regionChips(['greyfen', 'dragonspine']).filter((c) => c.id === 'greyfen' || c.id === 'dragonspine')) {
      expect(c.x).toBeGreaterThan(b.minX);
      expect(c.x).toBeLessThan(b.maxX);
      expect(c.z).toBeGreaterThan(b.minZ);
      expect(c.z).toBeLessThan(b.maxZ);
    }
  });
});

describe('Act 3 forge marks', () => {
  const make = (services: Record<string, unknown> = {}) => {
    const events = new GameEvents(() => {});
    const state = new WorldState(events, () => {});
    const gates = new FlagGates(state, events, () => {});
    return { state, src: createMapSources({ gates, events, service: (n) => services[n] }, t) };
  };
  const ACT3 = ['hathrens-mere', 'last-anvil', 'wyrms-hearth'] as const;

  it("lighting each Act 3 shrine lights its mark and draws its marker at the shrine's position", () => {
    for (const id of ACT3) {
      const { state, src } = make();
      expect(src.forge().marks.find((m) => m.id === id)!.lit).toBe(false);
      expect(src.litShrines().map((s) => s.id)).not.toContain(`shrine.${id}`);
      state.setFlag(`shrine.${id}.lit`, true);
      expect(src.forge().marks.find((m) => m.id === id)!.lit).toBe(true);
      const marker = src.litShrines().find((s) => s.id === `shrine.${id}`)!;
      expect(marker).toMatchObject({ x: SHRINE_POSITIONS[id]!.x, z: SHRINE_POSITIONS[id]!.z });
      expect(marker.label).toBe(t(`map.shrine.${id}`));
      expect(marker.label).not.toBe(`map.shrine.${id}`);
    }
  });

  it('the tier follows the warmth service, not the count of lit marks', () => {
    const warmth = { tier: () => 3 };
    const { state, src } = make({ warmth });
    for (const id of ACT3) state.setFlag(`shrine.${id}.lit`, true);
    expect(src.forge().tier).toBe(3);
    warmth.tier = () => 5;
    expect(src.forge().tier).toBe(5);
  });

  it('a lit Act 3 shrine survives a load (flags only)', () => {
    const events = new GameEvents(() => {});
    const state = new WorldState(events, () => {});
    const gates = new FlagGates(state, events, () => {});
    const src = createMapSources({ gates, events, service: () => undefined }, t);
    state.load({ flags: { 'shrine.last-anvil.lit': true } });
    events.emit('save.loaded', { slot: 't' });
    expect(src.forge().marks.filter((m) => m.lit).map((m) => m.id)).toEqual(['last-anvil']);
  });
});

// ---- the block chips in the view

function fakeEl(tag = 'div'): any {
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], width: 0, height: 0 };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => {};
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.setAttribute = () => {};
  if (tag === 'canvas') {
    const calls: Array<[string, unknown[]]> = [];
    const ctx: any = { calls, measureText: (s: string) => ({ width: s.length * 7 }) };
    for (const n of ['clearRect', 'fillRect', 'drawImage', 'putImageData', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'clip']) ctx[n] = (...a: unknown[]) => void calls.push([n, a]);
    // fillText records the fillStyle in force, so the tone colour is observable.
    ctx.fillText = (...a: unknown[]) => void calls.push(['fillText', [...a, ctx.fillStyle]]);
    ctx.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
    el.ctx = ctx;
    el.getContext = () => ctx;
  }
  return el;
}

const chip = (over: Partial<BlockChip> = {}): BlockChip => ({
  block: 'greyfen', x: 4000, z: 13500, level: 23, top: 28, locked: false, tone: 'orange', textKey: 'map.block.preview', params: { level: 23, player: 21 }, here: false, ...over,
});

function modal(blocks?: () => BlockChip[]) {
  const fog = FogGrid.forBounds(DEFAULT_WORLD_BOUNDS);
  const model: MapViewModel = {
    bounds: DEFAULT_WORLD_BOUNDS,
    fullBitmap: () => null,
    minimapTile: () => null,
    fog: () => fog,
    markers: () => buildMarkers({ waystones: [] }),
    player: () => ({ x: 0, z: 0, yaw: 0 }),
    regions: () => regionChips(['brightwater', 'harrowmark', 'greyfen']),
    travelBlockedReason: () => null,
    travel: vi.fn(),
    t,
  };
  if (blocks) model.blocks = blocks;
  const created: any[] = [];
  const doc = { createElement: (tag: string) => { const e = fakeEl(tag); created.push(e); return e; } } as any;
  const w = createMapModal({ model, close: () => {}, doc });
  const canvas = created.find((e) => e.tag === 'canvas');
  const warn = created.find((e) => e.className === 'map-modal__block-warning');
  const drawn = () => (canvas.ctx.calls as Array<[string, unknown[]]>).filter((c) => c[0] === 'fillText').map((c) => [c[1][0], c[1][3]] as [string, string]);
  return { w, canvas, warn, drawn };
}

describe('block chips in the map view', () => {
  it('draws the chip text under the region label, in the tone colour', () => {
    const { w, drawn } = modal(() => [chip(), chip({ block: 'dragonspine-lower', locked: true, tone: 'red', textKey: 'map.block.locked', params: { level: 25, top: 27 }, x: 14000 })]);
    w.update(1);
    const d = drawn();
    expect(d).toContainEqual(['Tuned for level 23. You are level 21.', '#f0902c']);
    expect(d).toContainEqual(['Level 25 to 27', '#e0483c']);
    // The region label is still drawn, before the chip.
    expect(d.findIndex(([s]) => s === 'The Greyfen')).toBeLessThan(d.findIndex(([s]) => s.startsWith('Tuned')));
  });

  it('gold tone, and an unknown tone falls back to gold', () => {
    const { w, drawn } = modal(() => [chip({ tone: 'gold' }), chip({ tone: 'plaid' as never, block: 'dragonspine-lower' })]);
    w.update(1);
    expect(drawn().filter(([s]) => s.startsWith('Tuned')).map(([, c]) => c)).toEqual(['#e8c860', '#e8c860']);
  });

  it('a view without block data (or an empty list) draws no chip and still draws', () => {
    for (const blocks of [undefined, () => []]) {
      const { w, drawn } = modal(blocks);
      expect(() => w.update(1)).not.toThrow();
      expect(drawn().some(([s]) => s.startsWith('Tuned') || s.startsWith('Level '))).toBe(false);
    }
  });

  it('the legend shows the warning while the player stands in an unstarted block, and clears when it is locked or left', () => {
    let chips: BlockChip[] = [chip({ here: true })];
    const { w, warn } = modal(() => chips);
    w.update(1);
    expect(warn.style.display).toBe('block');
    expect(warn.textContent).toBe('Tuned for level 23. You are level 21.');
    expect(warn.style.color).toBe('#f0902c');
    chips = [chip({ here: true, locked: true, textKey: 'map.block.locked', params: { level: 23, top: 28 } })];
    w.update(1);
    expect(warn.style.display).toBe('none');
    expect(warn.textContent).toBe('');
    chips = [chip({ here: false })];
    w.update(1);
    expect(warn.style.display).toBe('none');
  });

  it('the legend warning follows a level up (tone and text) while the player stays', () => {
    let chips: BlockChip[] = [chip({ here: true })];
    const { w, warn } = modal(() => chips);
    w.update(1);
    chips = [chip({ here: true, level: 23, tone: 'gold', params: { level: 23, player: 24 } })];
    w.update(1);
    expect(warn.textContent).toBe('Tuned for level 23. You are level 24.');
    expect(warn.style.color).toBe('#e8c860');
  });
});
