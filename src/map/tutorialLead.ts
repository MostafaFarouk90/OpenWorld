import type { TutorialService } from '../tutorial/service';

/** The tutorial's target as one extra quest lead, or the leads unchanged when there is none. */
export function withTutorialLead<T extends { id: string; x: number; z: number; label?: string }>(
  leads: readonly T[],
  svc: Pick<TutorialService, 'target'> | undefined | null,
): Array<T | { id: string; x: number; z: number; label: string }> {
  const t = svc?.target();
  if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.z)) return [...leads];
  return [...leads, { id: 'tutorial.target', x: t.x, z: t.z, label: 'tutorial.target' }];
}
