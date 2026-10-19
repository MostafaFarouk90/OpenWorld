/** Events of the Knighting Day director (thread 9), typed by module augmentation. */
declare module '../core/events' {
  interface GameEventMap {
    /**
     * One more unit of a beat step's goals (a wraith down, a banner seen, a block). The tutorial's
     * marker quests count it with `event` objectives matched on `{ beatId, step }`.
     */
    'tutorial.goal': { beatId: string; step: number };
  }
}

export {};
