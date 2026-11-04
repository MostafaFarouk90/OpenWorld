// K12's M26 wake rules against the real HathrenDirector (K6a) as the `hathren` service, not the rig's fake.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { HathrenDirector } from '../../../../enemies/wyrm/hathren/director';
import type { HathrenService } from '../../../../enemies/wyrm/hathren/events';
import { heightAt } from '../../../../terrain/heightfield';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll } from './director/autoplay.testkit';
import { M26_WAKE_SCENE, M26_WOKE } from './m26.quest';

let rig: Rig | null = null;
let dir: HathrenDirector | null = null;
afterEach(() => { dir?.dispose(); dir = null; rig?.dispose(); rig = null; });

function setup(): { r: Rig; h: HathrenService; step: (n: number) => void } {
  const r = (rig = makeRig({ stage: true, hathren: false }));
  const warnings: string[] = [];
  const d = (dir = new HathrenDirector({
    scene: new THREE.Scene(),
    cameraPosition: () => null,
    freezePlayer: () => () => {},
    cutscene: () => () => {},
    camera: () => ({ release: () => {} }),
    questState: (id) => r.manager.state(id),
    getBool: (k) => r.flag(k),
    playerFeet: () => r.player.feet,
    anchor: (id) => r.kit.ctx.anchors.find(id)?.position,
    heightAt,
    holdsScale: () => false,
    emit: (beat) => r.emit('wyrm.hathren', { beat }),
    unlockCodex: () => {},
    warn: (m) => warnings.push(m),
  }));
  const h: HathrenService = {
    get state() { return d.state; }, netCut: (n) => d.netCut(n), calm: () => d.calm(), dismiss: () => d.dismiss(),
    holdWake: (on) => d.holdWake(on), get wakeHeld() { return d.wakeHeld; }, wake: () => d.wake(), headPoint: () => d.headPoint(),
  };
  r.kit.ctx.services.provide('hathren' as never, h as never);
  r.events.on('save.loaded' as never, (() => d.onLoaded()) as never);
  const step = (n: number): void => { for (let i = 0; i < n; i++) { d.tick(1 / 60); r.step(1); } };
  return { r, h, step };
}

describe('M26 wake with the real Hathren director', () => {
  it('holds her, wakes her in frame at the shore, plays the scene on her spray beat and credits when both are done', async () => {
    const { r, h, step } = setup();
    r.state.setFlag('story.gate.a3', true);
    autoplayAll(r, ['m23', 'm24', 'm25']);
    expect(r.manager.start('m26')).toBe(true);
    autoplay(r, 'm26', { stopAt: ['m26', 'wake'] });
    r.dialogue.hold = true;
    step(40);
    expect(h.wakeHeld).toBe(true);
    const a = r.kit.ctx.anchors.find('greyfen.mere.shore')!;
    r.player.feet.x = a.position.x + 3;
    r.player.feet.y = a.position.y;
    r.player.feet.z = a.position.z;
    step(600); // her wake is 12 s; the spray beat is at 6 s
    if (!r.started(M26_WAKE_SCENE)) throw new Error('the scene did not start: anchors missing for the real director?');
    expect(r.stage.cameras).toBe(1);
    r.dialogue.finish();
    step(400);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    step(5);
    expect(r.flag(M26_WOKE)).toBe(true);
    expect(r.done('m26', 'wake')).toBe(true);
    expect(r.stage).toMatchObject({ freezes: 0, cutscenes: 0, cameras: 0 });
    expect(h.wakeHeld).toBe(false);
  });

  it('a load mid-scene (dialogue closed with reason load first) releases everything, and a returning player still gets the scene', () => {
    const { r, h, step } = setup();
    r.state.setFlag('story.gate.a3', true);
    autoplayAll(r, ['m23', 'm24', 'm25']);
    r.manager.start('m26');
    autoplay(r, 'm26', { stopAt: ['m26', 'wake'] });
    r.dialogue.hold = true;
    step(40);
    const a = r.kit.ctx.anchors.find('greyfen.mere.shore')!;
    r.player.feet.x = a.position.x + 3; r.player.feet.y = a.position.y; r.player.feet.z = a.position.z;
    step(420);
    expect(r.dialogue.active).toBe(true);
    r.state.clearFlag(M26_WOKE);
    r.emit('save.loaded', { slot: 'a' });
    step(5);
    expect(r.stage).toMatchObject({ freezes: 0, cutscenes: 0, cameras: 0 });
    // the wake step is current in the loaded world: the load credited it (the wake is not saved)
    expect(r.done('m26', 'wake')).toBe(true);
    expect(h.wakeHeld).toBe(false);
  });
});
