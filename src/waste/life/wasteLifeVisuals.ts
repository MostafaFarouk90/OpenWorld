// The refuge's and the camp's story dressing (Act 4 L1 PR 2), procedural greybox: the three House banners and the four
// R19 company pennants on the refuge's banner row, R24's casks, the miners standing at the fire (townsfolk bodies through
// the NPC model helpers, placeholders until they load; scenery only, no colliders or talk), and the water in the Walker
// Camp's two cisterns. Everything is built once; `apply` only flips visibility and pennant heights.
import * as THREE from 'three';
import { buildPlaceholder, disposePlaceholder, loadNpcModel, pickIdleClip } from '../../npcs/npcModels';
import { TOWN_TINT_STRENGTH, townBodyScale } from '../../npcs/townsfolkBodies';
import type { NpcDef, NpcModelLoader, TownBodyId } from '../../npcs/types';
import { REFUGE_BANNERS, REFUGE_CASKS, REFUGE_MINERS, REFUGE_REST } from '../../region/act4/act4Places';
import type { XZ } from '../../terrain/shape/waste';
import { CAMP } from '../wasteSites';
import { R19_COMPANIES, type R19CompanyId, type RefugeDressing } from './wasteLife';

const HOUSE_COLOURS: Record<keyof typeof REFUGE_BANNERS, number> = { halvard: 0x8a2a22, oswin: 0x2a4a7a, grisel: 0x3a5a2a };
const COMPANY_COLOURS: Record<R19CompanyId, number> = { archers: 0x4f7a3a, pikes: 0x9a3a2a, horse: 0x3a5a9a, engineers: 0xb08a3a };
/** The pennants stand on the banner row between the House banners (x west to east). */
export const PENNANT_SPOTS: Readonly<Record<R19CompanyId, XZ>> = { archers: [9660, 4442], pikes: [9680, 4442], horse: [9720, 4442], engineers: [9740, 4442] };
const POLE_H = 5;
/** The cask stack sits on PR 1's open crate footprint, 2 m north of the `.casks` anchor. */
const CASK_CENTRE: XZ = [REFUGE_CASKS[0], REFUGE_CASKS[1] + 2];
/** The tanks stand 2.6 m south of their cistern anchors (wasteStructures.ts). */
const TANK_OFFSET = 2.6;

interface Figure { root: THREE.Group; body: THREE.Object3D; placeholder: boolean; mixer: THREE.AnimationMixer | null }

