// G1: the Controls tab's rows, derived from ACTIONS and ACTION_DEFS so a new action (G2's gamepad ones included) shows
// up without touching the view. Fixed actions (Esc) are left out; actions no group names land in "Other".
import { ACTIONS, ACTION_DEFS, type Action } from '../input/actions';

export type ControlGroup = 'move' | 'combat' | 'abilities' | 'menus' | 'dialogue' | 'other';

const GROUP_OF: Partial<Record<Action, ControlGroup>> = {
  moveForward: 'move', moveBack: 'move', moveLeft: 'move', moveRight: 'move', sprint: 'move', jump: 'move',
  sneak: 'move', mount: 'move', interact: 'move',
  attack1: 'combat', attack2: 'combat', attack3: 'combat', attack4: 'combat', block: 'combat', dodge: 'combat',
  lockOn: 'combat', surge: 'combat', surgeLeap: 'combat', mercy: 'combat',
  ability1: 'abilities', ability2: 'abilities', ability3: 'abilities', ability4: 'abilities', ability5: 'abilities',
  ability6: 'abilities',
  inventory: 'menus', skills: 'menus', journal: 'menus', map: 'menus', codex: 'menus', party: 'menus',
  dialogueNext: 'dialogue', dialogueChoice1: 'dialogue', dialogueChoice2: 'dialogue', dialogueChoice3: 'dialogue',
  dialogueChoice4: 'dialogue',
};

export const CONTROL_GROUPS: readonly ControlGroup[] = ['move', 'combat', 'abilities', 'menus', 'dialogue', 'other'];

export interface ControlRow {
  action: Action;
  group: ControlGroup;
  /** String key of the action's name; the view falls back to the action id when it is missing. */
  labelKey: string;
}

export function controlRows(): ControlRow[] {
  const rows = ACTIONS.filter((a) => ACTION_DEFS[a].rebindable).map((action) => ({
    action,
    group: GROUP_OF[action] ?? 'other',
    labelKey: `settings.action.${action}`,
  }));
  return CONTROL_GROUPS.flatMap((g) => rows.filter((r) => r.group === g));
}
