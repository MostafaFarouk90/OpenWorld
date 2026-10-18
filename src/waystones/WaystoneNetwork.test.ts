import { describe, expect, it, vi } from 'vitest';
import { SafeTeleport } from './SafeTeleport';
import { WaystoneNetwork, type AnchorLike, type NetworkPorts, type WaystoneContext } from './WaystoneNetwork';

const A = (id: string, x: number, z: number, tags: string[] = ['waystone']): AnchorLike => ({
  id,
  position: { x, y: 0, z },
  yaw: 0,
  tags,
});

function make(anchors: AnchorLike[], ctxOver: Partial<WaystoneContext> = {}) {
  const ctx: WaystoneContext = {
    dead: false,
    cutscene: false,
    dialogue: false,
    hostileAggro: false,
    heartshard: true,
    allowRestInCombat: false,
    ...ctxOver,
  };
  const events: Array<[string, Record<string, unknown>]> = [];
  const flags: Record<string, boolean> = {};
  let feet = { x: 0, y: 0, z: 0 };
  const placed: Array<{ x: number; z: number }> = [];
  const teleport = new SafeTeleport({
    place: (f) => {
      placed.push({ x: f.x, z: f.z });
      feet = { ...f };
    },
    freeze: () => () => undefined,
    ready: () => true,
    groundedBelow: () => true,
    chunksResident: () => true,
    fade: () => undefined,
    heightAt: () => 0,
  });
  const ports: NetworkPorts = {
    anchors: {
      withTag: (t) => anchors.filter((a) => a.tags?.includes(t)),
      find: (id) => anchors.find((a) => a.id === id),
    },
    emit: (e, p) => events.push([e, p]),
    setFlag: (k, v) => {
      flags[k] = v;
    },
    context: () => ctx,
    restoreVitals: vi.fn(),
    requestSave: vi.fn(),
    toast: vi.fn(),
    playerFeet: () => feet,
    teleport,
    log: vi.fn(),
  };
  const net = new WaystoneNetwork(ports);
  const pump = async (p: Promise<unknown>) => {
    for (let i = 0; i < 400; i++) teleport.update(1 / 60);
    return p;
  };
  return { net, ports, ctx, events, flags, placed, teleport, pump, setFeet: (v: typeof feet) => (feet = v) };
}

const STD = () => [
  A('waystone.chapel', 82, 52),
  A('waystone.kettlewick', 12, 150, ['waystone', 'waystone-lit']),
  A('brightwater.player-spawn', 0, 0, []),
];

describe('WaystoneNetwork definitions', () => {
  it('lists ids from tagged anchors; no anchors means empty, no throw', () => {
    expect(make(STD()).net.ids().sort()).toEqual(['chapel', 'kettlewick']);
    expect(make([]).net.ids()).toEqual([]);
  });

  it('applyPreLit lights waystone-lit stones silently with a flag mirror', () => {
    const { net, events, flags } = make(STD());
    net.applyPreLit();
    expect(net.isLit('kettlewick')).toBe(true);
    expect(net.isLit('chapel')).toBe(false);
    expect(flags['waystone.kettlewick.lit']).toBe(true);
    expect(events).toEqual([]);
  });
});

