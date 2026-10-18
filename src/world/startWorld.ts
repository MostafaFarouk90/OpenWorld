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
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { disabledFromQuery } from '../core/plugins';
import { Graphics } from '../core/graphics';
import { TrainingDummies } from './TrainingDummies';
import { ATTACK_SLOTS } from './World';
import type { StringTable } from '../strings/StringTable';
import type { InputBindings } from '../input/InputBindings';

const SKY = 0x9db8d3;

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
  const assets = new AssetLoader(renderer.renderer);
  const graphics = new Graphics({ renderer: renderer.renderer, scene, camera, sun, viewDistance: TERRAIN.viewDistance });
  // Registered after the Renderer's own resize listener, so the renderer already has the new size.
  window.addEventListener('resize', () => graphics.resize(container.clientWidth, container.clientHeight));
  const dummies = new TrainingDummies();
  const moveModifiers = new MoveModifiers();
  // `game` is assigned below; sounds only fire from ticks, which start after it exists.
  let game: Game | null = null;
  const world = new World(scene, physics, {
    sounds: audio ? footstepSounds(audio, () => game?.ctx.services.has('music') ?? false) : undefined,
    moveModifier: () => moveModifiers.state(),
  });
  const input = new InputManager(renderer.renderer.domElement);
  const followCamera = new ThirdPersonCamera(camera, input, physics, world.player.controller.collider);
  const cameraForward = new THREE.Vector3();
  container.style.position ||= 'relative'; // HUD slots are positioned against it
  game = new Game({
    scene,
    camera,
    physics,
    world,
    input,
    moveModifiers,
    hudContainer: container,
    toWorld: (r, f) => followCamera.toWorld(r, f),
    cameraForward: () => camera.getWorldDirection(cameraForward),
    cameraRig: followCamera,
    assets,
  });
  // Core services exist before any plugin sets up; audio is provided while still locked.
  if (audio) game.ctx.services.provide('audio', audio);
  game.ctx.services.provide('graphics', graphics);
  game.ctx.services.provide('dummies', dummies);
  const { strings, hud, events } = game.ctx;
  const overlay = createOverlay(hud, strings, input.bindings);
  const damageNumbers = new DamageNumberSprites(scene);
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) installDebugKeys(world);
  // The first click that starts play also asks for fullscreen and keyboard lock (Ctrl dodge, contracts/input-and-hud.md).
  // Every click that takes the pointer back asks again: the first Esc leaves fullscreen and drops the lock.
  renderer.renderer.domElement.addEventListener('click', () => {
    if (!input.keyboardLocked) void input.requestFullscreenAndLock(container);
    installLeaveGuard(strings);
  });

  events.on('damage.dealt', (r) => {
    if (!r.point) return;
    if (r.outcome === 'blocked') damageNumbers.spawnText(strings.t('core.damage.blocked'), r.point);
    else if (r.outcome === 'parried') damageNumbers.spawnText(strings.t('core.damage.parried'), r.point);
    else if (r.outcome === 'hit') damageNumbers.spawn(r.dealt, r.point, r.killed || r.attackId === ATTACK_SLOTS[2] ? 1.4 : 1);
  });

  // Plugins set up before the first tick; the loop starts once every setup has settled.
  const statuses = await game.loadPlugins(PLUGIN_MODULES, { disabled: disabledFromQuery(window.location.search) });
  const failed = statuses.filter((s) => s.state === 'failed');
  if (failed.length > 0) {
    overlay.error(
      strings.t('core.pluginFailed', { plugin: failed.map((f) => f.id).join(', '), error: failed[0].reason ?? '' }),
    );
  }
  overlay.refreshControls();

  overlay.status(strings.t('core.loadingKnight'));
  const ready = game;
  KnightAvatar.load(assets).then(
    (avatar) => {
      world.setAvatar(avatar);
      ready.attachAvatar(avatar);
      overlay.status(null);
      placeDummies(world, ready, assets, overlay, dummies);
    },
    (err: unknown) => {
      console.error('The Knight failed to load; playing as the capsule instead.', err);
      overlay.error(strings.t('core.knightFailed', { error: err instanceof Error ? err.message : String(err) }));
    },
  );

  new GameLoop({
    fixedUpdate() {
      ready.fixedUpdate();
    },
    render(alpha, frameTime) {
      ready.render(alpha, frameTime, () => followCamera.update(world.player.feet, frameTime));
      damageNumbers.update(frameTime);
      terrain.update(camera.position);
      followSun(sun, world.player.feet);
      audio?.update(camera);
      graphics.render();
    },
  }).start();

  if (import.meta.env.DEV) {
    // Handle for debugging and browser smoke tests; stripped from production builds.
    Object.assign(window, { __game: { physics, world, terrain, camera: followCamera, input, audio, game } });
  }
}

