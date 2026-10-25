import { GREYFEN_POST_RULES } from '../greyfen/postRules';
import { OLDSMOKE_POST_RULES } from '../oldsmoke/postRules';
import { describe, it, expect, vi } from 'vitest';
import { makeWorld, FakeBus, fakeState } from './testKit';
import { installBridges, TORCH_USED_FLAG } from './bridges';
import { installPoiRewards } from './poi';
import { POI_REWARDS } from './content/poi';
import { PostDirector, resolvePosts, POST_RULES } from './posts';
import { TorchSystem } from './torch';
import { JournalTabs, defaultSlots, FAVOUR_TAB_FLAG } from './journalTabs';
import { buildJournalModel, createJournalPanel } from './JournalPanel';
import { createEffectRunner } from './effects';
import { r01 } from './content/r01.quest';
import { d01 } from './content/d01.quest';
import { m03 } from './content/m03.quest';
import { m01 } from './content/m01.quest';
import { m04 } from './content/m04.quest';
import { m05 } from './content/m05.quest';

describe('R01 torch bridge', () => {
  it('records the first torch clear while R01 is active, never otherwise', () => {
    const w = makeWorld([r01]);
    installBridges(w.bus, w.state, w.manager);
    w.bus.emit('scarecrow.cleared', { method: 'torch', scarecrowId: 'a' });
    expect(w.flags.has(TORCH_USED_FLAG)).toBe(false); // R01 not started
    w.manager.start('r01');
    w.bus.emit('scarecrow.cleared', { method: 'surge', scarecrowId: 'b' });
    expect(w.flags.has(TORCH_USED_FLAG)).toBe(false);
    w.bus.emit('scarecrow.cleared', { method: 'strike', scarecrowId: 'c' });
    expect(w.flags.has(TORCH_USED_FLAG)).toBe(false);
    w.bus.emit('scarecrow.cleared', { method: 'torch', scarecrowId: 'd' });
    expect(w.flags.get(TORCH_USED_FLAG)).toBe(true);
  });
  it('tolerates junk payloads and a throwing flag store', () => {
    const w = makeWorld([r01]);
    const warn = vi.fn();
    installBridges(w.bus, { ...w.state, setFlag: () => { throw new Error('bad'); } }, w.manager, warn);
    w.manager.start('r01');
    expect(() => { w.bus.emit('scarecrow.cleared', undefined); w.bus.emit('scarecrow.cleared', { method: 'torch' }); }).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
  it('R01 follows the majority of the clears (a tie saves the field), then asks for the matching aftermath', () => {
    const cases = [
      [['torch', 'torch', 'surge', 'torch', 'torch', 'surge', 'torch', 'surge'], 'scorched'],
      [['surge', 'surge', 'surge', 'surge', 'surge', 'surge', 'surge', 'torch'], 'saved'],
      [['torch', 'surge', 'torch', 'surge', 'torch', 'surge', 'torch', 'surge'], 'saved'],
    ] as const;
    for (const [methods, field] of cases) {
      const w = makeWorld([r01]);
      installBridges(w.bus, w.state, w.manager);
      w.manager.start('r01');
      w.bus.emit('dialogue.ended', { npcId: 'wynn', reason: 'completed' });
      w.bus.emit('dialogue.ended', { npcId: 'note-r01-shawl', reason: 'completed' });
      methods.forEach((m, i) => w.bus.emit('scarecrow.cleared', { method: m, scarecrowId: `s${i}`, actorId: `a${i}` }));
      expect(w.flags.get('story.r01.scorched'), methods.join()).toBe(field === 'scorched');
      for (const id of ['r1', 'r2', 'r3']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'ash-wraith', spawnTag: 'r01.root' });
      expect(w.manager.isObjectiveCurrent('r01', 'aftermath')).toBe(true);
      const aftermath = field === 'scorched' ? ['story.r01.bucket1.delivered', 'story.r01.bucket2.delivered'] : ['story.r01.stake.1', 'story.r01.stake.2', 'story.r01.stake.3'];
      for (const k of aftermath) { w.flags.set(k, true); w.bus.emit('flag.changed', { key: k, value: true }); }
      expect(w.flags.get('story.r01.aftermathDone')).toBe(true);
      w.bus.emit('flag.changed', { key: 'story.r01.aftermathDone', value: true });
      w.bus.emit('dialogue.ended', { npcId: 'wynn', reason: 'completed' });
      expect(w.manager.state('r01')).toBe('completed');
      expect(w.flags.get('world.brightwater.barley')).toBe(field);
    }
  });
});

describe('POI rewards', () => {
  function setup() {
    const w = makeWorld();
    const run = createEffectRunner({ state: w.state, quests: w.manager, bus: w.bus, sourceId: 'poi', inventory: () => ({ remove: () => true, addGold: (n) => { w.gold.n += n; } }), progression: () => ({ grantXp: (n) => { w.calls.push(`xp:${n}`); } }) });
    const codex = vi.fn();
    installPoiRewards(POI_REWARDS, { bus: w.bus, state: w.state, run: (e) => run.run(e), codexUnlock: codex });
    return { w, codex };
  }
  it('pays the ledge cache once and survives re-use', () => {
    const { w } = setup();
    w.bus.emit('interact', { interactableId: 'use:poi-chapel-ledge' });
    w.bus.emit('interact', { interactableId: 'use:poi-chapel-ledge' });
    expect(w.gold.n).toBe(15);
    expect(w.bus.of('loot.granted')).toHaveLength(1);
  });
  it('unlocks the lore stone entry once and grants xp once', () => {
    const { w, codex } = setup();
    w.bus.emit('interact', { interactableId: 'use:poi-reed-island' });
    w.bus.emit('interact', { interactableId: 'use:poi-reed-island' });
    expect(codex).toHaveBeenCalledTimes(1);
    expect(codex).toHaveBeenCalledWith('lore.reed-island');
    expect(w.calls.filter((c) => c.startsWith('xp'))).toHaveLength(1);
  });
  it('ignores other interactables and malformed events; a missing codex service is fine', () => {
    const w = makeWorld();
    installPoiRewards(POI_REWARDS, { bus: w.bus, state: w.state, run: () => [{ ok: true }] });
    expect(() => { w.bus.emit('interact', undefined); w.bus.emit('interact', { interactableId: 5 }); w.bus.emit('interact', { interactableId: 'use:other' }); w.bus.emit('interact', { interactableId: 'use:poi-reed-island' }); }).not.toThrow();
    expect(w.flags.get('story.m03.reedRead')).toBe(true);
  });
});

// These worlds hold Brightwater quests only; Rook's gate post (until M06 is done) would be placed in every one of them.
// Deepgate's always-on hall rows (Act 2, A4) and the Greyfen's (Act 3, K3: the bell keeper's porch) would place their cast in
// every world too.
const DEEPGATE_NPCS = new Set([...OLDSMOKE_POST_RULES, ...GREYFEN_POST_RULES].map((r) => r.npcId));
const BRIGHTWATER_RULES = POST_RULES.filter((r) => r.npcId !== 'rook' && !DEEPGATE_NPCS.has(r.npcId));

describe('quest posts', () => {
  it('places Rook at the South Gate from the start (he spawns at npc-post.rook) and in the city once M06 is done', () => {
    const w = makeWorld([{ ...m04, id: 'm06' }]);
    const dir = new PostDirector(POST_RULES, () => ({ state: w.state, quests: w.manager }), () => w.npcs);
    dir.update();
    expect(w.npcs.placed).toContainEqual(['rook', 'npc-post.rook.gate']);
    w.manager.start('m06');
    w.manager.complete('m06');
    dir.markDirty();
    dir.update();
    expect(w.npcs.placed.at(-1)).toEqual(['rook', 'npc-post.rook']);
  });

  it('moves Gaut to the ford while M04 is active and back after, Aelfreda to the vault during D01', () => {
    const w = makeWorld([m04, d01]);
    const env = () => ({ state: w.state, quests: w.manager });
    const dir = new PostDirector(BRIGHTWATER_RULES, env, () => w.npcs);
    w.manager.onChange(() => dir.markDirty());
    dir.update();
    expect(w.npcs.placed).toEqual([]); // nobody moved yet: leave the layout and tutorial alone
    w.manager.start('m04');
    dir.update();
    expect(w.npcs.placed).toEqual([['gaut', 'npc-post.gaut.ford']]);
    dir.update();
    expect(w.npcs.placed).toHaveLength(1); // idempotent
    w.manager.complete('m04');
    dir.update();
    expect(w.npcs.placed.at(-1)).toEqual(['gaut', 'npc-post.gaut']);
    w.manager.start('d01');
    dir.update();
    expect(w.npcs.placed.at(-1)).toEqual(['aelfreda', 'npc-post.aelfreda.vault']);
  });
  it('re-applies the quest post after a load and retries until the anchor exists', () => {
    const w = makeWorld([m04]);
    const dir = new PostDirector(BRIGHTWATER_RULES, () => ({ state: w.state, quests: w.manager }), () => w.npcs);
    w.manager.start('m04');
    w.npcs.missing.add('npc-post.gaut.ford');
    dir.update();
    expect(w.npcs.placed).toEqual([]);
    w.npcs.missing.clear();
    dir.update();
    expect(w.npcs.placed).toEqual([['gaut', 'npc-post.gaut.ford']]);
    dir.reset(); // save.loaded: another system may have moved him on load, so the post is placed again
    dir.update();
    expect(w.npcs.placed).toEqual([['gaut', 'npc-post.gaut.ford'], ['gaut', 'npc-post.gaut.ford']]);
    dir.update();
    expect(w.npcs.placed).toHaveLength(2);
  });
  it('after M01, Gaut and Aelfreda leave the tutorial gate for their home posts (Aelfreda gives M03 at the chapel)', () => {
    const w = makeWorld([m01, m04]);
    const dir = new PostDirector(BRIGHTWATER_RULES, () => ({ state: w.state, quests: w.manager }), () => w.npcs);
    w.manager.start('m01');
    dir.update();
    expect(w.npcs.placed).toEqual([]); // M01 under way: the tutorial's gate placement stands
    w.manager.complete('m01');
    dir.markDirty();
    dir.update();
    expect(w.npcs.placed).toEqual([['gaut', 'npc-post.gaut'], ['aelfreda', 'npc-post.aelfreda'], ['aldwin', 'npc-post.aldwin']]);
    // A load re-places them even at home (the tutorial may have put them back at the gate meanwhile).
    dir.reset();
    dir.update();
    expect(w.npcs.placed.slice(3)).toEqual([['gaut', 'npc-post.gaut'], ['aelfreda', 'npc-post.aelfreda'], ['aldwin', 'npc-post.aldwin']]);
    w.manager.start('m04');
    dir.markDirty();
    dir.update();
    expect(w.npcs.placed.at(-1)).toEqual(['gaut', 'npc-post.gaut.ford']);
  });
  it('a load that rewinds the quest sends Gaut home even though the load did not move him', () => {
    const w = makeWorld([m04]);
    const dir = new PostDirector(BRIGHTWATER_RULES, () => ({ state: w.state, quests: w.manager }), () => w.npcs);
    w.manager.start('m04');
    dir.update();
    w.manager.load({ quests: {} }); // an earlier save: M04 inactive
    dir.reset();
    dir.update();
    expect(w.npcs.placed.at(-1)).toEqual(['gaut', 'npc-post.gaut']);
  });
  it('does not move anyone while a dialogue is open, then catches up', () => {
    const w = makeWorld([m04]);
    let talking = true;
    const dir = new PostDirector(BRIGHTWATER_RULES, () => ({ state: w.state, quests: w.manager }), () => w.npcs, () => talking);
    w.manager.start('m04');
    dir.update();
    expect(w.npcs.placed).toEqual([]);
    talking = false;
    dir.update();
    expect(w.npcs.placed).toHaveLength(1);
  });
  it('does nothing without an npcs service, then catches up', () => {
    const w = makeWorld([m04]);
    let svc: typeof w.npcs | undefined;
    const dir = new PostDirector(BRIGHTWATER_RULES, () => ({ state: w.state, quests: w.manager }), () => svc);
    w.manager.start('m04');
    dir.update();
    svc = w.npcs;
    dir.update();
    expect(w.npcs.placed).toHaveLength(1);
  });
  it('forgets the applied post while leaveWhen holds, so the row applies again when it stops holding', () => {
    const w = makeWorld();
    const rules = [{
      npcId: 'warden', home: 'npc-post.warden',
      leaveWhen: { flag: 'walking' } as const,
      posts: [{ when: { flag: 'hall.open' } as const, anchorId: 'npc-post.warden.hall' }],
    }];
    const dir = new PostDirector(rules, () => ({ state: w.state, quests: w.manager }), () => w.npcs);
    w.flags.set('hall.open', true);
    dir.update();
    expect(w.npcs.placed).toEqual([['warden', 'npc-post.warden.hall']]);
    w.flags.set('walking', true); // another system moves the NPC: the director does not place them
    dir.markDirty();
    dir.update();
    expect(w.npcs.placed).toHaveLength(1);
    w.flags.delete('walking');
    dir.markDirty();
    dir.update();
    expect(w.npcs.placed).toEqual([['warden', 'npc-post.warden.hall'], ['warden', 'npc-post.warden.hall']]);
  });
  it('never puts Tobb in a rule', () => {
    expect(POST_RULES.map((r) => r.npcId)).not.toContain('tobb');
    const w = makeWorld();
    expect(Object.keys(resolvePosts(POST_RULES, { state: w.state, quests: w.manager })).filter((id) => !DEEPGATE_NPCS.has(id))).toEqual(['gaut', 'aelfreda', 'stane', 'rook', 'refugee-1', 'refugee-2', 'gerta', 'edric', 'grisel-steward', 'vey', 'merrin', 'grisel', 'pennard', 'edda', 'aldwin', 'osgar', 'ketta']);
  });
});

describe('torch', () => {
  function setup(active = { on: true }) {
    const bus = new FakeBus();
    const mods: string[] = [];
    let removed = 0;
    const feet = { x: 1, y: 2, z: 3 };
    const visual: any[] = [];
    let interact: (() => void) | undefined;
    let enabled: (() => boolean) | undefined;
    const t = new TorchSystem({
      bus, braziers: [{ interactableId: 'use:r01-brazier-1', position: () => ({ x: 0, y: 0, z: 0 }) }, { interactableId: 'use:r01-brazier-2', position: () => undefined }],
      player: { id: () => 'p', feet: () => feet, addMoveModifier: (s, m) => { mods.push(`${s}:${(m.lockActions ?? []).join(',')}`); return () => { removed++; }; } },
      registerInteractable: (i) => { interact = i.onInteract; enabled = i.enabled; return () => {}; },
      active: () => active.on, setVisual: (on, at) => visual.push([on, at]),
    });
    return { t, bus, mods, removed: () => removed, feet, visual, interact: () => interact!(), enabled: () => enabled!(), active };
  }
  it('lights, locks only the Surge actions, follows the player and exposes its position', () => {
    const s = setup();
    expect(s.enabled()).toBe(true);
    s.interact();
    expect(s.mods).toEqual(['torch:surge,surgeLeap']);
    expect(s.t.position()).toEqual({ x: 1, y: 3.1, z: 3 });
    s.feet.x = 9; s.t.update();
    expect(s.t.position()!.x).toBe(9);
    expect(s.enabled()).toBe(true); // the same brazier puts it out
    s.interact();
    expect(s.t.position()).toBeNull();
    expect(s.removed()).toBe(1);
  });
  it('goes out on death, load, and when the objective stops being current', () => {
    for (const kill of [(s: ReturnType<typeof setup>) => s.bus.emit('actor.died', { actorId: 'p' }), (s: ReturnType<typeof setup>) => s.bus.emit('save.loaded', {}), (s: ReturnType<typeof setup>) => { s.active.on = false; s.t.update(); }]) {
      const s = setup(); s.interact(); kill(s);
      expect(s.t.position()).toBeNull();
      expect(s.removed()).toBe(1);
    }
  });
  it('another actor dying does not extinguish it; it cannot be lit when inactive', () => {
    const s = setup(); s.interact(); s.bus.emit('actor.died', { actorId: 'x' });
    expect(s.t.carried).toBe(true);
    const off = setup({ on: false }); off.interact();
    expect(off.t.carried).toBe(false);
    expect(off.mods).toEqual([]);
  });
  it('dispose removes the modifier', () => {
    const s = setup(); s.interact(); s.t.dispose();
    expect(s.removed()).toBe(1);
    s.t.update();
    expect(s.t.position()).toBeNull();
  });
});

describe('journal tabs', () => {
  it('shows the Favour tab only after the M08 flag and always Story so far', () => {
    const { state, flags } = fakeState();
    const tabs = new JournalTabs(defaultSlots((k) => state.getFlag(k), () => {}));
    expect(tabs.visible().map((t) => t.id)).toEqual(['story']);
    flags.set(FAVOUR_TAB_FLAG, true);
    expect(tabs.visible().map((t) => t.id)).toEqual(['favour', 'story']);
  });
  it('registerTab replaces a slot and dispose restores it; a throwing visible() hides the tab', () => {
    const { state } = fakeState();
    const slots = defaultSlots((k) => state.getFlag(k), () => {});
    const tabs = new JournalTabs(slots);
    const mine = { id: 'story', titleKey: 'x', visible: () => true, render: () => {} };
    const off = tabs.registerTab(mine);
    expect(tabs.get('story')).toBe(mine);
    off(); off();
    expect(tabs.get('story')).toBe(slots[1]);
    const bad = tabs.registerTab({ id: 'bad', titleKey: 'b', visible: () => { throw new Error('x'); }, render: () => {} });
    expect(tabs.visible().map((t) => t.id)).toEqual(['story']);
    bad();
    expect(tabs.get('bad')).toBeUndefined();
  });
  // A tiny DOM: enough for the panel (the test environment is node).
  class El {
    children: El[] = []; listeners: Record<string, (() => void)[]> = {}; attrs: Record<string, string> = {};
    className = ''; dataset: Record<string, string> = {}; type = ''; private text = '';
    constructor(readonly tag: string, readonly ownerDocument?: any) {}
    get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v: string) { this.text = v; this.children = []; }
    appendChild(c: El) { this.children.push(c); return c; }
    append(...cs: El[]) { this.children.push(...cs); }
    setAttribute(k: string, v: string) { this.attrs[k] = v; }
    addEventListener(t: string, f: () => void) { (this.listeners[t] ??= []).push(f); }
    click() { for (const f of this.listeners.click ?? []) f(); }
    remove() {}
    find(pred: (e: El) => boolean): El[] { return [...(pred(this) ? [this] : []), ...this.children.flatMap((c) => c.find(pred))]; }
  }
  const doc = { createElement: (t: string) => new El(t) } as unknown as Document;
  const model = () => buildJournalModel({ all: () => [] }, { t: (k) => `T:${k}` });
  const t = (k: string) => `T:${k}`;

  it('the panel is the plain quest list without tabs', () => {
    const w = createJournalPanel(model, doc);
    expect((w.element as unknown as El).find((e) => e.className.split(' ').includes('journal-tabs'))).toHaveLength(0);
    expect((w.element as unknown as El).textContent).toContain('T:quest.journal.empty');
  });
  it('shows tab buttons, switches on click, and a tab that throws does not break the panel', () => {
    const { state, flags } = fakeState();
    flags.set(FAVOUR_TAB_FLAG, true);
    const tabs = new JournalTabs(defaultSlots((k) => state.getFlag(k), (root) => { (root as unknown as El).textContent = 'placeholder'; }));
    const w = createJournalPanel(model, doc, { tabs, t });
    const root = w.element as unknown as El;
    const buttons = () => root.find((e) => e.tag === 'button');
    expect(buttons().map((b) => b.dataset.tab)).toEqual(['quests', 'favour', 'story']);
    buttons()[1].click();
    expect(root.textContent).toContain('placeholder');
    const off = tabs.registerTab({ id: 'favour', titleKey: 'f', visible: () => true, render: () => { throw new Error('boom'); } });
    expect(() => w.refresh()).not.toThrow();
    expect(root.find((e) => e.tag === 'button')).toHaveLength(3);
    off();
    buttons()[0].click();
    expect(root.textContent).toContain('T:quest.journal.empty');
  });
  it('falls back to Quests when the active tab becomes hidden', () => {
    const { state, flags } = fakeState();
    flags.set(FAVOUR_TAB_FLAG, true);
    const tabs = new JournalTabs(defaultSlots((k) => state.getFlag(k), (root) => { (root as unknown as El).textContent = 'placeholder'; }));
    const w = createJournalPanel(model, doc, { tabs, t });
    const root = w.element as unknown as El;
    root.find((e) => e.dataset.tab === 'favour')[0].click();
    flags.delete(FAVOUR_TAB_FLAG);
    w.refresh();
    expect(root.textContent).toContain('T:quest.journal.empty');
  });
});

