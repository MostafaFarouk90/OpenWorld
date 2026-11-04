// How a `?act3=` boot starts (K16): load the committed fixture when it is fresh, else run K0's flag injection. Ticked by
// the jump plugin each rules step before the jump itself; the jump runs only once this says `inject`.
import type { Act3FreshnessMeta } from './act3FixtureKey';
import { chooseAct3Start } from './act3FixtureKey';

export type Act3StartState = 'finding' | 'deciding' | 'loading' | 'loaded' | 'inject';

export interface Act3FixtureStartPorts {
  /** The committed fixture, or null (a rejected promise counts as none). */
  find(): Promise<{ name: string; save: Record<string, unknown>; meta: Act3FreshnessMeta } | null>;
  /** Saves have settled at boot and the quests are registered. */
  ready(): boolean;
  /** The quest defs this build knows among the ids that shape the fixture. */
  known(): string[];
  /** Applies a save file as Continue does; absent when the save service cannot. */
  loadFile?(save: Record<string, unknown>): Promise<boolean>;
  warn(message: string): void;
}

export class Act3FixtureStart {
  state: Act3StartState;
  private found: Awaited<ReturnType<Act3FixtureStartPorts['find']>> = null;

  constructor(readonly name: string, wantFixture: boolean, private readonly ports: Act3FixtureStartPorts) {
    this.state = wantFixture ? 'finding' : 'inject';
    if (!wantFixture) return;
    ports.find().then(
      (f) => { this.found = f; if (this.state === 'finding') this.state = 'deciding'; },
      () => { if (this.state === 'finding') this.state = 'deciding'; },
    );
  }

  /** True while the jump should run (injection); false while a fixture is being found, decided, loading or loaded. */
  tick(): boolean {
    if (this.state === 'deciding' && this.ports.ready()) {
      const choice = chooseAct3Start(this.name, true, this.found?.meta ?? null, this.ports.known());
      if (choice.use === 'inject') {
        this.ports.warn(`${choice.reason}; using flag injection`);
        this.state = 'inject';
      } else if (!this.ports.loadFile) {
        this.ports.warn(`fixture ${this.name}: the save service cannot load a file; using flag injection`);
        this.state = 'inject';
      } else {
        this.state = 'loading';
        this.ports.loadFile(this.found!.save).then(
          (ok) => {
            if (ok) this.state = 'loaded';
            else {
              this.ports.warn(`fixture ${this.name} did not load; using flag injection`);
              this.state = 'inject';
            }
          },
          () => {
            this.ports.warn(`fixture ${this.name} failed to load; using flag injection`);
            this.state = 'inject';
          },
        );
      }
    }
    return this.state === 'inject';
  }
}
