import { describe, expect, it } from 'vitest';
import { QuestNotes, noteNeeded } from '../../notes';
import { ACT2_NOTE_LIST, ACT2_QUEST_NOTES } from './notes';
import { HARROWMARK_LAYOUT } from '../../../harrowmark/harrowmark.layout';
import { ACT2_QUEST_DEFS } from './index';
import { makeWorld } from '../../testKit';

// Playtest 2026-10-23 (act2-followups/playtest.md): note-m15-map sits on Corwin's exact spot with priority 1. QuestNotes
// registers that priority for good and `enabled()` never turns false, so after the ledgers are read the note still wins
// every focus tie (score = distance - priority) and Corwin ('doubter' objective) can only be reached from the 0.5 m ring
// between the note's radius (2) and his (2.5). The note may outrank an NPC only while it is still worth reading.
describe('notes that stand on an NPC (A12 NOTES_UNDER_NPCS)', () => {
  const under = ACT2_QUEST_NOTES.filter((s) => (s.priority ?? 0) > 0);

  it('there are such notes (the guard below is not vacuous)', () => {
    expect(under.map((s) => s.interactableId).sort()).toEqual(['use:note-m13-shield', 'use:note-m15-map', 'use:note-m22-stalls', 'use:note-r11-camp-1']);
  });

  it.each(under.map((s) => [s.interactableId, s] as const))('%s stops outranking its NPC once it has been read', (_id, spec) => {
    const registered: Array<{ priority?: number; enabled(): boolean; onInteract(): void }> = [];
    const notes = new QuestNotes([spec], {
      bus: { on: () => () => {}, emit: () => {} } as never,
      env: () => ({}) as never,
      anchor: () => ({ x: 0, y: 0, z: 0 }),
      register: (i) => { registered.push(i); return () => {}; },
      startDialogue: () => true,
    });
    notes.update();
    const note = registered[0];
    note.onInteract(); // the player reads it
    // After the read the note must not keep beating the NPC at the same spot: no priority, or no longer enabled.
    expect((note.priority ?? 0) > 0 && note.enabled()).toBe(false);
    notes.dispose();
  });
});

