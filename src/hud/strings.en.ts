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
  'hud.nextUnlock.learn': 'Spend your skill point: {skill}',
  'hud.nextUnlock.points': '{points} skill points to spend',
  'hud.nextUnlock.point': '1 skill point to spend',
  'hud.scar.tip': 'Scars: each takes max health',
  'hud.leap.name': 'Surge Leap',
  'hud.boss.shield': 'Shielded',
  'hud.boss.release': 'Release open',
  'hud.companion.tobb': 'Tobb',
  'hud.companion.aura': 'Battle-song',
  'hud.fog.toast': 'The ash-fall pushes you back. The road east waits until the Dead Road is cleared.',
  'hud.respec.title': 'Respec',
  'hud.respec.free': 'Your first respec is free.',
  'hud.respec.cost': 'Respec costs {gold} gold.',
  'hud.respec.cannotAfford': 'You cannot afford this.',
  'hud.respec.confirm': 'Confirm',
  'hud.respec.cancel': 'Cancel',
  'hud.respec.options': 'Choose',
  'hud.stealth.eye': 'Detection',
  'hud.stealth.noise': 'Noise you are making',
  'hud.chase.seconds': '{seconds} s',
  'hud.chase.again': 'Again!',
  'hud.chase.gap': '{metres} m',
  'hud.bar.mount': 'Mount stamina',
  'hud.bolts.label': 'Crossbow bolts',
  'hud.gold.label': 'Gold',
  'hud.ending.title': 'Smoke Over Harrowmark',
  'hud.ending.hint': 'Press any key to continue',
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
