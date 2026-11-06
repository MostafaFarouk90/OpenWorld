import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import { installSceneSubtitles, speakerName } from './subtitle';

function rig() {
  const events = new EventBus<GameEventMap>(() => {});
  const shown: string[] = [];
  let cleared = 0;
  const strings: Record<string, string> = { 'npc.vey.name': 'Regent Vey', 'scene.x.1': 'There will be no vote.' };
  const off = installSceneSubtitles({
    events, t: (k) => strings[k] ?? k,
    cards: { show: (text) => void shown.push(text), clear: () => void cleared++ },
  });
  return { events, shown, cleared: () => cleared, off };
}

describe('scene subtitles', () => {
  it('shows each line with its speaker\'s name', () => {
    const r = rig();
    r.events.emit('scene.line', { id: 'x', speakerId: 'vey', textKey: 'scene.x.1' });
    expect(r.shown).toEqual(['Regent Vey: There will be no vote.']);
  });

  it('clears when the scene ends, however it ends', () => {
    const r = rig();
    r.events.emit('scene.line', { id: 'x', speakerId: 'vey', textKey: 'scene.x.1' });
    r.events.emit('scene.ended', { id: 'x', reason: 'skipped' });
    expect(r.cleared()).toBe(1);
  });

  it('clears on a load (which drops the scene without an end event)', () => {
    const r = rig();
    r.events.emit('scene.line', { id: 'x', speakerId: 'vey', textKey: 'scene.x.1' });
    r.events.emit('save.loaded', {} as never);
    expect(r.cleared()).toBe(1);
  });

  it('draws nothing for a scene without lines', () => {
    const r = rig();
    r.events.emit('scene.started', { id: 'y' });
    r.events.emit('scene.checkpoint', { id: 'y', checkpoint: 'a' });
    r.events.emit('scene.ended', { id: 'y', reason: 'finished' });
    expect(r.shown).toEqual([]);
  });

  it('stops listening on dispose', () => {
    const r = rig();
    r.off();
    r.events.emit('scene.line', { id: 'x', speakerId: 'vey', textKey: 'scene.x.1' });
    expect(r.shown).toEqual([]);
  });

  it('names Cael, a known NPC, and an unknown id', () => {
    const t = (k: string) => (k === 'npc.gaut.name' ? 'Sir Gaut' : k);
    expect([speakerName('cael', t), speakerName('gaut', t), speakerName('rook', t)]).toEqual(['Cael', 'Sir Gaut', 'Rook']);
  });
});
