import type { PluginModule } from './plugins';

/**
 * Every `*.plugin.ts` under src/ (fixtures excluded). The only place that globs, so tests can inject
 * modules into `Game.loadPlugins` instead. Plugin modules must have no top-level side effects.
 */
export const PLUGIN_MODULES: Readonly<Record<string, PluginModule>> = import.meta.glob<PluginModule>(
  ['/src/**/*.plugin.ts', '!/src/**/__fixtures__/**'],
  { eager: true },
);