describe('M05 and M03 gating (real defs)', () => {
  it('M05 writes tobbJoined once on start and story.m05.complete once on completion', () => {
    const w = makeWorld([m05]);
    w.manager.start('m05');
    expect(w.flags.get('story.m05.tobbJoined')).toBe(true);
    expect(w.flags.has('story.m05.complete')).toBe(false);
    w.flags.delete('story.m05.tobbJoined');
    w.manager.load(w.manager.serialize()); // a load must not re-run onStart
    expect(w.flags.has('story.m05.tobbJoined')).toBe(false);
  });
  it('M05 does not softlock when the wardstones and the shrine were done before the quest', () => {
    const w = makeWorld([m05]);
    w.flags.set('world.deadroad.wardstones.done', true);
    w.flags.set('shrine.quenchstone.lit', true);
    w.manager.start('m05');
    // the density pass: the journal first, then the stones credit at once; the shrine push still has to be held
    w.bus.emit('dialogue.ended', { npcId: 'note-m05-journal', reason: 'completed' });
    expect(w.manager.objectiveDone('m05', 'o1')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m05', 'push')).toBe(true);
    for (let i = 0; i < 4; i++) w.bus.emit('actor.died', { actorId: `s${i}`, killerId: 'p', kind: 'ash-wraith', spawnTag: 'm05.shrine' });
    expect(w.manager.objectiveDone('m05', 'o2')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m05', 'o3')).toBe(true);
    w.bus.emit('dialogue.ended', { npcId: 'tobb', reason: 'completed' });
    expect(w.manager.state('m05')).toBe('completed');
    expect(w.flags.get('story.m05.complete')).toBe(true);
    expect(w.calls).toContain('xp:300:quest:m05');
  });
  it('M05 completion survives a save and load without re-running (the flag stays set)', () => {
    const w = makeWorld([m05]);
    w.manager.start('m05');
    w.bus.emit('dialogue.ended', { npcId: 'note-m05-journal', reason: 'completed' });
    w.bus.emit('wardstones.complete', {});
    for (let i = 0; i < 4; i++) w.bus.emit('actor.died', { actorId: `s${i}`, killerId: 'p', kind: 'ash-wraith', spawnTag: 'm05.shrine' });
    w.bus.emit('shrine.rekindled', { shrineId: 'other' });
    expect(w.manager.objectiveDone('m05', 'o2')).toBe(false);
    w.bus.emit('shrine.rekindled', { shrineId: 'quenchstone' });
    w.bus.emit('dialogue.ended', { npcId: 'tobb', reason: 'completed' });
    const saved = JSON.parse(JSON.stringify(w.manager.serialize()));
    const xpBefore = w.calls.filter((c) => c.startsWith('xp')).length;
    w.manager.load(saved);
    expect(w.manager.state('m05')).toBe('completed');
    expect(w.flags.get('story.m05.complete')).toBe(true);
    expect(w.calls.filter((c) => c.startsWith('xp')).length).toBe(xpBefore);
  });
  it('M03 credits the Leap when it was learned before o3 became current', () => {
    const w = makeWorld([m03]);
    w.manager.start('m03');
    w.bus.emit('dialogue.ended', { npcId: 'aelfreda', reason: 'completed' });
    w.bus.emit('interact', { interactableId: 'use:shard-study' });
    w.bus.emit('dialogue.ended', { npcId: 'note-m03-font', reason: 'completed' });
    w.flags.set('ability.surge-leap.learned', true);
    w.bus.emit('dialogue.ended', { npcId: 'note-m03-ember', reason: 'completed' });
    w.bus.emit('dialogue.ended', { npcId: 'note-m03-record', reason: 'completed' });
    w.bus.emit('dialogue.ended', { npcId: 'aelfreda', reason: 'completed' }); // no objective listens; o3 needs doneWhen on becoming current
    w.manager.load(w.manager.serialize());
    w.manager.recheck();
    expect(w.manager.objectiveDone('m03', 'o3')).toBe(true);
  });
  it('M03 o6 counts a Release like a kill, once per wraith', () => {
    const w = makeWorld([m03]);
    w.manager.start('m03');
    for (const o of ['o1', 'o2', 'study', 'o3', 'o4', 'candle', 'grave', 'o5']) w.manager.completeObjective('m03', o);
    w.bus.emit('mercy', { verb: 'release', creature: 'ash-wraith', actorId: 'w0', spawnTag: 'm01' }); // Kettlewick wraith
    expect(w.manager.objectives('m03').find((o) => o.def.id === 'o6')!.progress).toBe(0);
    w.bus.emit('mercy', { verb: 'release', creature: 'ash-wraith', actorId: 'w1', spawnTag: 'm03.churchyard' });
    w.bus.emit('mercy', { verb: 'release', creature: 'ash-wraith', actorId: 'w1', spawnTag: 'm03.churchyard' }); // same wraith
    w.bus.emit('actor.died', { actorId: 'w1', killerId: 'p', kind: 'ash-wraith', spawnTag: 'm03.churchyard' }); // and its death
    expect(w.manager.objectives('m03').find((o) => o.def.id === 'o6')!.progress).toBe(1);
    for (const id of ['w2', 'w3']) w.bus.emit('mercy', { verb: 'release', creature: 'ash-wraith', actorId: id, spawnTag: 'm03.churchyard' });
    w.bus.emit('actor.died', { actorId: 'w4', killerId: 'p', kind: 'ash-wraith', spawnTag: 'm03.churchyard' });
    expect(w.manager.objectiveDone('m03', 'o6')).toBe(true);
    expect(w.manager.state('m03')).toBe('active'); // o7 report remains
  });
});
