/** Gear, tempering and forge numbers (A10 R1 to R5). Invented values are logged in design/changes-applied.md. */
export const GEAR_TUNING = {
  /** Added to the mount's stamina maximum while the Ashmare saddle is held (R7). */
  saddleStaminaBonus: 30,
  maxTemper: 5,
  /** Gold per level by gear tier (tier 1 is gold only). */
  goldPerLevel: { 1: 15, 2: 40, 3: 90 } as Readonly<Record<number, number>>,
  /** Tempering the first two pieces at the Anvil while M14 is active costs nothing. */
  lessonRuns: 2,
  forge: { ingots: 1, goldWeapon: 150, goldArmour: 120 },
  rhythm: {
    bpm: 94,
    /** The 16-step bar: four steps to a beat. */
    divisions: 4,
    stepsPerBar: 16,
    countInSteps: 4,
    perfectMs: 45,
    goodMs: 100,
  },
  combat: {
    /** The best Act 1 weapon (Marshal's Longsword): a tier 2 or 3 weapon scales by stat / this. */
    weaponBaseline: 18,
    temperPerLevel: 0.05,
    /** Mitigation = 100 / (100 + defenceScale * sum of armour stats). */
    defenceScale: 2,
    ember: { dps: 3, seconds: 3, statusId: 'gear.ember' },
    swornBonus: 0.25,
    cinderResist: 0.25,
  },
} as const;

export const SADDLE_STAMINA_BONUS = GEAR_TUNING.saddleStaminaBonus;
