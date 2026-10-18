import type { HudLayer } from '../ui/HudLayer';

let counter = 0;

/** A short text toast in the HUD toast slot; a no-op headless. */
export function showToast(hud: HudLayer, text: string, ms = 3000): void {
  if (typeof document === 'undefined') return;
  const element = document.createElement('div');
  element.textContent = text;
  element.style.cssText = 'background:rgba(20,16,12,.85);color:#f3e6c8;padding:6px 12px;border-radius:4px;margin-bottom:6px;font:14px serif';
  const unmount = hud.mount('toast', { id: `toast.${++counter}`, element });
  setTimeout(unmount, ms);
}