describe('rekindle', () => {
  it('lights the stone, emits events once, sets respawn and requests a save', () => {
    const { net, events, flags, ports } = make(STD());
    expect(net.rekindle('chapel')).toEqual({ ok: true });
    expect(events).toEqual([
      ['waystone.rekindled', { waystoneId: 'chapel', cause: 'player' }],
      ['discover', { placeId: 'waystone.chapel', kind: 'waystone' }],
    ]);
    expect(flags['waystone.chapel.lit']).toBe(true);
    expect(net.respawnPoint().waystoneId).toBe('chapel');
    expect(ports.requestSave).toHaveBeenCalledWith('waystone');
  });

  it('is a no-op the second time and for unknown ids', () => {
    const { net, events } = make(STD());
    net.rekindle('chapel');
    events.length = 0;
    expect(net.rekindle('chapel')).toEqual({ ok: false, reason: 'already-lit' });
    expect(net.rekindle('nowhere')).toEqual({ ok: false, reason: 'unknown' });
    expect(events).toEqual([]);
  });

  it('refuses without the Heartshard flag for a player, allows a script', () => {
    const { net, ports } = make(STD(), { heartshard: false });
    expect(net.rekindle('chapel')).toEqual({ ok: false, reason: 'cold' });
    expect(ports.toast).toHaveBeenCalledWith('waystone.cold');
    expect(net.rekindle('chapel', 'script')).toEqual({ ok: true });
  });

  it.each([['dead'], ['cutscene'], ['dialogue']] as const)('refuses while %s', (k) => {
    const { net } = make(STD(), { [k]: true });
    expect(net.rekindle('chapel')).toEqual({ ok: false, reason: k });
  });
});

