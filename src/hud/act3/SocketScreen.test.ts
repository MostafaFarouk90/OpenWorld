import { beforeEach, describe, expect, it } from 'vitest';
import type { ClassId } from '../../actors/classes';
import '../../gear/catalog';
import '../../gear/tier4/catalog';
import type { SocketPanelHost, SocketPanelModel } from '../../gear/sockets/SocketFallbackPanel';
import { fitGem, recutGem, recutTargetFor, removeGem, socketView, type SocketInventory } from '../../gear/sockets/sockets';
import { K10_STRINGS_EN } from '../../gear/sockets/strings.en';
import { SHARD_GEMS } from '../../gear/sockets/table';
import { SOCKET_TUNING } from '../../gear/sockets/tuning';
import { getItem } from '../../inventory/items';
import { Inventory } from '../../inventory/Inventory';
import { StubDocument, StubElement, textOf, type ElementLike } from '../dom';
import type { MenuKeyEvent } from './FerryMenu';
import { SOCKET_SCREEN_ID, createSocketScreen } from './SocketScreen';
import { ACT3_HUD_STRINGS_EN } from './strings.en';

const BLADE = 'wyrm-tempered-oathblade';
const MANTLE = 'wyrmscale-mantle';
const BULWARK = 'shard-gem.bulwark';
const OATHFIRE = 'shard-gem.oathfire';
const ROOTSTONE = 'shard-gem.rootstone';

const TEXT: Record<string, string> = {
  ...K10_STRINGS_EN,
  ...ACT3_HUD_STRINGS_EN,
  'gear.screen.gold': 'Gold: {gold}',
  'gear.screen.close': 'Close',
};
const t = (k: string, p?: Record<string, string | number>) => (TEXT[k] ?? `?${k}`).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]));

let raw: Inventory;
let worn: Set<string>;

/** The model exactly as the shard-gems plugin builds it, over a real inventory. */
function modelFor(cls: ClassId): SocketPanelModel {
  const inv: SocketInventory = {
    has: (id) => raw.has(id),
    count: (id) => raw.count(id),
    add: (id, n) => raw.add(id, n),
    remove: (id, n) => raw.remove(id, n),
    get gold() {
      return raw.gold;
    },
    takeGold: (n) => raw.takeGold(n),
    addGold: (n) => raw.addGold(n),
    gear: (id) => raw.gear(id),
    socketsOf: (id) => raw.socketsOf(id),
    setSockets: (id, s) => raw.setSockets(id, s),
    capOf: (id) => raw.capOf(id),
  };
  return {
    pieces: () => raw.items().filter(({ id }) => (getItem(id)?.sockets ?? 0) > 0).map(({ id }) => socketView(inv, id, cls)),
    gems: () => SHARD_GEMS.filter((g) => raw.count(g.id) > 0).map((g) => ({ id: g.id, count: raw.count(g.id), dormant: g.classId !== cls, recutTo: recutTargetFor(g.id, cls) })),
    fit: (a, b, c) => fitGem(inv, a, b, c),
    remove: (a, b) => removeGem(inv, a, b),
    recut: (a, b) => recutGem(inv, a, b, cls),
    gold: () => raw.gold,
    equipped: (id) => worn.has(id),
  };
}

function load(items: Record<string, number>, gold: number) {
  raw = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  raw.reset({ items, equipped: {} });
  raw.addGold(gold);
}

