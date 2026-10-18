import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import type { DocumentLike } from './dom';
import { StubDocument } from './dom';
import type { SpellsPort } from './ports';

/** Services of other threads that may not be merged; typed locally so a missing one is just undefined. */
interface SoftServices {
  spells: SpellsPort & Record<string, unknown>;
  lockOn: { readonly targetId: string | null };
  quests: {
    active(): readonly unknown[];
    objectives(id: string): readonly unknown[];
  };
  companions: { active(): readonly string[]; actorId(id: string): string | null };
  inventory: { readonly gold: number };
  stealth: {
    active?(): boolean;
    eye(): { level: number; state: 'calm' | 'suspicious' | 'alerted'; observerId: string | null } | null;
    noise(): number | null;
  };
  chase: { timer(): { remaining: number; total: number; gap: number; phase: 'running' | 'again' } | null };
  mount: { stamina(): { value: number; max: number } | null };
  classes: { chosen(): boolean; current(): string; kit(id: string): { nameKey: string } | undefined | null };
  vfx: { spawnEffect(id: string, transform: { position: { x: number; y: number; z: number } }): unknown };
}

export function soft<K extends keyof SoftServices>(ctx: GameContext, name: K): SoftServices[K] | undefined {
  const services = ctx.services as unknown as { get(n: string): unknown };
  return services.get(name) as SoftServices[K] | undefined;
}

/** The real document in the browser, a stub when headless (tests, node). */
export function hudDocument(): DocumentLike {
  return typeof document !== 'undefined' ? (document as unknown as DocumentLike) : new StubDocument();
}

export function asHtml<T>(el: T): HTMLElement {
  return el as unknown as HTMLElement;
}

export function emitLoose(ctx: GameContext): (type: string, payload: unknown) => void {
  return (type, payload) => (ctx.events as unknown as { emit(t: string, p: unknown): void }).emit(type, payload);
}

const projected = new THREE.Vector3();

/** Projects a world point to CSS pixels; `behind` when it is behind the camera. */
export function projectToScreen(
  camera: THREE.PerspectiveCamera,
  point: { x: number; y: number; z: number },
  width: number,
  height: number,
): { x: number; y: number; behind: boolean } {
  projected.set(point.x, point.y, point.z).project(camera);
  return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height, behind: projected.z > 1 };
}

const STYLE_ID = 'owg-hud-style';
/** Injects the HUD stylesheet once into a real document. */
export function injectCss(css: string): () => void {
  if (typeof document === 'undefined') return () => {};
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }
  return () => {};
}