// The fix in play terms, on the real QuestManager (playtest bug 1): which of the note and the NPC standing on it the focus
// tie goes to, as the quest moves on.
describe('a note on an NPC gives way when it should (real QuestManager)', () => {
  type Reg = { priority?: number; enabled(): boolean; onInteract(): void };
  function setup(questId: 'm13' | 'm15' | 'm22' | 'r11') {
    const def = ACT2_QUEST_DEFS.find((q) => q.id === questId)!;
    const w = makeWorld([{ ...def, startWhen: undefined }]);
    expect(w.manager.start(questId)).toBe(true);
    const m = w.manager;
    const specs = ACT2_QUEST_NOTES.filter((s) => s.outranks?.quest === questId);
    const registered = new Map<string, Reg>();
    const notes = new QuestNotes(specs, {
      bus: w.bus,
      env: () => ({ state: w.state, quests: m }),
      anchor: () => ({ x: 0, y: 0, z: 0 }),
      register: (i) => { registered.set(i.id, i); return () => {}; },
      startDialogue: () => true,
      quests: {
        isObjectiveCurrent: (q, o) => m.isObjectiveCurrent(q, o),
        counted: (q, o, k) => m.counted(q, o, k),
        npcObjectiveLive: (npc) => m.active().some((q) => m.objectives(q).some((v) => v.current && v.def.type === 'talk' && v.def.target === npc)),
      },
    });
    notes.update();
    const upTo = (o: string) => {
      for (const x of def.objectives) { if (x.id === o) break; m.completeObjective(questId, x.id); }
    };
    const read = (id: string, reason = 'completed') => w.bus.emit('dialogue.ended', { npcId: id, dialogueId: id, reason });
    return { w, m, notes, registered, upTo, read, def };
  }
  const prio = (r: Reg | undefined) => r?.priority ?? 0;

  it('M15: note-m15-map outranks Corwin while the ledgers are current and it is unread; once read, Corwin wins', () => {
    const t = setup('m15');
    const map = t.registered.get('use:note-m15-map')!;
    t.upTo('ledgers');
    expect(prio(map)).toBe(1);
    map.onInteract();
    t.read('note-m15-map');
    expect(prio(map)).toBe(0);
    expect(t.m.counted('m15', 'ledgers', 'note-m15-map')).toBe(true);
    // the other two ledgers: the objective moves on toward Corwin, and the map never comes back
    t.read('note-m15-ledger');
    t.read('note-m15-tally');
    expect(prio(map)).toBe(0);
  });

  it('a read cut short (death, skip) restores the priority, so the note can be reached again', () => {
    const t = setup('m15');
    const map = t.registered.get('use:note-m15-map')!;
    t.upTo('ledgers');
    map.onInteract();
    expect(prio(map)).toBe(0);
    t.read('note-m15-map', 'death');
    expect(prio(map)).toBe(1);
    expect(t.m.counted('m15', 'ledgers', 'note-m15-map')).toBe(false);
  });

  it('a load clears the session\'s opened notes: the loaded quests decide (read there means no priority)', () => {
    const t = setup('m15');
    const map = t.registered.get('use:note-m15-map')!;
    t.upTo('ledgers');
    map.onInteract();
    expect(prio(map)).toBe(0);
    t.w.bus.emit('save.loaded', { slot: 'auto' });
    expect(prio(map)).toBe(1); // the save was from before the read
  });

  it('before its objective is current (the quest not that far, or done), the note does not outrank the NPC', () => {
    const t = setup('m15');
    expect(prio(t.registered.get('use:note-m15-map'))).toBe(0); // m15 starts with Osgar's brief
    t.upTo('ledgers');
    expect(prio(t.registered.get('use:note-m15-map'))).toBe(1);
  });

  it.each([['m13', 'use:note-m13-shield', 'kin', 'hall'], ['r11', 'use:note-r11-camp-1', 'widow', 'camp']] as const)(
    '%s: while the NPC\'s own talk objective is live the note gives way; when the reads are current it outranks',
    (q, note, npcObjective, reads) => {
      const t = setup(q);
      t.upTo(npcObjective);
      expect(t.m.isObjectiveCurrent(q, npcObjective)).toBe(true);
      expect(prio(t.registered.get(note))).toBe(0);
      t.upTo(reads);
      expect(prio(t.registered.get(note))).toBe(1);
    },
  );

  it('M22: note-m22-stalls (on Gerta\'s market spot) outranks her while the stalls read is current and unread, then gives way', () => {
    const t = setup('m22');
    const stalls = t.registered.get('use:note-m22-stalls')!;
    expect(prio(stalls)).toBe(0); // the read is not current yet
    t.upTo('stalls');
    expect(t.m.isObjectiveCurrent('m22', 'stalls')).toBe(true);
    expect(prio(stalls)).toBe(1);
    stalls.onInteract();
    t.read('note-m22-stalls');
    expect(t.m.counted('m22', 'stalls', 'note-m22-stalls')).toBe(true);
    expect(prio(stalls)).toBe(0);
  });

  it('the stalls note and Gerta\'s post share an anchor, which is why the note needs the priority', () => {
    const post = HARROWMARK_LAYOUT.anchors.find((a) => a.id === 'npc-post.gerta.guild')!;
    const note = HARROWMARK_LAYOUT.anchors.find((a) => a.id === ACT2_NOTE_LIST.find((x) => x.id === 'note-m22-stalls')!.anchorId)!;
    expect([note.x, note.z]).toEqual([post.x, post.z]);
  });

  it('a refused open (another dialogue up) does not count as opened', () => {
    const def = ACT2_QUEST_DEFS.find((q) => q.id === 'm15')!;
    const w = makeWorld([{ ...def, startWhen: undefined }]);
    w.manager.start('m15');
    let reg: Reg | undefined;
    const notes = new QuestNotes(ACT2_QUEST_NOTES.filter((s) => s.interactableId === 'use:note-m15-map'), {
      bus: w.bus, env: () => ({ state: w.state, quests: w.manager }), anchor: () => ({ x: 0, y: 0, z: 0 }),
      register: (i) => { reg = i; return () => {}; },
      startDialogue: () => false,
    });
    notes.update();
    reg!.onInteract();
    expect(reg!.priority).toBe(1); // no quests port: only an open read takes it away
  });
});

// Playtest bug 2, the quest side: which notes count as `live` (an objective needs them now), so a companion yields to them.
describe('noteNeeded (real QuestManager)', () => {
  it('a note is needed while its read objective is current and has not counted it; not before, not after', () => {
    const def = ACT2_QUEST_DEFS.find((q) => q.id === 'm15')!;
    const w = makeWorld([{ ...def, startWhen: undefined }]);
    w.manager.start('m15');
    expect(noteNeeded(w.manager, 'note-m15-tally')).toBe(false); // the brief comes first
    for (const o of def.objectives) { if (o.id === 'ledgers') break; w.manager.completeObjective('m15', o.id); }
    expect(noteNeeded(w.manager, 'note-m15-tally')).toBe(true);
    expect(noteNeeded(w.manager, 'note-d03-ledger')).toBe(false); // another quest's note
    w.bus.emit('dialogue.ended', { npcId: 'note-m15-tally', dialogueId: 'note-m15-tally', reason: 'completed' });
    expect(noteNeeded(w.manager, 'note-m15-tally')).toBe(false);
    expect(noteNeeded(w.manager, 'note-m15-map')).toBe(true);
  });

  it('a talk objective that targets a note (the Act 1 style) makes it needed', () => {
    const w = makeWorld([{ id: 'qx', titleKey: 'k', summaryKey: 'k', objectives: [{ id: 'o', type: 'talk', target: 'note-x', textKey: 'k' }] } as never]);
    w.manager.start('qx');
    expect(noteNeeded(w.manager, 'note-x')).toBe(true);
    expect(noteNeeded(w.manager, 'note-y')).toBe(false);
  });
});