function open(cls: ClassId = 'knight', opts: { modalFree?: boolean; keys?: boolean } = {}) {
  const listeners = new Set<(e: MenuKeyEvent) => void>();
  const keys = opts.keys === false ? null : {
    addEventListener: (_: 'keydown', l: (e: MenuKeyEvent) => void) => void listeners.add(l),
    removeEventListener: (_: 'keydown', l: (e: MenuKeyEvent) => void) => void listeners.delete(l),
  };
  let modal: { id: string; element: ElementLike; dispose?(): void } | null = null;
  const host: SocketPanelHost = {
    doc: new StubDocument(),
    t,
    openModal: (w) => {
      if (opts.modalFree === false || modal) return null;
      modal = w;
      return () => {
        const m = modal;
        modal = null;
        m?.dispose?.();
      };
    },
  };
  const closer = createSocketScreen(keys)(host, modelFor(cls));
  const buttons = (): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: ElementLike): void => {
      if ((e as StubElement).tag === 'button') out.push(e as StubElement);
      e.children.forEach(walk);
    };
    if (modal) walk(modal.element);
    return out;
  };
  return {
    closer,
    listeners,
    get modal() { return modal; },
    get text() { return modal ? textOf(modal.element) : ''; },
    buttons,
    /** Buttons with this label, in order. */
    all: (label: string) => buttons().filter((b) => b.textContent === label),
    press: (code: string) => [...listeners].forEach((l) => l({ code })),
    host,
    reopen: (cls2: ClassId = cls) => createSocketScreen(keys)(host, modelFor(cls2)),
  };
}
const FIT = `Fit (${SOCKET_TUNING.fitGold} gold)`;
const TAKE = `Take out (${SOCKET_TUNING.removeGold} gold)`;

beforeEach(() => {
  worn = new Set();
  load({ [BLADE]: 1, [MANTLE]: 1, [BULWARK]: 2, [OATHFIRE]: 1 }, 500);
});

describe('socket screen drawing', () => {
  it('lists the pieces that take a gem with their sockets, the loose gems with counts, the gold and the costs', () => {
    const s = open();
    expect(s.modal?.id).toBe(SOCKET_SCREEN_ID);
    expect(s.text).toContain('Shard-gems');
    expect(s.text).toContain('Gold: 500');
    expect(s.text).toContain('Wyrm-tempered Oathblade');
    expect(s.text).toContain('Wyrmscale Mantle');
    expect(s.text).toContain('Socket 1: empty');
    expect(s.text).toContain('Bulwark Shard-gem x2');
    expect(s.text).toContain('Oathfire Shard-gem x1');
    // The costs come from the tuning.
    expect(s.all(FIT)).toHaveLength(2);
    expect(`${SOCKET_TUNING.fitGold}/${SOCKET_TUNING.removeGold}/${SOCKET_TUNING.recutGold}`).toBe('50/25/40');
    expect(s.text).toContain(`Recut to Oathfire Shard-gem (${SOCKET_TUNING.recutGold} gold)`);
    expect(s.text).not.toContain('?'); // every key resolved
  });

  it('worn pieces come first', () => {
    worn.add(MANTLE);
    const s = open();
    const body = s.text;
    expect(body.indexOf('Wyrmscale Mantle (worn)')).toBeGreaterThan(-1);
    expect(body.indexOf('Wyrmscale Mantle')).toBeLessThan(body.indexOf('Wyrm-tempered Oathblade'));
    s.closer?.();
    worn = new Set([BLADE]);
    const s2 = open();
    expect(s2.text.indexOf('Wyrm-tempered Oathblade')).toBeLessThan(s2.text.indexOf('Wyrmscale Mantle'));
  });

  it("shows the other class's gems as dormant, fitted or loose", () => {
    load({ [BLADE]: 1, [ROOTSTONE]: 1 }, 500);
    raw.setSockets(BLADE, [{ slot: 0, shardId: ROOTSTONE }]);
    const s = open('knight');
    expect(s.text).toContain('Rootstone Shard-gem (dormant: another class)');
    expect(s.all(TAKE)).toHaveLength(1);
    load({ [BLADE]: 1, [ROOTSTONE]: 1 }, 500);
    expect(open('knight').text).toContain('Rootstone Shard-gem x1 (dormant: another class)');
  });

  it('says so with nothing to socket and no gems', () => {
    load({}, 10);
    const s = open();
    expect(s.text).toContain('Nothing you carry takes a shard-gem.');
    expect(s.text).toContain('You carry no shard-gems.');
    expect(s.all('Close')).toHaveLength(1);
  });
});

