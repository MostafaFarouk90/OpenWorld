import type { BurnZone } from '../../spells/Burn';
import type { SurgeFormImpl } from '../../spells/SurgeAndRally';
import type { EmberwrightRuntime } from './runtime';
import { emberwrightSurgeForm } from './surge';

const ZONES: readonly BurnZone[] = ['warm', 'blaze', 'cinder'];

export function surgeFormsFor(runtime: EmberwrightRuntime): Array<[BurnZone, SurgeFormImpl]> {
  return ZONES.map((z) => [z, emberwrightSurgeForm(z, runtime)]);
}
