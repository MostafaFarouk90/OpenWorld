import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GREYFEN_WATER_TABLE, HATHRENS_MERE } from '../../../terrain/shape/greyfen';
import { HathrenDirector, HATHREN_IDS, hathrenCentre, type HathrenDirectorPorts } from './director';
import { CALM_BEATS, CALM_SECONDS, type HathrenBeat } from './sequence';

const DT = 1 / 60;
// A shore 380 m south of the Mere's centre, nets along it, the bowl 3 m deep inside 330 m.
const SHORE = { x: HATHRENS_MERE.x, y: 5.4, z: HATHRENS_MERE.z - 380 };
const ground = (x: number, z: number) => (Math.hypot(x - HATHRENS_MERE.x, z - HATHRENS_MERE.z) < 330 ? 3 : 5.4);

function world(opts: { anchors?: boolean } = {}) {
  const flags = new Map<string, boolean>();
  const quests = new Map<string, string>();
  const anchors = new Map<string, { x: number; y: number; z: number }>();
  if (opts.anchors !== false) {
    anchors.set(HATHREN_IDS.shoreAnchor, SHORE);
    for (let n = 1; n <= 4; n++) anchors.set(HATHREN_IDS.netAnchor(n), { x: SHORE.x - 30 + n * 12, y: 5.4, z: SHORE.z });
    anchors.set(HATHREN_IDS.scaleBedAnchor, { x: SHORE.x + 8, y: 5.4, z: SHORE.z + 4 });
  }
  const beats: HathrenBeat[] = [];
  const codex: string[] = [];
  const warnings: string[] = [];
  let frozen = 0;
  let cutscene = 0;
  let cameras = 0;
  let holds = false;
  const player = { x: SHORE.x, y: 5.4, z: SHORE.z - 200 };
  const scene = new THREE.Scene();
  const ports: HathrenDirectorPorts = {
    scene,
    cameraPosition: () => ({ x: player.x, y: player.y + 2, z: player.z }),
    freezePlayer: () => {
      frozen++;
      return () => frozen--;
    },
    cutscene: () => {
      cutscene++;
      return () => cutscene--;
    },
    camera: () => {
      cameras++;
      return { release: () => cameras-- };
    },
    questState: (id) => quests.get(id) ?? 'inactive',
    getBool: (k) => flags.get(k) === true,
    playerFeet: () => player,
    anchor: (id) => anchors.get(id),
    heightAt: ground,
    holdsScale: () => holds,
    emit: (b) => beats.push(b),
    unlockCodex: (id) => codex.push(id),
    warn: (m) => warnings.push(m),
  };
  const d = new HathrenDirector(ports);
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) d.tick(DT);
  };
  return {
    d, tick, flags, quests, player, beats, codex, warnings, scene,
    get frozen() { return frozen; },
    get cutscene() { return cutscene; },
    get cameras() { return cameras; },
    hold: () => (holds = true),
    accept: () => quests.set('m26', 'active'),
  };
}

const netLines = (scene: THREE.Scene) => scene.children.filter((o) => o.name.startsWith('hathren-net-'));

