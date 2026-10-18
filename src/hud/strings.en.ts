export const HUD_STRINGS_EN: Readonly<Record<string, string>> = {
  'hud.level': 'Lv {level}',
  'hud.max': 'MAX',
  'hud.bar.health': 'Health',
  'hud.bar.stamina': 'Stamina',
  'hud.bar.burn': 'Burn',
  'hud.bar.ember': 'Ember',
  'hud.bar.xp': 'Experience',
  'hud.buffs.label': 'Active effects',
  'hud.quest.optional': '(optional)',
  'hud.slot.empty': 'Empty slot',
  'hud.slot.cost': '{cost} Ember',
  'hud.nextUnlock.level': '{remaining} XP to level {level}',
  'hud.nextUnlock.skill': '{remaining} XP to unlock {skill}',
  'hud.nextUnlock.points': '{points} skill points to spend',
  'hud.nextUnlock.point': '1 skill point to spend',
};

export function formatHud(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** English fallback translator for widgets constructed without a strings service. */
export function defaultHudT(key: string, params?: Record<string, string | number>): string {
  const s = HUD_STRINGS_EN[key];
  return s === undefined ? `[[${key}]]` : formatHud(s, params);
}
