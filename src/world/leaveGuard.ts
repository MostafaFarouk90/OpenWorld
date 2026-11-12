// G1: the "leave site?" guard (startWorld's beforeunload) asks before a tab close loses progress. "Quit to title" in the
// pause menu has already saved and confirmed, so it lifts the guard for the one reload it makes.

let lifted = false;

/** Lets the next unload through without the browser's "leave site?" dialog. */
export function liftLeaveGuard(): void {
  lifted = true;
}

/** True while the guard should ask. */
export function leaveGuardActive(): boolean {
  return !lifted;
}
