import * as THREE from 'three';
import { COMBAT, KNIGHT, TERRAIN, WORLD } from '../config/constants';
import { GameLoop } from '../core/GameLoop';
import { Renderer } from '../rendering/Renderer';
import { ThirdPersonCamera } from '../rendering/ThirdPersonCamera';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { InputManager } from '../input/InputManager';
import { TerrainManager } from '../terrain/TerrainManager';
import { AssetLoader } from '../assets';
import { AudioManager, proceduralSounds } from '../audio';
import { KnightAvatar } from '../characters/KnightAvatar';
import { heightAt } from '../terrain/heightfield';
import { DamageNumberSprites } from './DamageNumbers';
import { World, type WorldSounds } from './World';
import { formatHitStats } from './WorldCombat';

const SKY = 0x9db8d3;
const CONTROLS = 'Click to look around · WASD move · Shift run · Space jump · Left click or 1-4 attack · H hurtboxes';

/**
 * The default page: the Knight on the streamed terrain. Physics must load (it shows a full-page
 * error otherwise); the Knight loads in the background and the capsule stands in until it does,
 * or for good, with an on-screen error, if it fails.
 */
export async function startWorld(container: HTMLElement): Promise<void> {
  const physics = new PhysicsWorld();
  try {
    await physics.init();
  } catch (err) {
    container.textContent = err instanceof Error ? err.message : String(err);
    container.style.cssText = 'color:#fff;font:16px sans-serif;padding:2em';
    throw err;
  }

  const renderer = new Renderer(container);
  const { scene, camera } = renderer;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, TERRAIN.viewDistance * 0.15, TERRAIN.viewDistance * 0.95);
  camera.far = Math.max(camera.far, TERRAIN.viewDistance * 1.05);
  camera.updateProjectionMatrix();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.9));
  const sun = createSun(scene);

  const terrain = new TerrainManager(scene);
  const audio = createAudio();
  const world = new World(scene, physics, { sounds: audio ? footstepSounds(audio) : undefined });
  const input = new InputManager(renderer.renderer.domElement);
  const followCamera = new ThirdPersonCamera(camera, input, physics, world.player.controller.collider);
  const overlay = createOverlay(container);
  const damageNumbers = new DamageNumberSprites(scene);
  let hurtboxes = false;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH') return;
    hurtboxes = !hurtboxes;
    world.combat.setDebugVisible(hurtboxes);
  });

  overlay.status('Loading the Knight…');
  const assets = new AssetLoader(renderer.renderer);
  KnightAvatar.load(assets).then(
    (avatar) => {
      world.setAvatar(avatar);
      overlay.status(null);
      placeDummies(world, assets, damageNumbers, overlay);
    },
    (err: unknown) => {
      console.error('The Knight failed to load; playing as the capsule instead.', err);
      overlay.error(`Could not load the Knight. ${err instanceof Error ? err.message : String(err)}`);
    },
  );

  new GameLoop({
    fixedUpdate() {
      const snapshot = input.sample();
      world.fixedUpdate(snapshot, followCamera.toWorld(snapshot.moveRight, snapshot.moveForward));
    },
    render(alpha, frameTime) {
      world.render(alpha, frameTime);
      damageNumbers.update(frameTime);
      followCamera.update(world.player.feet);
      terrain.update(camera.position);
      followSun(sun, world.player.feet);
      audio?.update(camera);
      renderer.render();
    },
  }).start();

  if (import.meta.env.DEV) {
    // Handle for debugging and browser smoke tests; stripped from production builds.
    Object.assign(window, { __game: { physics, world, terrain, camera: followCamera, input, audio } });
  }
}

function createSun(scene: THREE.Scene): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xfff1d6, 2);
  const s = WORLD.shadowHalfSize;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  return sun;
}

const SUN_DIRECTION = new THREE.Vector3(0.4, 1, 0.25).normalize();

/** Keeps the shadow box centred on the player. */
function followSun(sun: THREE.DirectionalLight, feet: THREE.Vector3): void {
  sun.target.position.copy(feet);
  sun.position.copy(feet).addScaledVector(SUN_DIRECTION, 200);
}

function createAudio(): AudioManager | null {
  try {
    const audio = new AudioManager();
    audio.register('footstep-0', { src: [proceduralSounds.footstepUrl(0)], format: ['wav'], volume: KNIGHT.footstepVolume });
    audio.register('footstep-1', { src: [proceduralSounds.footstepUrl(1)], format: ['wav'], volume: KNIGHT.footstepVolume });
    audio.register('hit', { src: [proceduralSounds.clangUrl()], format: ['wav'], volume: COMBAT.hitSoundVolume });
    audio.register('land', { src: [proceduralSounds.landUrl()], format: ['wav'], volume: KNIGHT.landVolume });
    return audio;
  } catch (err) {
    console.warn('Audio is unavailable; the world runs silently.', err);
    return null;
  }
}

function footstepSounds(audio: AudioManager): WorldSounds {
  const at = new THREE.Vector3();
  return {
    footstep(foot, position) {
      audio.playAt(foot === 'left' ? 'footstep-0' : 'footstep-1', at.set(position.x, position.y, position.z));
    },
    hit(position) {
      audio.playAt('hit', at.set(position.x, position.y, position.z));
    },
    land(fallSpeed, position) {
      at.set(position.x, position.y, position.z);
      audio.playAt(fallSpeed >= KNIGHT.hardLandingSpeed ? 'land' : 'footstep-0', at);
    },
  };
}

/** Training dummies on the meadow near the spawn, facing it, with hit numbers and the counter. */
function placeDummies(world: World, assets: AssetLoader, numbers: DamageNumberSprites, overlay: Overlay): void {
  const clips = assets.animations('knight');
  for (const at of COMBAT.dummies) {
    const x = world.spawn.x + at.x;
    const z = world.spawn.z + at.z;
    const model = assets.instantiate('knight');
    model.position.set(x, heightAt(x, z), z);
    model.rotation.y = Math.atan2(world.spawn.x - x, world.spawn.z - z);
    model.scale.setScalar(KNIGHT.modelScale);
    // Unarmed: only the Knight's body stays visible.
    model.traverse((o) => {
      if (/Sword|Shield/.test(o.name)) o.visible = false;
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    world.combat.addDummy(model, clips);
  }
  const refresh = (): void => {
    const s = world.combat.stats;
    overlay.hits(formatHitStats(s));
  };
  world.combat.onHitEvent((e) => {
    numbers.spawn(e.damage, e.point);
    refresh();
  });
}

interface Overlay {
  status(text: string | null): void;
  hits(text: string): void;
  error(text: string): void;
}

function createOverlay(container: HTMLElement): Overlay {
  container.style.position ||= 'relative';
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;left:12px;top:12px;max-width:min(560px,calc(100% - 24px));pointer-events:none;' +
    'font:14px/1.4 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000';
  const message = document.createElement('div');
  const hitLine = document.createElement('div');
  const help = document.createElement('div');
  help.textContent = CONTROLS;
  help.style.opacity = '0.85';
  panel.append(message, hitLine, help);
  container.appendChild(panel);
  return {
    status(text) {
      message.textContent = text ?? '';
      message.style.cssText = '';
    },
    hits(text) {
      hitLine.textContent = text;
    },
    error(text) {
      message.textContent = text;
      message.setAttribute('role', 'alert');
      message.style.cssText = 'background:rgba(140,20,20,0.85);padding:8px 10px;border-radius:6px;margin-bottom:6px';
    },
  };
}
