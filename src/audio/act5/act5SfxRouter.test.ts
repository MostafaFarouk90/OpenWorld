import { describe, expect, it } from 'vitest';
import { Act5SfxRouter } from './act5SfxRouter';

function setup(opts: { audio?: boolean; lava?: number | null; vent?: number | null; throws?: boolean } = { audio: true }) {
  const played: string[] = [];
  const playedAt: string[] = [];
  const attached: string[] = [];
  const detached: number[] = [];
  const audio = {
    play: (k: string) => {
      if (opts.throws) throw new Error('suspended');
      played.push(k);
    },
    playAt: (k: string) => void playedAt.push(k),
    attach: (k: string) => (attached.push(k), attached.length),
    detach: (id: number) => void detached.push(id),
  };
  const dist = { lava: opts.lava ?? null, vent: opts.vent ?? null };
  const router = new Act5SfxRouter({
    audio: () => (opts.audio === false ? undefined : audio),
    actorAt: (id) => (id === 'known' ? { x: 1, y: 2, z: 3 } : undefined),
    playerObject: () => ({}),
    lavaDistance: () => dist.lava,
    ventDistance: () => dist.vent,
  });
  return { router, played, playedAt, attached, detached, dist };
}

describe('Act 5 SFX router', () => {
  it('plays the lava, vent and siege sounds from their events', () => {
    const f = setup();
    f.router.lavaEntered();
    f.router.lavaThrown();
    f.router.ventOpened();
    f.router.ventClosing();
    f.router.ventClosed();
    f.router.waveStarted({ siegeId: 'm52' });
    f.router.waveCleared();
    f.router.order();
    f.router.gateBreached();
    f.router.lineBroken();
    expect(f.played).toEqual(['sfx.lava.splash', 'sfx.lava.burn', 'sfx.lava.thrown', 'sfx.vent.open', 'sfx.vent.crack', 'sfx.vent.close', 'sfx.siege.horn', 'sfx.siege.clear', 'sfx.siege.order', 'sfx.gate.breach', 'sfx.siege.lineBreak']);
  });

  it('the gate cracks when it crosses 50 and 20 on the way down and hits otherwise; a new wave resets the count', () => {
    const f = setup();
    for (const pct of [90, 70, 49, 45, 19, 10]) f.router.gateDamaged({ siegeId: 'm52', pct });
    expect(f.played).toEqual(['sfx.gate.hit', 'sfx.gate.hit', 'sfx.gate.crack', 'sfx.gate.hit', 'sfx.gate.crack', 'sfx.gate.hit']);
    // The gate's health carries over between waves (Q4): a new wave does not crack it again.
    f.router.waveStarted({ siegeId: 'm52' });
    f.played.length = 0;
    f.router.gateDamaged({ siegeId: 'm52', pct: 8 });
    expect(f.played).toEqual(['sfx.gate.hit']);
    // After a load the first event is the baseline, not a crack.
    f.router.saveLoaded();
    f.played.length = 0;
    f.router.gateDamaged({ siegeId: 'm52', pct: 30 });
    expect(f.played).toEqual(['sfx.gate.hit']);
  });

  it('two sieges keep their own gate health (R27 tunnel and M52)', () => {
    const f = setup();
    f.router.gateDamaged({ siegeId: 'm52', pct: 60 });
    f.router.gateDamaged({ siegeId: 'm52', pct: 40 });
    f.router.gateDamaged({ siegeId: 'r27', pct: 80 });
    expect(f.played).toEqual(['sfx.gate.hit', 'sfx.gate.crack', 'sfx.gate.hit']);
  });

  it('only dragons announce themselves on arrival; the ram, telegraphs and arena pieces map through their tables', () => {
    const f = setup();
    f.router.allyArrived({ id: 'squad.rim.1' });
    f.router.allyArrived({ id: 'dragon.ysmeryth' });
    f.router.ram('siege.ram.hit');
    f.router.ram('siege.ram.unknown');
    f.router.ram('toString');
    f.router.telegraph({ actorId: 'known', moveId: 'ulthred.hammer' });
    f.router.telegraph({ actorId: 'nobody', moveId: 'dragon.breath' });
    f.router.telegraph({ actorId: 'known', moveId: 'unknown.move' });
    f.router.telegraph({ actorId: 'known', moveId: '__proto__' });
    f.router.arenaPiece({ pieceId: 'floor.hall', state: 'dropped' });
    f.router.arenaPiece({ pieceId: 'floor.hall', state: 'up' });
    f.router.arenaPiece({ pieceId: 'pillar.1', state: 'dropped' });
    expect(f.played).toEqual(['sfx.dragon.flyby', 'sfx.ram.hit', 'sfx.dragon.breath', 'sfx.anvil.drop']);
    expect(f.playedAt).toEqual(['sfx.ulthred.hammer']);
  });

  it('the lava loop runs while the player is within range and stops when they leave; a vent loop likewise', () => {
    const f = setup({ audio: true, lava: 5, vent: null });
    f.router.tick(0.3);
    f.router.tick(0.3);
    expect(f.attached).toEqual(['sfx.lava.loop']);
    f.dist.lava = 50;
    f.dist.vent = 3;
    f.router.tick(0.3);
    expect(f.detached).toEqual([1]);
    expect(f.attached).toEqual(['sfx.lava.loop', 'sfx.vent.idle']);
  });

  it('no lava service (before N3), a non-finite or throwing distance and a load all leave no stuck loop', () => {
    const f = setup({ audio: true });
    f.router.tick(0.3);
    expect(f.attached).toEqual([]);
    f.dist.lava = Number.NaN;
    f.router.tick(0.3);
    expect(f.attached).toEqual([]);
    f.dist.lava = 4;
    f.router.tick(0.3);
    expect(f.attached).toHaveLength(1);
    f.router.saveLoaded();
    expect(f.detached).toEqual([1]);
    const g = new Act5SfxRouter({ audio: () => undefined, actorAt: () => undefined, playerObject: () => undefined, lavaDistance: () => { throw new Error('x'); } });
    expect(() => g.tick(1)).not.toThrow();
  });

  it('the Anvil hum is a scene loop that stops with the arena', () => {
    const f = setup();
    f.router.anvilHum(true);
    f.router.anvilHum(true);
    expect(f.attached).toEqual(['sfx.anvil.hum']);
    f.router.arenaReset();
    expect(f.detached).toEqual([1]);
  });

  it('without an audio service, or with one that throws, nothing is thrown', () => {
    const none = setup({ audio: false });
    expect(() => {
      none.router.lavaEntered();
      none.router.anvilHum(true);
      none.router.tick(1);
    }).not.toThrow();
    const bad = setup({ audio: true, throws: true });
    expect(() => bad.router.waveStarted({ siegeId: 'x' })).not.toThrow();
  });
});
