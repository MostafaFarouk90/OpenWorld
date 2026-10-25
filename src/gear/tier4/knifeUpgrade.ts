// K10: the R15 hut branch makes Frostbrow's Hunting Knife keen whenever the knife is held and `story.r15.choice` is
// `hut`, in either order (the choice is banked, plan 2.4 and review finding 20). The item id never changes, so quest
// checks on `frostbrows-hunting-knife` (K13's M29) keep working; the bonus and the toast read this predicate.
import { ACT3_TRINKETS } from './catalog';

export interface KnifePorts {
  has(id: string): boolean;
  flag(key: string): unknown;
}

export const knifeIsKeen = (p: KnifePorts): boolean => p.flag('story.r15.choice') === 'hut' && p.has(ACT3_TRINKETS.knife);
