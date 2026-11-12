import type { RadialView, RadialWedge } from './SkillRadial';

const STYLE_ID = 'owg-pad-style';

/** Pad focus ring and radial look (reuses the HUD's dark card palette). */
export const PAD_CSS = `
.owg-pad-focus { outline: 2px solid #e0c070 !important; outline-offset: 2px; box-shadow: 0 0 10px rgba(224,192,112,.55); }
.owg-radial { position: absolute; left: 50%; top: 50%; width: 360px; height: 360px; margin: -180px 0 0 -180px;
  border-radius: 50%; background: radial-gradient(rgba(16,12,10,.82) 30%, rgba(16,12,10,.55) 70%, transparent 71%);
  pointer-events: none; font: 13px/1.2 Georgia, serif; color: #eadfc8; }
.owg-radial-title { position: absolute; left: 0; right: 0; top: 50%; margin-top: -9px; text-align: center; opacity: .75; }
.owg-radial-wedge { position: absolute; width: 104px; margin-left: -52px; margin-top: -16px; text-align: center;
  padding: 6px 4px; border-radius: 8px; background: rgba(40,30,22,.85); border: 1px solid rgba(224,192,112,.25); }
.owg-radial-wedge.is-off { opacity: .45; }
.owg-radial-wedge.is-on { border-color: #e0c070; background: rgba(120,80,30,.9); color: #fff; }
`;

function injectPadCss(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = PAD_CSS;
  doc.head.appendChild(el);
}

/** The radial on screen; a no-op headless. `t` translates the title keys. */
export function createRadialView(container: HTMLElement | null, t: (key: string) => string): RadialView & { dispose(): void } {
  if (!container || typeof document === 'undefined') {
    return { show() {}, select() {}, hide() {}, dispose() {} };
  }
  injectPadCss(document);
  const root = document.createElement('div');
  root.className = 'owg-radial';
  root.style.display = 'none';
  container.appendChild(root);
  let items: HTMLElement[] = [];
  return {
    show(kind, wedges: readonly RadialWedge[]) {
      root.textContent = '';
      const title = document.createElement('div');
      title.className = 'owg-radial-title';
      title.textContent = t(kind === 'skills' ? 'gamepad.radial.skills' : 'gamepad.radial.screens');
      root.appendChild(title);
      items = wedges.map((w, i) => {
        const a = (i / wedges.length) * Math.PI * 2;
        const el = document.createElement('div');
        el.className = `owg-radial-wedge${w.usable ? '' : ' is-off'}`;
        el.style.left = `${180 + Math.sin(a) * 125}px`;
        el.style.top = `${180 - Math.cos(a) * 125}px`;
        el.textContent = w.label;
        root.appendChild(el);
        return el;
      });
      root.style.display = 'block';
    },
    select(index) {
      items.forEach((el, i) => el.classList.toggle('is-on', i === index));
    },
    hide() {
      root.style.display = 'none';
      items = [];
    },
    dispose() {
      root.remove();
    },
  };
}

/** Adds the focus-ring CSS (menus use it even when no radial was ever shown). */
export function ensurePadCss(): void {
  if (typeof document !== 'undefined' && document.head) injectPadCss(document);
}
