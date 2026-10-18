export interface PortraitInfo { color: string; initials: string }

const TABLE: Record<string, PortraitInfo> = {
  cael: { color: '#4a6fa5', initials: 'C' },
  gaut: { color: '#8a5a3c', initials: 'G' },
  edda: { color: '#7a4f7a', initials: 'E' },
  stane: { color: '#5f6f5a', initials: 'S' },
  aelfreda: { color: '#a0793a', initials: 'Æ' },
};

function initialsOf(id: string): string {
  const parts = id.split(/[^a-zA-Z0-9À-ɏ]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
}

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 35%, 40%)`;
}

/** Portrait id (optional) and speaker id to a plate. Unknown ids fall back to initials. */
export function portraitFor(portraitId: string | undefined, speaker: string): PortraitInfo {
  if (portraitId) {
    const exact = TABLE[portraitId] ?? TABLE[portraitId.split(/[-_.]/)[0]!];
    if (exact) return exact;
  }
  const sp = TABLE[speaker];
  if (sp) return sp;
  const id = portraitId || speaker || '?';
  return { color: hashColor(id), initials: initialsOf(speaker || id) };
}