describe('rest', () => {
  it('requires a lit stone', () => {
    expect(make(STD()).net.rest('chapel')).toEqual({ ok: false, reason: 'not-lit' });
    expect(make(STD()).net.rest('zzz')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('heals, emits rest, sets respawn, saves; never emits burn events itself', () => {
    const { net, events, ports } = make(STD());
    net.rekindle('chapel');
    events.length = 0;
    expect(net.rest('chapel')).toEqual({ ok: true });
    expect(ports.restoreVitals).toHaveBeenCalledOnce();
    expect(events).toEqual([['rest', { waystoneId: 'chapel' }]]);
    expect(ports.requestSave).toHaveBeenLastCalledWith('rest');
  });

  it('is refused near hostile aggro unless waived', () => {
    const a = make(STD(), { hostileAggro: true });
    a.net.rekindle('chapel');
    expect(a.net.rest('chapel')).toEqual({ ok: false, reason: 'in-combat' });
    expect(a.ports.restoreVitals).not.toHaveBeenCalled();
    const b = make(STD(), { hostileAggro: true, allowRestInCombat: true });
    b.net.rekindle('chapel');
    expect(b.net.rest('chapel')).toEqual({ ok: true });
  });

  it.each([['dead'], ['cutscene'], ['dialogue']] as const)('refuses while %s', (k) => {
    const { net, ctx } = make(STD());
    net.rekindle('chapel');
    ctx[k] = true;
    expect(net.rest('chapel')).toEqual({ ok: false, reason: k });
  });
});

describe('respawn point', () => {
  it('falls back to brightwater.player-spawn when nothing is lit, never null', () => {
    const { net } = make(STD());
    expect(net.respawnPoint()).toEqual({ waystoneId: null, feet: { x: 0, y: 0, z: 0 }, yaw: 0 });
  });

  it('falls back to the origin with a warning when even the spawn anchor is missing', () => {
    const { net, ports } = make([]);
    expect(net.respawnPoint().feet).toEqual({ x: 0, y: 0, z: 0 });
    expect(ports.log).toHaveBeenCalled();
  });

  it('uses the last rested or rekindled stone; respawnPlayer teleports there', async () => {
    const { net, placed, pump } = make(STD());
    net.rekindle('chapel');
    net.applyPreLit();
    net.rest('kettlewick');
    expect(net.respawnPoint().waystoneId).toBe('kettlewick');
    await pump(net.respawnPlayer());
    expect(placed.at(-1)).toEqual({ x: 12, z: 150 });
  });

  it('ignores a respawn id whose anchor disappeared', () => {
    const { net } = make(STD());
    net.load({ lit: ['gone'], lastRest: 'gone', respawn: 'gone' });
    expect(net.respawnPoint().waystoneId).toBeNull();
  });
});

describe('fast travel', () => {
  it('T14: chapel to Kettlewick and back with Kettlewick pre-lit', async () => {
    const { net, events, pump, placed, setFeet } = make(STD());
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 82, y: 0, z: 52 });
    events.length = 0;
    await expect(pump(net.travel('kettlewick'))).resolves.toEqual({ ok: true });
    expect(placed.at(-1)).toEqual({ x: 12, z: 150 });
    expect(events).toEqual([['fastTravel', { fromId: 'chapel', toId: 'kettlewick' }]]);
    await expect(pump(net.travel('chapel'))).resolves.toEqual({ ok: true });
    expect(placed.at(-1)).toEqual({ x: 82, z: 52 });
  });

  it('rejects unknown, unlit, same, combat, dialogue, cutscene, dead', async () => {
    const { net, ctx, setFeet } = make(STD());
    net.applyPreLit();
    expect(await net.travel('zzz')).toEqual({ ok: false, reason: 'unknown' });
    expect(await net.travel('chapel')).toEqual({ ok: false, reason: 'not-lit' });
    setFeet({ x: 12, y: 0, z: 150 });
    expect(await net.travel('kettlewick')).toEqual({ ok: false, reason: 'same' });
    setFeet({ x: 82, y: 0, z: 52 });
    for (const [k, r] of [
      ['hostileAggro', 'in-combat'],
      ['dialogue', 'dialogue'],
      ['cutscene', 'cutscene'],
      ['dead', 'dead'],
    ] as const) {
      ctx[k] = true;
      expect(await net.travel('kettlewick')).toEqual({ ok: false, reason: r });
      ctx[k] = false;
    }
  });

  it('a second travel while one is running reports busy and only one teleport happens', async () => {
    const { net, placed, pump, setFeet } = make(STD());
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 82, y: 0, z: 52 });
    const first = net.travel('kettlewick');
    expect(await net.travel('chapel')).toEqual({ ok: false, reason: 'busy' });
    await pump(first);
    expect(placed.length).toBe(1);
  });

  it('reports terrain-not-ready and does not emit fastTravel when the teleport fails', async () => {
    const anchors = STD();
    const ev: string[] = [];
    const { net, events, pump, setFeet, teleport } = make(anchors);
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 82, y: 0, z: 52 });
    vi.spyOn(teleport, 'start').mockResolvedValue({ ok: false, reason: 'terrain-not-ready' });
    events.length = 0;
    await expect(pump(net.travel('kettlewick'))).resolves.toEqual({ ok: false, reason: 'terrain-not-ready' });
    expect(events.map((e) => e[0])).not.toContain('fastTravel');
    expect(ev).toEqual([]);
  });

  it('can travel again after a failure (busy flag cleared)', async () => {
    const { net, setFeet, teleport, pump } = make(STD());
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 82, y: 0, z: 52 });
    const spy = vi.spyOn(teleport, 'start').mockResolvedValueOnce({ ok: false, reason: 'terrain-not-ready' });
    await net.travel('kettlewick');
    spy.mockRestore();
    await expect(pump(net.travel('kettlewick'))).resolves.toEqual({ ok: true });
  });
});

describe('persistence', () => {
  it('round trips and sets flag mirrors without emitting events', () => {
    const a = make(STD());
    a.net.rekindle('chapel');
    a.net.rest('chapel');
    const saved = a.net.serialize();
    expect(saved).toEqual({ lit: ['chapel'], lastRest: 'chapel', respawn: 'chapel' });
    const b = make(STD());
    b.net.load(saved);
    expect(b.net.isLit('chapel')).toBe(true);
    expect(b.flags['waystone.chapel.lit']).toBe(true);
    expect(b.events).toEqual([]);
    expect(b.ports.requestSave).not.toHaveBeenCalled();
  });

  it('ignores garbage but keeps unknown ids verbatim for write back', () => {
    const { net } = make(STD());
    net.load('nope');
    net.load(null);
    net.load({ lit: [1, null, 'x'.repeat(100), 'future-stone', 'chapel'], lastRest: 4 });
    expect(net.serialize().lit).toEqual(['chapel', 'future-stone', 'kettlewick']);
    expect(net.isLit('future-stone')).toBe(false);
    expect(net.litIds()).toEqual(['chapel', 'kettlewick']);
  });

  it('reapplies pre-lit stones after load', () => {
    const { net } = make(STD());
    net.load({ lit: [], lastRest: null, respawn: null });
    expect(net.isLit('kettlewick')).toBe(true);
  });
});

