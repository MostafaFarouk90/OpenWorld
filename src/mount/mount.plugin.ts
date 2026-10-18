import type { GamePlugin } from '../core/plugins';
import { MountController } from './MountController';
import { MOUNT_STRINGS_EN } from './strings.en';

let controller: MountController | null = null;

function teardown(): void {
  const c = controller;
  controller = null;
  try {
    c?.dispose();
  } catch (err) {
    console.warn('mount: dispose failed', err);
  }
}

/** Slice 2 thread 20: the Ashmare (plans/slice-2-ashmare.md). */
export default {
  id: 'mount',
  dependsOn: ['core'],
  setup(ctx) {
    try {
      ctx.strings.register('en', MOUNT_STRINGS_EN);
      controller = new MountController(ctx);
      controller.setup();
      ctx.services.provide('mount', controller);
    } catch (err) {
      teardown();
      throw err;
    }
  },
  dispose: teardown,
} satisfies GamePlugin;