/** A loaded body's materials are its own clones; its geometry belongs to the loader's cache (Townsfolk.ts's rule). */
function disposeModel(model: THREE.Object3D): void {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

export interface WasteLifeDeps {
  heightAt(x: number, z: number): number;
  loader?: NpcModelLoader;
  warn?: (msg: string) => void;
}

export class WasteLifeVisuals {
  readonly refuge = new THREE.Group();
  readonly camp = new THREE.Group();
  private readonly pennants = new Map<R19CompanyId, THREE.Mesh>();
  private readonly casks = new THREE.Group();
  private readonly water: THREE.Mesh[] = [];
  private readonly figures: Figure[] = [];
  private disposed = false;

  constructor(private readonly deps: WasteLifeDeps) {
    this.refuge.name = 'waste-life-refuge';
    this.camp.name = 'waste-life-camp';
    const y = (p: XZ) => deps.heightAt(p[0], p[1]);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
    const pole = (name: string, p: XZ) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, POLE_H, 6), poleMat);
      m.position.set(p[0], y(p) + POLE_H / 2, p[1]);
      m.name = name;
      this.refuge.add(m);
    };
    for (const h of Object.keys(REFUGE_BANNERS) as (keyof typeof REFUGE_BANNERS)[]) {
      const p = REFUGE_BANNERS[h];
      pole(`waste-life-banner-${h}-pole`, p);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), new THREE.MeshStandardMaterial({ color: HOUSE_COLOURS[h], side: THREE.DoubleSide, roughness: 0.9 }));
      cloth.position.set(p[0] + 0.65, y(p) + POLE_H - 1.2, p[1]);
      cloth.name = `waste-life-banner-${h}`;
      this.refuge.add(cloth);
    }
    for (const c of R19_COMPANIES) {
      const p = PENNANT_SPOTS[c];
      pole(`waste-life-pennant-${c}-pole`, p);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), new THREE.MeshStandardMaterial({ color: COMPANY_COLOURS[c], side: THREE.DoubleSide, roughness: 0.9 }));
      cloth.position.set(p[0] + 0.75, 0, p[1]);
      cloth.name = `waste-life-pennant-${c}`;
      cloth.userData.ground = y(p);
      this.pennants.set(c, cloth);
      this.refuge.add(cloth);
    }
    const caskMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 10), caskMat);
      const [cx, cz] = CASK_CENTRE;
      const top = i >= 4;
      m.position.set(cx - 0.7 + (top ? 0.35 + (i - 4) * 0.7 : (i % 2) * 0.7), y(CASK_CENTRE) + (top ? 1.2 : 0.4), cz - 0.35 + (top ? 0 : Math.floor(i / 2) * 0.35 - 0.35));
      m.name = `waste-life-cask-${i + 1}`;
      this.casks.add(m);
    }
    this.casks.name = 'waste-life-casks';
    this.refuge.add(this.casks);
    REFUGE_MINERS.forEach((p, i) => this.spawnMiner(i, p));

    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a5a6a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
    CAMP.cisterns.forEach((c, i) => {
      const p: XZ = [c[0], c[1] - TANK_OFFSET];
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.25, 16), waterMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p[0], y(p) + 1.15, p[1]);
      m.name = `waste-life-cistern-${i + 1}-water`;
      this.water.push(m);
      this.camp.add(m);
    });
  }

  private spawnMiner(i: number, p: XZ): void {
    const body: TownBodyId = i % 2 ? 'town-miner-b' : 'town-miner-a';
    const kaykit: NpcDef = { id: `refuge-miner-${i + 1}`, nameKey: '', model: 'barbarian', scale: 0.96, tint: 0x6a5a4a, dialogueId: '', idleClip: 'Idle' };
    const def: NpcDef = { ...kaykit, model: body, scale: townBodyScale(body, 0.96), tintStrength: TOWN_TINT_STRENGTH, fallback: kaykit };
    const root = new THREE.Group();
    root.name = `waste-life-miner-${i + 1}`;
    root.position.set(p[0], this.deps.heightAt(p[0], p[1]), p[1]);
    // Facing the refuge's fire (engine yaw 0 faces -Z).
    root.rotation.y = Math.atan2(-(REFUGE_REST[0] - p[0]), -(REFUGE_REST[1] - p[1]));
    const placeholder = buildPlaceholder(def);
    root.add(placeholder);
    const fig: Figure = { root, body: placeholder, placeholder: true, mixer: null };
    this.figures.push(fig);
    this.refuge.add(root);
    const loader = this.deps.loader;
    if (!loader) return;
    loadNpcModel(loader, def).then(
      ({ model, clips, def: built }) => {
        if (this.disposed) {
          disposeModel(model);
          return;
        }
        root.remove(fig.body);
        disposePlaceholder(fig.body);
        fig.body = model;
        fig.placeholder = false;
        root.add(model);
        const clip = pickIdleClip(clips, built.idleClip);
        if (clip) {
          fig.mixer = new THREE.AnimationMixer(model);
          const act = fig.mixer.clipAction(clip);
          act.time = (i * 1.7) % Math.max(clip.duration, 0.01);
          act.play();
        }
      },
      (err) => {
        if (!this.disposed) (this.deps.warn ?? console.warn)(`waste-life: miner model failed: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
  }

  /** Shows the refuge for its flags. Cheap and idempotent. */
  apply(d: RefugeDressing): void {
    this.refuge.visible = d.present;
    for (const [c, cloth] of this.pennants) {
      const raised = d.raised.includes(c);
      // Raised: flying at the top. Otherwise furled at the foot of its pole.
      cloth.position.y = (cloth.userData.ground as number) + (raised ? POLE_H - 0.5 : 0.9);
      cloth.scale.set(raised ? 1 : 0.25, 1, 1);
    }
    this.casks.visible = d.casks;
    this.figures.forEach((f, i) => (f.root.visible = i < d.miners));
  }

  setCisterns(full: boolean): void {
    for (const w of this.water) w.visible = full;
  }

  update(dt: number): void {
    if (!this.refuge.visible) return;
    for (const f of this.figures) if (f.root.visible) f.mixer?.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.figures) {
      f.mixer?.stopAllAction();
      f.root.remove(f.body);
      if (f.placeholder) disposePlaceholder(f.body);
      else disposeModel(f.body);
    }
    for (const g of [this.refuge, this.camp]) {
      g.removeFromParent();
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat?.dispose();
      });
    }
  }
}
