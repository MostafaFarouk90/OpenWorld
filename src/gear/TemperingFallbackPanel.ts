import type { ElementLike } from '../hud/dom';
import { makeEl } from '../hud/widget';
import type { ScreenHost, TemperingScreen, TemperingScreenFactory } from './session';

/** Minimal DOM panel over the tempering session; A15 replaces it through `gear.setScreen`. Key 1 or the Strike button strikes. */
export const createFallbackPanel: TemperingScreenFactory = (host: ScreenHost): TemperingScreen | null => {
  const { session, doc, t } = host;
  const element = makeEl(doc, 'div', 'owg-respec');
  const body = makeEl(doc, 'div', 'owg-menu', element);
  const button = (parent: ElementLike, label: string, fn: () => void): void => {
    const b = makeEl(doc, 'button', 'owg-btn', parent);
    b.textContent = label;
    b.onclick = fn;
  };
  const affixName = (id: string): string => t(`gear.affix.${id}`);

  const render = (): void => {
    const v = session.view();
    if (v.state === 'idle') return;
    body.replaceChildren();
    makeEl(doc, 'h2', 'owg-menu-title', body).textContent = t(`gear.screen.title.${v.mode ?? 'anvil'}`);
    makeEl(doc, 'div', 'owg-respec-quote', body).textContent = `${t('gear.screen.gold', { gold: v.gold })}  ${t('gear.screen.materials', v.materials)}`;
    makeEl(doc, 'div', 'owg-respec-quote', body).textContent = t(`gear.screen.state.${v.state}`);
    const r = v.lastResult;
    if (r) {
      const text = r.ok
        ? r.forged
          ? t('gear.screen.forged', { name: t(`item.${r.forged}.name`) })
          : `${t('gear.screen.ok', { level: r.level ?? 0 })}${r.perfect ? ` ${t('gear.screen.perfect')}` : ''}${r.affix ? ` ${affixName(r.affix)}` : ''}`
        : t(`gear.screen.fail.${r.reason}`);
      makeEl(doc, 'div', r.ok ? 'owg-respec-quote' : 'owg-respec-warn', body).textContent = text;
    }
    if (v.state === 'picking' || v.state === 'result') {
      for (const row of v.items) {
        const line = makeEl(doc, 'div', 'owg-row', body);
        const name = t(`item.${row.id}.name`);
        button(line, `${t('gear.screen.item', { name, temper: row.temper, tier: row.tier })}${row.affix ? ` [${affixName(row.affix)}]` : ''}`, () => session.select(row.id));
        if (row.forge) {
          const to = t(`item.${row.forge.to}.name`);
          button(line, t('gear.screen.forge', { name: to, gold: row.forge.gold }), () => session.forge(row.id));
        }
      }
      if (v.state === 'picking') {
        const sel = v.items.find((i) => i.id === v.selected);
        if (sel?.nextCost) {
          const mats = sel.nextCost.materials.map((m) => `${m.count} ${t(`item.${m.itemId}.name`)}`).join(', ');
          makeEl(doc, 'div', 'owg-respec-quote', body).textContent = v.free ? t('gear.screen.free') : t('gear.screen.cost', { gold: sel.nextCost.gold, materials: mats });
        }
        if (sel) button(body, t('gear.screen.start'), () => session.start());
      } else button(body, t('gear.screen.confirm'), () => session.confirm());
    }
    if (v.state === 'rhythm' && v.run) {
      makeEl(doc, 'div', 'owg-respec-quote', body).textContent = v.run.judged.map((j) => (j ? t(`gear.screen.judge.${j}`) : '.')).join(' ');
      button(body, t('gear.screen.strike'), () => session.strike());
    }
    if (v.state === 'affix-reveal' && v.affix) {
      if (v.affix.choice) {
        button(body, t('gear.screen.keep', { affix: affixName(v.affix.existing ?? '') }), () => session.keepAffix());
        button(body, t('gear.screen.replace', { affix: affixName(v.affix.affix) }), () => session.replaceAffix());
      } else {
        makeEl(doc, 'div', 'owg-respec-quote', body).textContent = `${affixName(v.affix.affix)}: ${t(`gear.affix.${v.affix.affix}.desc`)}`;
        button(body, t('gear.screen.confirm'), () => session.confirm());
      }
    }
    button(body, t('gear.screen.close'), () => session.close());
  };

  const onKey = (e: { key?: string; code?: string; repeat?: boolean }): void => {
    if (e.repeat) return;
    if (e.key === '1' || e.code === 'Digit1') session.strike();
  };
  host.keys?.addEventListener('keydown', onKey);
  const off = session.subscribe(render);
  const closer = host.openModal({ id: 'tempering', element, dispose: () => session.close() });
  if (!closer) {
    off();
    host.keys?.removeEventListener('keydown', onKey);
    return null;
  }
  render();
  return {
    update: () => {
      if (session.state === 'rhythm') render();
    },
    dispose: () => {
      off();
      host.keys?.removeEventListener('keydown', onKey);
      closer();
    },
  };
};
