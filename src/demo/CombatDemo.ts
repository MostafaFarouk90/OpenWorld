import * as THREE from 'three';
import { AssetLoader } from '../assets';
import { MixerAttackWindowSource } from '../combat/AttackWindow';
import { CombatSystem } from '../combat/CombatSystem';
import { HurtboxSet } from '../combat/HurtboxSet';
import { WeaponTracer } from '../combat/WeaponTracer';
import { COMBAT } from '../config/constants';
import { GameLoop } from '../core/GameLoop';
import type { Renderer } from '../rendering/Renderer';

/**
 * Combat hit detection demo, opened with `?scene=combat`: a Knight loops a sword attack against a
 * Knight training dummy. The mixer is advanced inside the fixed step (before matrices and the combat
 * update) so the swept blade segment matches the pose that is rendered. H toggles the hurtbox overlay.
 */
export function startCombatDemo(renderer: Renderer): void {
  const { scene, camera } = renderer;
  const assets = new AssetLoader(renderer.renderer);
  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;top:12px;left:12px;color:#fff;font:15px/1.4 sans-serif;background:#0008;padding:8px 12px;border-radius:6px;white-space:pre';
  document.body.appendChild(hud);
  const fail = (msg: string): void => {
    hud.textContent = msg;
    console.error(msg);
  };

  scene.background = new THREE.Color(0x87a9c9);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f2a, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2);
  sun.position.set(6, 12, 4);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshStandardMaterial({ color: 0x6b7f3f }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  camera.position.set(0, 1.8, 4.2);
  camera.lookAt(0, 1, 0);

  void (async () => {
    await assets.preload(['knight']);
    const clips = assets.animations('knight');
    const clip = THREE.AnimationClip.findByName(clips, COMBAT.demoClip);
    if (!clip) {
      fail(`Combat demo: clip "${COMBAT.demoClip}" not found. Available: ${clips.map((c) => c.name).join(', ')}`);
      return;
    }

    const attacker = assets.instantiate('knight');
    attacker.position.set(-0.7, 0, 0);
    attacker.rotation.y = Math.PI / 2;
    const dummy = assets.instantiate('knight');
    dummy.position.set(0.5, 0, 0);
    dummy.rotation.y = -Math.PI / 2;
    scene.add(attacker, dummy);
    // Only the one-handed sword stays visible on the attacker; the dummy is unarmed.
    for (const root of [attacker, dummy]) {
      root.traverse((o) => {
        if (/Sword|Shield/.test(o.name) && !(root === attacker && o.name === '1H_Sword')) o.visible = false;
      });
    }
    const sword = attacker.getObjectByName('1H_Sword');
    if (!sword) {
      fail('Combat demo: node "1H_Sword" not found in Knight.glb');
      return;
    }

    const mixer = new THREE.AnimationMixer(attacker);
    const action = mixer.clipAction(clip).play();
    const dummyMixer = new THREE.AnimationMixer(dummy);
    const idle = THREE.AnimationClip.findByName(clips, 'Idle');
    if (idle) dummyMixer.clipAction(idle).play();

    attacker.updateMatrixWorld(true);
    const attackerBoxes = new HurtboxSet(attacker, undefined, attacker);
    const dummyBoxes = new HurtboxSet(dummy, undefined, dummy);
    for (const set of [attackerBoxes, dummyBoxes]) {
      if (set.missing.length) console.warn('Combat demo: missing bones', set.missing);
      scene.add(set.debugMesh);
    }
    const combat = new CombatSystem();
    combat.addTarget(dummyBoxes);
    const tracer = new WeaponTracer({ attacker, weapon: sword, ownHurtboxes: attackerBoxes, bus: combat.bus });
    combat.addAttacker(
      tracer,
      new MixerAttackWindowSource(action, COMBAT.demoClip, COMBAT.demoWindow.start, COMBAT.demoWindow.end),
    );

    let hits = 0;
    let last = '';
    combat.bus.subscribe((e) => {
      hits++;
      last = `${e.bone} (${e.damage.toFixed(1)} dmg)`;
    });
    const refreshHud = (): void => {
      hud.textContent = `Hits: ${hits}   Swings: ${tracer.swing}\nLast hit: ${last || '-'}\nH: toggle hurtboxes`;
    };
    refreshHud();

    let debug = true;
    attackerBoxes.setDebugVisible(debug);
    dummyBoxes.setDebugVisible(debug);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyH') return;
      debug = !debug;
      attackerBoxes.setDebugVisible(debug);
      dummyBoxes.setDebugVisible(debug);
    });

    new GameLoop({
      fixedUpdate(dt) {
        // Pose first, then matrices, then combat: the tracer samples this step's final pose.
        mixer.update(dt);
        dummyMixer.update(dt);
        attacker.updateMatrixWorld(true);
        dummy.updateMatrixWorld(true);
        attackerBoxes.update();
        if (debug) dummyBoxes.update(); // otherwise refit lazily, only while the window is active
        combat.update(dt);
        attackerBoxes.tickFlash(dt);
        refreshHud();
      },
      render() {
        renderer.render();
      },
    }).start();

    if (import.meta.env.DEV) Object.assign(window, { __combat: { combat, tracer, action, dummyBoxes, attackerBoxes } });
  })().catch((err) => fail(`Combat demo failed: ${err instanceof Error ? err.message : String(err)}`));
}
