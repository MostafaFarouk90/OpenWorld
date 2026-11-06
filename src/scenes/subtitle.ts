// The scene subtitle (L10 PR 2, an L0 carry): L0's sequencer emits `scene.line` but nothing drew it, so a scene's spoken
// lines were invisible. One subscriber shows each line as a speaker card in the HUD's subtitle slot (the tutorial's
// LineCards look) and clears it when the scene ends or a save is loaded. A scene without lines draws nothing.
import type { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';

export interface SubtitleCards {
  show(text: string, slot: 'subtitle'): void;
  clear(slot?: 'subtitle'): void;
}

export interface SceneSubtitleDeps {
  events: Pick<EventBus<GameEventMap>, 'on'>;
  /** The localized text of a key (the key itself when it is missing). */
  t(key: string): string;
  cards: SubtitleCards;
}

/** The player's knight speaks as Cael; an NPC by its `npc.<id>.name` string, else its id capitalized. */
export function speakerName(id: string, t: (key: string) => string): string {
  if (id === 'cael' || id === 'player') return 'Cael';
  const key = `npc.${id}.name`;
  const name = t(key);
  return name && name !== key ? name : id.charAt(0).toUpperCase() + id.slice(1);
}

export function installSceneSubtitles(d: SceneSubtitleDeps): () => void {
  const offs = [
    d.events.on('scene.line', (e) => d.cards.show(`${speakerName(e.speakerId, d.t)}: ${d.t(e.textKey)}`, 'subtitle')),
    d.events.on('scene.ended', () => d.cards.clear('subtitle')),
    // a load drops the running scene without `scene.ended`
    d.events.on('save.loaded', () => d.cards.clear('subtitle')),
  ];
  return () => {
    for (const o of offs) o();
    d.cards.clear();
  };
}
