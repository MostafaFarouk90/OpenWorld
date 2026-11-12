// G1: companion barks as subtitle lines. `companion.banter` carries the line's string key, but before G1 nothing drew
// it: barks have no voice, so the writing was never seen. One subscriber shows "Hrolf: …" in the subtitle slot while
// the setting is on, and stays quiet in cutscenes and dialogue, where the scene's own lines own that slot.
import type { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import { speakerName } from '../scenes/subtitle';

export interface BarkCards {
  show(text: string, slot: 'subtitle'): void;
  clear(slot?: 'subtitle'): void;
}

export interface BarkSubtitleDeps {
  events: Pick<EventBus<GameEventMap>, 'on'>;
  t(key: string): string;
  has(key: string): boolean;
  cards: BarkCards;
  enabled(): boolean;
  /** True while the scene or a dialogue owns the subtitle slot. */
  busy(): boolean;
}

/** "Hrolf" from `companion.hrolf.name`, else the scene subtitle's naming (npc.<id>.name, then the id capitalized). */
export function companionName(id: string, d: Pick<BarkSubtitleDeps, 't' | 'has'>): string {
  for (const key of [`companion.${id}.name`, `npc.${id}.name`]) if (d.has(key)) return d.t(key);
  return speakerName(id, (k) => (d.has(k) ? d.t(k) : k));
}

export function installBarkSubtitles(d: BarkSubtitleDeps): () => void {
  const offs = [
    d.events.on('companion.banter', (e) => {
      if (!d.enabled() || d.busy() || !d.has(e.lineKey)) return;
      d.cards.show(`${companionName(e.companionId, d)}: ${d.t(e.lineKey)}`, 'subtitle');
    }),
    d.events.on('save.loaded', () => d.cards.clear('subtitle')),
  ];
  return () => {
    for (const o of offs) o();
    d.cards.clear();
  };
}
