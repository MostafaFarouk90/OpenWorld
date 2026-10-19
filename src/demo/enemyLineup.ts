// Dev only: stands every enemy type in a row in the live scene, for the side-by-side render (tools/shot-enemies.mjs imports this
// through the Vite dev server). Nothing in the game imports it.
import * as THREE from 'three';
import type { AssetId } from '../assets/AssetManifest';
import { ModelLibrary, modelLibraryFor } from '../assets/swap/ModelLibrary';
import { buildGrimtoothModel } from '../bosses/grimtooth/GrimtoothModel';
import { buildPriorModel } from '../bosses/prior/PriorModel';
import type { GameContext } from '../core/Game';
import { ENEMY_DEFS } from '../enemies/defs';
import { EnemyAnimator } from '../enemies/EnemyAnimator';
import { buildEnemyModel } from '../enemies/EnemyModel';
import { makeQuadrupedBody } from '../enemies/hound/body';
import { buildScarecrowVisual } from '../enemies/foes/visuals';
import type { EnemyDef } from '../enemies/types';

export interface Lineup {
  /** Left to right: the player's Knight for reference, then every enemy type. */
  names: string[];
  /** Where the row's centre stands. */
  centre: THREE.Vector3;
  update(dt: number): void;
  dispose(): void;
}

const SPACING = 2.4;

export async function buildEnemyLineup(ctx: GameContext, centre: THREE.Vector3): Promise<Lineup> {
  const assets = ctx.assets;
  if (!assets) throw new Error('enemyLineup needs the asset loader');
  const lib = modelLibraryFor(assets);
  await Promise.all(['knight', 'mage', 'barbarian', 'rogue', 'rogueHooded'].map((id) => assets.load(id as AssetId)));
  await lib.preload(['hex/bucket_empty']);
  const prop = (id: string) => {
    const t = lib.peek(id);
    return t ? ModelLibrary.object(t) : null;
  };
  const items: Array<{ name: string; root: THREE.Object3D; tick?: (dt: number) => void }> = [];
  const idle = (animator: EnemyAnimator) => {
    animator.play('Idle', { loop: true });
    return (dt: number) => animator.fixedUpdate(dt);
  };

  const knight = assets.instantiate('knight' as AssetId);
  knight.rotation.y = Math.PI;
  knight.scale.setScalar(0.78);
  const knightRoot = new THREE.Group();
  knightRoot.add(knight);
  items.push({ name: 'player knight', root: knightRoot });

  const humanoid = (def: EnemyDef, name: string) => {
    const id = (def.model.prefer[0] ?? 'knight') as AssetId;
    const model = buildEnemyModel({ model: assets.instantiate(id), clips: assets.animations(id), prop }, def);
    const animator = new EnemyAnimator(model.owner, assets.animations(id));
    items.push({ name, root: model.root, tick: idle(animator) });
  };
  humanoid(ENEMY_DEFS['ash-wraith'], 'ash wraith');
  humanoid(ENEMY_DEFS['blighted-soldier'], 'blighted soldier');
  humanoid(ENEMY_DEFS['alley-cutpurse'], 'alley cutpurse');
  humanoid(ENEMY_DEFS['guildhall-thug'], 'guildhall thug');
  humanoid(ENEMY_DEFS['watch-guard'], 'watch guard');
  items.push({ name: 'ember hound', root: makeQuadrupedBody(ENEMY_DEFS['ember-hound']).root });
  items.push({ name: 'gaffer grimtooth', root: buildGrimtoothModel().root });
  const prior = buildPriorModel({ model: assets.instantiate('mage' as AssetId), clips: assets.animations('mage' as AssetId) });
  items.push({ name: 'ashen prior', root: prior.root, tick: (dt) => prior.update(dt) });
  items.push({ name: 'scarecrow', root: buildScarecrowVisual('lineup').root });

  const x0 = -((items.length - 1) * SPACING) / 2;
  items.forEach((it, i) => {
    it.root.position.set(centre.x + x0 + i * SPACING, centre.y, centre.z);
    // Faces +Z, towards a camera standing south of the row.
    it.root.rotation.y = Math.PI;
    ctx.scene.add(it.root);
  });
  return {
    names: items.map((i) => i.name),
    centre,
    update: (dt) => items.forEach((i) => i.tick?.(dt)),
    dispose: () => items.forEach((i) => i.root.removeFromParent()),
  };
}