describe("Hathren's director (K6a, M26)", () => {
  it('is absent until M26 is active, then waits in the nets and wakes when the player nears the shore', () => {
    const w = world();
    w.tick(1);
    expect(w.d.state).toBe('absent');
    expect(w.scene.getObjectByName('hathren')).toBeUndefined();
    w.accept();
    w.tick(1);
    expect(w.d.state).toBe('nets');
    expect(w.scene.getObjectByName('hathren')).toBeDefined();
    expect(w.beats).toEqual([]);
    w.player.z = SHORE.z - 20;
    w.tick(0.1);
    expect(w.beats[0]).toBe('wake');
    expect(netLines(w.scene).filter((l) => l.visible)).toHaveLength(4);
  });

  it('her loop centre is in water deep enough to hide her, toward the Mere from the shore', () => {
    const c = hathrenCentre(SHORE, ground);
    expect(GREYFEN_WATER_TABLE - ground(c.x, c.z)).toBeGreaterThanOrEqual(2.2);
    expect(Math.hypot(c.x - SHORE.x, c.z - SHORE.z)).toBeGreaterThanOrEqual(55);
    expect(Math.hypot(c.x - HATHRENS_MERE.x, c.z - HATHRENS_MERE.z)).toBeLessThan(Math.hypot(SHORE.x - HATHRENS_MERE.x, SHORE.z - HATHRENS_MERE.z));
  });

  it('a cut net (live call or K12 flag) drops its line; a reload keeps cut nets cut and skips the wake', () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    expect(w.d.netCut(1)).toBe(true);
    w.flags.set(HATHREN_IDS.netFlag(1), true);
    w.flags.set(HATHREN_IDS.netFlag(3), true); // written without the live call
    w.tick(0.1);
    expect(w.d.seq.netsCut).toEqual(new Set([1, 3]));
    expect(netLines(w.scene).filter((l) => l.visible).map((l) => l.name).sort()).toEqual(['hathren-net-2', 'hathren-net-4']);
    w.d.onLoaded();
    expect(w.d.state).toBe('nets');
    expect(w.d.seq.netsCut).toEqual(new Set([1, 3]));
    expect(w.d.seq.phase).toBe('loop');
    expect(w.scene.children.filter((o) => o.name === 'hathren')).toHaveLength(1);
  });

  it('the calm: locks the player and the camera, fires every beat in order, unlocks the codex on quiet, then releases and leaves the scale glinting', async () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    const play = w.d.calm()!;
    expect(play).not.toBeNull();
    expect(w.d.calm()).toBe(play); // already calming: the running playback
    w.tick(1);
    expect(w.frozen).toBe(1);
    expect(w.cutscene).toBe(1);
    expect(w.cameras).toBe(1);
    w.tick(CALM_SECONDS);
    expect(w.beats).toEqual(CALM_BEATS.map((b) => b.beat));
    expect(w.codex).toEqual([HATHREN_IDS.codexId]);
    expect(w.d.state).toBe('gone');
    expect(w.frozen).toBe(0);
    expect(w.cutscene).toBe(0);
    expect(w.cameras).toBe(0);
    await expect(play.done).resolves.toBe('finished');
    expect(w.d.calm()).toBeNull(); // gone
    expect(w.scene.getObjectByName('hathren')).toBeUndefined();
    const glint = w.scene.getObjectByName('hathren-scale-glint')!;
    expect(glint.visible).toBe(true);
    w.tick(1);
    expect(w.d.state).toBe('gone'); // M26 still active: she does not come back
    w.hold();
    w.tick(DT);
    expect(w.scene.getObjectByName('hathren-scale-glint')).toBeUndefined();
  });

  it('skip ends the calm at once with the remaining beats and the lock released', async () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    const play = w.d.calm()!;
    w.tick(3);
    play.skip();
    await play.done;
    expect(w.beats).toEqual(CALM_BEATS.map((b) => b.beat));
    expect(w.frozen + w.cutscene + w.cameras).toBe(0);
  });

  it('a reload mid-calm without the rite paid goes back to the nets with no beats and cancels the playback', async () => {
    const w = world();
    w.accept();
    for (let n = 1; n <= 4; n++) w.flags.set(HATHREN_IDS.netFlag(n), true);
    w.tick(0.1);
    const play = w.d.calm()!;
    w.tick(14);
    const before = w.beats.length;
    w.d.onLoaded();
    expect(w.beats.length).toBe(before);
    expect(w.d.state).toBe('nets');
    expect(w.frozen + w.cutscene + w.cameras).toBe(0);
    await expect(play.done).resolves.toBe('cancelled');
  });

  it.each([
    ['K12 re-calls calm() before her own re-derive', true],
    ['K12 re-calls calm() after her own re-derive', false],
    ['K12 makes no call (she restarts by herself)', null],
  ])('a reload mid-calm with the rite paid (story.m26.riteDone) replays the calm in full: %s', async (_name, first) => {
    const w = world();
    w.accept();
    for (let n = 1; n <= 4; n++) w.flags.set(HATHREN_IDS.netFlag(n), true);
    w.tick(0.1);
    w.flags.set(HATHREN_IDS.riteFlag, true);
    w.d.calm();
    w.tick(14);
    w.beats.length = 0;
    // The load: save.loaded listeners run in plugin order, so K12's call can land on either side of onLoaded().
    let play = first === true ? w.d.calm() : null;
    w.d.onLoaded();
    if (first === false) play = w.d.calm();
    expect(w.d.state).toBe('calming');
    expect(w.beats).toEqual([]);
    w.tick(CALM_SECONDS + 0.5);
    expect(w.beats).toEqual(CALM_BEATS.map((b) => b.beat));
    if (play) await expect(play.done).resolves.toBe('finished');
  });

  it('the rite flag alone (no live call) starts the calm in play too', () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    w.flags.set(HATHREN_IDS.riteFlag, true);
    w.tick(DT);
    expect(w.d.state).toBe('calming');
  });

  it('a glint left by a finished calm goes on load (an older save); the rig idles while the player is far off', () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    w.d.calm();
    w.tick(CALM_SECONDS + 0.5);
    expect(w.scene.getObjectByName('hathren-scale-glint')).toBeDefined();
    w.d.onLoaded();
    const glints = () => w.scene.children.filter((o) => o.name === 'hathren-scale-glint' && o.visible);
    expect(glints()).toHaveLength(0); // the new scene's own glint waits hidden for its scale beat
    expect(w.d.state).toBe('nets');
    // The player 500 m from the shore: posed once, then left still until they come within the idle radius.
    w.player.z = SHORE.z - 500;
    const update = (w.d.current as unknown as { update: (...a: unknown[]) => void });
    let steps = 0;
    const orig = update.update.bind(update);
    update.update = (...a: unknown[]) => {
      steps++;
      orig(...a);
    };
    w.tick(1);
    expect(steps).toBe(1); // the pose after the build
    w.player.z = SHORE.z - 100;
    w.tick(0.1);
    expect(steps).toBeGreaterThan(0);
  });

  it('abandoned M26 leaves her absent (also after a reload); re-accepting puts her back in the nets', () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    w.d.netCut(2);
    w.quests.set('m26', 'inactive');
    w.tick(0.1);
    expect(w.d.state).toBe('absent');
    expect(w.scene.getObjectByName('hathren')).toBeUndefined();
    w.d.onLoaded();
    expect(w.d.state).toBe('absent');
    w.accept();
    w.tick(0.1);
    expect(w.d.state).toBe('nets');
  });

  it('M26 complete: absent for good, and a calm already playing is allowed to finish', () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    w.d.calm();
    w.tick(2);
    w.flags.set(HATHREN_IDS.completeFlag, true);
    w.tick(CALM_SECONDS);
    expect(w.beats.at(-1)).toBe('gone');
    w.tick(0.5);
    expect(w.d.state).toBe('absent');
    w.d.onLoaded();
    expect(w.d.state).toBe('absent');
    expect(w.scene.getObjectByName('hathren-scale-glint')).toBeUndefined();
  });

  it('without the Mere anchors: one warning, nothing built, calm refused; she appears once they exist', () => {
    const w = world({ anchors: false });
    w.accept();
    w.tick(1);
    expect(w.d.state).toBe('absent');
    expect(w.d.calm()).toBeNull();
    expect(w.warnings).toHaveLength(1);
  });

  it('dismiss removes her silently (a calm in play settles cancelled); a listener that throws never breaks the sequence', async () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    w.d.dismiss();
    expect(w.d.state).toBe('gone');
    expect(w.scene.getObjectByName('hathren')).toBeUndefined();
    const u = world();
    u.accept();
    u.tick(0.1);
    const play = u.d.calm()!;
    u.tick(3);
    u.d.dismiss();
    await expect(play.done).resolves.toBe('cancelled');
    expect(u.frozen + u.cutscene + u.cameras).toBe(0);
    const v = world();
    v.accept();
    v.tick(0.1);
    const ports = (v.d as unknown as { ports: { emit: (b: HathrenBeat) => void } }).ports;
    ports.emit = () => {
      throw new Error('listener');
    };
    v.d.calm();
    v.tick(CALM_SECONDS + 0.5);
    expect(v.d.state).toBe('gone');
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it('dispose tears everything down, the glint included', () => {
    const w = world();
    w.accept();
    w.tick(0.1);
    w.d.calm();
    w.tick(CALM_SECONDS - 3);
    w.d.dispose();
    expect(w.scene.children.filter((o) => o.name.startsWith('hathren'))).toHaveLength(0);
    expect(w.frozen + w.cutscene + w.cameras).toBe(0);
  });
});
