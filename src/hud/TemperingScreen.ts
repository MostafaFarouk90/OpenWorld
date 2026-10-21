import type { ElementLike } from './dom';
import { makeEl } from './widget';
import type { ScreenHost, SessionView, TemperingScreen, TemperingScreenFactory } from '../gear/session';

/** Steps in the bar (A10's `RhythmRun` uses a 16-step bar). */
export const RHYTHM_STEPS = 16;

/**
 * A15's tempering screen: a dark card over A10's `TemperingSession` (its command surface: select, start, strike,
 * confirm, keep or replace, forge, close). It draws only. Strike timing is A10's: key 1 calls `session.strike()`, which
 * reads the session's own clock, never this screen's redraw rate, so a slow frame cannot move a hit.
 */
export const createTemperingScreen: TemperingScreenFactory = (host: ScreenHost): TemperingScreen | null => {
  const { session, doc, t } = host;
  const element = makeEl(doc, 'div', 'owg-card owg-tempering');
  const body = makeEl(doc, 'div', 'owg-tempering-body', element);
  let strip: ElementLike[] = [];
  let stripHost: ElementLike | null = null;
  let stripKey = '';

  const button = (parent: ElementLike, label: string, fn: () => void, off = false): ElementLike => {
    const b = makeEl(doc, 'button', off ? 'owg-btn owg-btn-off' : 'owg-btn', parent);
    b.textContent = label;
    b.onclick = fn;
    return b;
  };
  const line = (cls: string, text: string): void => {
    makeEl(doc, 'div', cls, body).textContent = text;
  };
  const affixName = (id: string): string => t(`gear.affix.${id}`);

  const resultText = (v: SessionView): { ok: boolean; text: string } | null => {
    const r = v.lastResult;
    if (!r) return null;
    if (!r.ok) return { ok: false, text: t(`gear.screen.fail.${r.reason ?? 'locked'}`) };
    if (r.forged) return { ok: true, text: t('gear.screen.forged', { name: t(`item.${r.forged}.name`) }) };
    return { ok: true, text: `${t('gear.screen.ok', { level: r.level ?? 0 })}${r.perfect ? ` ${t('gear.screen.perfect')}` : ''}${r.affix ? ` ${affixName(r.affix)}` : ''}` };
  };

  /** The bar: one cell per step, strike steps marked, judged strikes coloured, the playhead on the current step. */
  const drawStrip = (v: SessionView): void => {
    const run = v.run;
    if (!run) return;
    const key = run.steps.join(',');
    if (!stripHost || stripKey !== key) {
      stripKey = key;
      stripHost = makeEl(doc, 'div', 'owg-tempering-strip', body);
      strip = [];
      for (let i = 0; i < RHYTHM_STEPS; i++) strip.push(makeEl(doc, 'div', 'owg-tempering-cell', stripHost));
    }
    const head = Math.floor(run.position);
    for (let i = 0; i < RHYTHM_STEPS; i++) {
      const k = run.steps.indexOf(i);
      const judged = k >= 0 ? run.judged[k] : null;
      const cls = ['owg-tempering-cell'];
      if (k >= 0) cls.push('owg-tempering-mark');
      if (judged) cls.push(`owg-tempering-${judged}`);
      if (i === head) cls.push('owg-tempering-head');
      strip[i]!.className = cls.join(' ');
    }
  };

  const render = (): void => {
    const v = session.view();
    if (v.state === 'idle') return;
    // The rhythm strip is updated in place while a run lasts; anything else redraws the card.
    if (v.state === 'rhythm' && v.run && stripHost && strip.length === RHYTHM_STEPS) {
      drawStrip(v);
      return;
    }
    stripHost = null;
    strip = [];
    stripKey = '';
    body.replaceChildren();
    makeEl(doc, 'h2', 'owg-card-title', body).textContent = t(`gear.screen.title.${v.mode ?? 'anvil'}`);
    line('owg-tempering-purse', `${t('gear.screen.gold', { gold: v.gold })}  ${t('gear.screen.materials', v.materials)}`);
    line('owg-tempering-state', t(`gear.screen.state.${v.state}`));
    const res = resultText(v);
    if (res) line(res.ok ? 'owg-tempering-ok' : 'owg-tempering-warn', res.text);

    if (v.state === 'picking' || v.state === 'result') {
      const list = makeEl(doc, 'div', 'owg-tempering-list', body);
      for (const row of v.items) {
        const el = makeEl(doc, 'div', row.id === v.selected ? 'owg-tempering-row owg-tempering-sel' : 'owg-tempering-row', list);
        const name = t(`item.${row.id}.name`);
        button(el, `${t('gear.screen.item', { name, temper: row.temper, tier: row.tier })}${row.affix ? ` [${affixName(row.affix)}]` : ''}${row.equipped ? ' *' : ''}`, () => session.select(row.id));
        if (row.forge) button(el, t('gear.screen.forge', { name: t(`item.${row.forge.to}.name`), gold: row.forge.gold }), () => session.forge(row.id), !row.forge.canAfford);
      }
      if (v.state === 'picking') {
        const sel = v.items.find((i) => i.id === v.selected);
        if (sel?.nextCost) {
          const mats = sel.nextCost.materials.map((m) => `${m.count} ${t(`item.${m.itemId}.name`)}`).join(', ');
          line('owg-tempering-cost', v.free ? t('gear.screen.free') : t('gear.screen.cost', { gold: sel.nextCost.gold, materials: mats }));
        }
        if (sel?.blockedBy) line('owg-tempering-warn', t(`gear.screen.fail.${sel.blockedBy}`));
        if (sel) button(body, t('gear.screen.start'), () => session.start(), !!sel.blockedBy);
      } else button(body, t('gear.screen.confirm'), () => session.confirm());
    }
    if (v.state === 'rhythm' && v.run) {
      drawStrip(v);
      button(body, t('gear.screen.strike'), () => session.strike());
    }
    if (v.state === 'affix-reveal' && v.affix) {
      if (v.affix.choice) {
        button(body, t('gear.screen.keep', { affix: affixName(v.affix.existing ?? '') }), () => session.keepAffix());
        button(body, t('gear.screen.replace', { affix: affixName(v.affix.affix) }), () => session.replaceAffix());
      } else {
        line('owg-tempering-ok', `${affixName(v.affix.affix)}: ${t(`gear.affix.${v.affix.affix}.desc`)}`);
        button(body, t('gear.screen.confirm'), () => session.confirm());
      }
    }
    button(body, t('gear.screen.close'), () => session.close());
  };

  const onKey = (e: { key?: string; code?: string; repeat?: boolean; timeStamp?: number }): void => {
    if (e.repeat) return;
    if (e.key !== '1' && e.code !== 'Digit1') return;
    // The press time, not the time this handler ran: a key queued behind a long frame is still judged where it landed.
    // `timeStamp` shares `performance.now()`'s origin (the gear plugin's clock); a value from elsewhere falls back to now.
    const stamp = e.timeStamp;
    const now = typeof performance !== 'undefined' ? performance.now() : NaN;
    session.strike(typeof stamp === 'number' && Number.isFinite(stamp) && Number.isFinite(now) && stamp > 0 && stamp <= now && now - stamp < 1000 ? stamp : undefined);
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
  // The session notifies on every tick of a run (the gear plugin calls session.update), so the subscription is the redraw.
  return {
    dispose: () => {
      off();
      host.keys?.removeEventListener('keydown', onKey);
      closer();
    },
  };
};