/** Debug toggles, only with ?debug in the URL: F4 shows the hurtboxes. */
function installDebugKeys(world: World): void {
  let hurtboxes = false;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F4') return;
    e.preventDefault();
    hurtboxes = !hurtboxes;
    world.combat.setDebugVisible(hurtboxes);
  });
}

/** Ctrl+W (dodge plus forward) asks before closing the tab instead of ending the session. */
let leaveGuardInstalled = false;
/** Installed on the first click only, so dev reloads before playing are not interrupted. */
function installLeaveGuard(strings: StringTable): void {
  if (leaveGuardInstalled) return;
  leaveGuardInstalled = true;
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    // Older browsers show a dialog only when returnValue is set.
    e.returnValue = strings.t('core.leaveGuard');
  });
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

/** `musicOwnsHits`: once a music service exists it plays layered hit SFX, so the plain clang stops. */
function footstepSounds(audio: AudioManager, musicOwnsHits: () => boolean): WorldSounds {
  const at = new THREE.Vector3();
  return {
    footstep(foot, position) {
      audio.playAt(foot === 'left' ? 'footstep-0' : 'footstep-1', at.set(position.x, position.y, position.z));
    },
    hit(position) {
      if (musicOwnsHits()) return;
      audio.playAt('hit', at.set(position.x, position.y, position.z));
    },
    land(fallSpeed, position) {
      at.set(position.x, position.y, position.z);
      audio.playAt(fallSpeed >= KNIGHT.hardLandingSpeed ? 'land' : 'footstep-0', at);
    },
  };
}

/** Training dummies on the meadow near the spawn, facing it, registered as actors; hits update the counter. */
function placeDummies(world: World, game: Game, assets: AssetLoader, overlay: Overlay, spots: TrainingDummies): void {
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
    game.addDummy(model).data.audio = { material: 'wood' };
  }
  // Thread 4's yard anchors move them once its plugin calls dummies.place.
  spots.setModels(world.combat.dummyModels);
  const refresh = (): void => {
    const s = world.combat.stats;
    overlay.hits(formatHitStats(s));
  };
  world.combat.onHitEvent(() => refresh());
}

interface Overlay {
  status(text: string | null): void;
  hits(text: string): void;
  error(text: string): void;
  /** Re-renders the controls hint from the current bindings and strings. */
  refreshControls(): void;
}

/** Status, error, hit counter and controls hint as a HUD widget in the top-left slot. */
function createOverlay(hud: Game['ctx']['hud'], strings: StringTable, bindings: InputBindings): Overlay {
  const panel = document.createElement('div');
  panel.style.cssText =
    'max-width:min(560px,calc(100vw - 24px));pointer-events:none;' +
    'font:14px/1.4 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000';
  const message = document.createElement('div');
  const hitLine = document.createElement('div');
  const help = document.createElement('div');
  help.style.opacity = '0.85';
  panel.append(message, hitLine, help);
  hud.mount('top-left', { id: 'core.overlay', element: panel, order: 0 });
  const refreshControls = (): void => {
    const g = (a: Parameters<InputBindings['glyph']>[0]) => bindings.glyph(a);
    help.textContent = strings.t('core.controls', {
      forward: g('moveForward'),
      left: g('moveLeft'),
      back: g('moveBack'),
      right: g('moveRight'),
      sprint: g('sprint'),
      jump: g('jump'),
      interact: g('interact'),
    });
  };
  bindings.onChange(refreshControls);
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
    refreshControls,
  };
}