describe('socket screen actions', () => {
  it('fits through choosing a socket and then a gem, and shows the result', () => {
    const s = open();
    s.all('Choose')[0]!.click();
    expect(s.text).toContain('Fit which shard-gem into socket 1 of');
    s.all(FIT)[0]!.click(); // the first gem in table order: Bulwark
    expect(s.text).toContain('Done: Bulwark Shard-gem.');
    expect(raw.count(BULWARK)).toBe(1);
    expect(raw.socketsOf(BLADE).concat(raw.socketsOf(MANTLE))).toHaveLength(1);
    expect(raw.gold).toBe(500 - SOCKET_TUNING.fitGold);
    expect(s.all(TAKE)).toHaveLength(1);
    // The chosen socket is spent: fitting again needs a new choice.
    s.all(FIT)[0]!.click();
    expect(s.text).toContain('Choose an empty socket first');
    expect(raw.count(BULWARK)).toBe(1);
  });

  it('a gem with no socket chosen changes nothing and says what to do', () => {
    const s = open();
    s.all(FIT)[0]!.click();
    expect(s.text).toContain('Choose an empty socket first, then the shard-gem to fit.');
    expect(raw.count(BULWARK)).toBe(2);
    expect(raw.gold).toBe(500);
  });

  it('shows the refusal for gold short, and leaves everything as it was', () => {
    load({ [BLADE]: 1, [BULWARK]: 1 }, SOCKET_TUNING.fitGold - 1);
    const s = open();
    s.all('Choose')[0]!.click();
    s.all(FIT)[0]!.click();
    expect(s.text).toContain('You cannot afford that.');
    expect(raw.count(BULWARK)).toBe(1);
    expect(raw.socketsOf(BLADE)).toEqual([]);
    expect(raw.gold).toBe(SOCKET_TUNING.fitGold - 1);
  });

  it('removes a fitted gem back into the bag for the removal cost', () => {
    raw.setSockets(BLADE, [{ slot: 0, shardId: BULWARK }]);
    const s = open();
    s.all(TAKE)[0]!.click();
    expect(s.text).toContain('Done: Bulwark Shard-gem.');
    expect(raw.socketsOf(BLADE)).toEqual([]);
    expect(raw.count(BULWARK)).toBe(3);
    expect(raw.gold).toBe(500 - SOCKET_TUNING.removeGold);
  });

  it('a removal with the gem stack full is refused, shown, and the gem stays fitted (never lost)', () => {
    const cap = raw.capOf(BULWARK);
    expect(cap).toBeGreaterThan(0);
    load({ [BLADE]: 1, [BULWARK]: cap }, 500);
    raw.setSockets(BLADE, [{ slot: 0, shardId: BULWARK }]);
    const goldBefore = raw.gold;
    const s = open();
    s.all(TAKE)[0]!.click();
    expect(s.text).toContain('No room in your pack for that shard-gem.');
    expect(raw.socketsOf(BLADE)).toEqual([{ slot: 0, shardId: BULWARK }]);
    expect(raw.count(BULWARK)).toBe(cap);
    expect(raw.gold).toBe(goldBefore);
    // Still offered, and works once there is room.
    raw.remove(BULWARK, 1);
    s.all(TAKE)[0]!.click();
    expect(s.text).toContain('Done: Bulwark Shard-gem.');
    expect(raw.socketsOf(BLADE)).toEqual([]);
    expect(raw.count(BULWARK)).toBe(cap);
  });

  it('removal without the gold is refused and the gem stays', () => {
    raw.setSockets(BLADE, [{ slot: 0, shardId: BULWARK }]);
    load({ [BLADE]: 1 }, SOCKET_TUNING.removeGold - 1);
    raw.setSockets(BLADE, [{ slot: 0, shardId: BULWARK }]);
    const s = open();
    s.all(TAKE)[0]!.click();
    expect(s.text).toContain('You cannot afford that.');
    expect(raw.socketsOf(BLADE)).toHaveLength(1);
  });

  it('recuts a loose gem to its twin for the recut cost', () => {
    const s = open();
    const recut = s.all(`Recut to Oathfire Shard-gem (${SOCKET_TUNING.recutGold} gold)`);
    expect(recut).toHaveLength(1);
    recut[0]!.click();
    expect(s.text).toContain('Done: Oathfire Shard-gem.');
    expect(raw.count(BULWARK)).toBe(1);
    expect(raw.count(OATHFIRE)).toBe(2);
    expect(raw.gold).toBe(500 - SOCKET_TUNING.recutGold);
  });

  it('a recut into a full stack or without gold is refused with the gems unchanged', () => {
    const cap = raw.capOf(OATHFIRE);
    load({ [BULWARK]: 1, [OATHFIRE]: cap }, 500);
    const s = open();
    s.all(`Recut to Oathfire Shard-gem (${SOCKET_TUNING.recutGold} gold)`)[0]!.click();
    expect(s.text).toContain('No room in your pack for that shard-gem.');
    expect(raw.count(BULWARK)).toBe(1);
    expect(raw.count(OATHFIRE)).toBe(cap);
    load({ [BULWARK]: 1 }, 0);
    const poor = open();
    poor.all(`Recut to Oathfire Shard-gem (${SOCKET_TUNING.recutGold} gold)`)[0]!.click();
    expect(poor.text).toContain('You cannot afford that.');
    expect(raw.count(BULWARK)).toBe(1);
  });

  it('a gem of another class offers the recut to this class (a respec)', () => {
    load({ [ROOTSTONE]: 1 }, 500);
    const s = open('knight');
    const to = recutTargetFor(ROOTSTONE, 'knight')!;
    expect(s.text).toContain(`Recut to ${TEXT[`item.${to}.name`]}`);
  });

  it('a socket filled from outside while the screen is up is refused by K10 (nothing spent) and is no longer a choice', () => {
    const s = open();
    s.all('Choose')[0]!.click();
    const piece = raw.items().find((i) => (getItem(i.id)?.sockets ?? 0) > 0)!.id;
    raw.setSockets(piece, [{ slot: 0, shardId: OATHFIRE }]);
    const gold = raw.gold;
    const bulwarks = raw.count(BULWARK);
    s.all(FIT)[0]!.click();
    expect(s.text).toContain('That socket already holds a shard-gem.');
    expect(raw.gold).toBe(gold);
    expect(raw.count(BULWARK)).toBe(bulwarks);
    s.all(FIT)[0]!.click();
    expect(s.text).toContain('Choose an empty socket first');
  });
});