describe('review fixes', () => {
  it('rejects malformed waystone ids in a save without throwing or half-loading', () => {
    const { net, flags } = make(STD());
    expect(() => net.load({ lit: ['bad id', 'chapel', 'a.b', '../x'], lastRest: 'no spaces', respawn: 'chapel' })).not.toThrow();
    expect(net.serialize().lit).toEqual(['chapel', 'kettlewick']);
    expect(net.serialize().lastRest).toBeNull();
    expect(flags['waystone.chapel.lit']).toBe(true);
  });

  it('the travel fallback is where the player stood, not the nearest stone', async () => {
    const { net, teleport, setFeet } = make(STD());
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 500, y: 3, z: -40 });
    const spy = vi.spyOn(teleport, 'start').mockResolvedValue({ ok: true });
    await net.travel('kettlewick');
    expect(spy.mock.calls[0][2]).toEqual({ feet: { x: 500, y: 3, z: -40 }, yaw: 0 });
  });

  it('a respawn takes over a travel in flight', async () => {
    const { net, teleport, setFeet, placed, pump } = make(STD());
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 82, y: 0, z: 52 });
    const travel = net.travel('kettlewick');
    teleport.update(0.1);
    const respawn = net.respawnPlayer();
    await expect(travel).resolves.toEqual({ ok: false, reason: 'busy' });
    await pump(respawn);
    expect(placed.at(-1)).toEqual({ x: 82, z: 52 }); // the chapel was rekindled last
  });

  it('travel arrival does not move the respawn point', async () => {
    const { net, pump, setFeet } = make(STD());
    net.applyPreLit();
    net.rekindle('chapel');
    setFeet({ x: 82, y: 0, z: 52 });
    await pump(net.travel('kettlewick'));
    expect(net.respawnPoint().waystoneId).toBe('chapel');
  });
});

describe('restAt (the inn)', () => {
  it('heals, saves and emits only a placeId; the respawn point does not move', () => {
    const { net, events, ports } = make(STD());
    net.rekindle('chapel');
    const before = net.respawnPoint();
    events.length = 0;
    expect(net.restAt('inn.tilted-anvil')).toEqual({ ok: true });
    expect(ports.restoreVitals).toHaveBeenCalledWith({ quiet: true });
    expect(events).toEqual([['rest', { placeId: 'inn.tilted-anvil' }]]);
    expect(ports.requestSave).toHaveBeenLastCalledWith('rest');
    expect(net.respawnPoint()).toEqual(before);
  });

  it('needs no lit waystone', () => {
    expect(make(STD()).net.restAt('inn.tilted-anvil')).toEqual({ ok: true });
  });

  it.each([['dead'], ['cutscene'], ['dialogue']] as const)('refuses while %s and heals nothing', (k) => {
    const { net, ctx, ports } = make(STD());
    ctx[k] = true;
    expect(net.canRestNow()).toBe(k);
    expect(net.restAt('inn.tilted-anvil')).toEqual({ ok: false, reason: k });
    expect(ports.restoreVitals).not.toHaveBeenCalled();
  });

  it('is refused near hostiles unless waived', () => {
    const a = make(STD(), { hostileAggro: true });
    expect(a.net.restAt('inn.tilted-anvil')).toEqual({ ok: false, reason: 'in-combat' });
    expect(a.net.canRestNow()).toBe('in-combat');
    const b = make(STD(), { hostileAggro: true, allowRestInCombat: true });
    expect(b.net.canRestNow()).toBeNull();
  });
});