describe('socket screen keyboard, closing and fallbacks', () => {
  it('Tab or arrows move the focus, Enter runs it, Esc closes and releases the keys', () => {
    const s = open();
    expect(s.listeners.size).toBe(1);
    s.press('Enter'); // the first action: choose the first empty socket
    expect(s.text).toContain('Fit which shard-gem into socket 1');
    s.press('Tab');
    s.press('Tab');
    s.press('Tab');
    s.press('Tab'); // past the second piece's Choose, onto the first gem's Fit
    s.press('Enter');
    expect(raw.socketsOf(BLADE).concat(raw.socketsOf(MANTLE))).toHaveLength(1);
    s.press('ArrowUp');
    s.press('Escape');
    expect(s.modal).toBeNull();
    expect(s.listeners.size).toBe(0);
  });

  it('the Close button closes', () => {
    const s = open();
    s.all('Close')[0]!.click();
    expect(s.modal).toBeNull();
    expect(s.listeners.size).toBe(0);
  });

  it('a second open while a modal is up returns null and leaves no listener behind', () => {
    const s = open();
    expect(s.reopen()).toBeNull();
    expect(s.listeners.size).toBe(1);
    const blocked = open('knight', { modalFree: false });
    expect(blocked.closer).toBeNull();
    expect(blocked.listeners.size).toBe(0);
  });

  it('works headless (no key source)', () => {
    const s = open('knight', { keys: false });
    expect(s.closer).not.toBeNull();
    s.all('Choose')[0]!.click();
    s.all(FIT)[0]!.click();
    expect(raw.count(BULWARK)).toBe(1);
  });

  it('the model is optional beyond K10: without `equipped` nothing is worn', () => {
    const model = modelFor('knight');
    delete (model as { equipped?: unknown }).equipped;
    let modal: { element: ElementLike } | null = null;
    createSocketScreen(null)({ doc: new StubDocument(), t, openModal: (w) => ((modal = w), () => {}) }, model);
    expect(textOf(modal!.element)).not.toContain('(worn)');
  });
});
