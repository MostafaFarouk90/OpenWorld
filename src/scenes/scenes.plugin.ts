// Plugin `scenes` (L0, contracts v0.8 item 9): the `scenes` service on SceneRunner. While a scene runs, autosave is held
// (`save.suspend('scene')`), the movement mode is `scene` (no fast travel, the mount is dismissed and refused), and the
// input context is `cutscene`. Checkpoints save (`zone`) and persist `scenes` v1; a load replays from the last checkpoint;
// the player's death cancels. Headless (no camera rig) shots and anims are no-ops and lines just wait.
import { PLAYER_ID } from '../actors/teams';
import type { GamePlugin } from '../core/plugins';
import '../save/service';
import '../waystones/service';
import { canStage } from './canStage';
import { SceneRunner } from './SceneRunner';
import './types';
import type { ScenesService } from './types';

export const SCENES_SYSTEM_ID = 'scenes.tick';

let teardown: (() => void) | null = null;

const scenes: GamePlugin = {
  id: 'scenes',
  dependsOn: ['core'],
  setup(ctx) {
    const warn = (m: string) => console.warn(m);
    const svc = <T>(id: string): T | undefined => (ctx.services as unknown as { get(n: string): T | undefined }).get(id);
    let safe = { position: { ...ctx.player.feet }, yaw: ctx.player.facingYaw };
    let saveHold: (() => void) | null = null;
    let inputHold: (() => void) | null = null;
    const takeSaveAndInput = (): void => {
      saveHold = ctx.services.get('save')?.suspend('scene') ?? null;
      inputHold = ctx.input.contexts.push('cutscene', 'scenes');
    };
    // The input context goes first: the save hold's last release asks `gameplaySafe` at once, which must no longer
    // see `cutscene` on top, or a save deferred during the scene stays pending (fresh review finding 2).
    const dropSaveAndInput = (): void => {
      inputHold?.();
      inputHold = null;
      saveHold?.();
      saveHold = null;
    };
    const runner = new SceneRunner({
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emit: (e, p) => (ctx.events.emit as (e: string, p: unknown) => void)(e, p),
      hold: () => {
        safe = { position: { ...ctx.player.feet }, yaw: ctx.player.facingYaw };
        const mount = svc<{ mounted(): boolean; dismount(r: string): void }>('mount');
        if (mount?.mounted()) mount.dismount('script');
        const modeOff = ctx.services.get('movementMode')?.push('scene', () => safe) ?? (() => undefined);
        takeSaveAndInput();
        return () => {
          modeOff();
          dropSaveAndInput();
        };
      },
      checkpointSave: () => {
        safe = { position: { ...ctx.player.feet }, yaw: ctx.player.facingYaw };
        const save = ctx.services.get('save');
        if (!save) return;
        // The file is built synchronously inside checkpoint(): lift the hold and the cutscene context for that call only.
        dropSaveAndInput();
        try {
          void save.checkpoint('scene');
        } finally {
          takeSaveAndInput();
        }
      },
      canStage: () => canStage(ctx as never),
      shot: (shot) => (ctx.cameraRig ? ctx.cameraRig.override(shot) : null),
      anim: (who, clip) => (ctx.events.emit as (e: string, p: unknown) => void)('scene.anim', { who, clip }),
      move: (who, to, yaw) => {
        const a = ctx.anchors.find(to);
        if (!a) return warn(`scenes: no anchor "${to}" for ${who}`);
        if (who === 'player') void ctx.services.get('waystones')?.safeTeleport({ ...a.position }, yaw ?? a.yaw);
        else if (!svc<{ place(id: string, anchor: string): boolean }>('npcs')?.place(who, to)) warn(`scenes: could not place ${who} at ${to}`);
      },
      spawn: (id) => {
        const enemies = svc<{ spawnGroup(id: string): unknown }>('enemies');
        if (!enemies) return warn(`scenes: no enemies service for spawn "${id}"`);
        enemies.spawnGroup(id);
      },
      warn,
    });
    const service: ScenesService = {
      play: (id) => runner.play(id),
      get active() {
        return runner.active;
      },
      skip: () => runner.skip(),
      register: (def) => runner.register(def),
    };
    const offs: Array<() => void> = [];
    offs.push(ctx.services.provide('scenes', service));
    offs.push(ctx.systems.add({ id: SCENES_SYSTEM_ID, fixedPhase: 'rules', order: 470, fixedUpdate: (dt) => runner.tick(dt) }));
    offs.push(
      ctx.persist.register({
        key: 'scenes',
        version: 1,
        serialize: () => runner.serialize(),
        load: (data) => runner.load(data),
      }),
    );
    offs.push(ctx.events.on('save.loaded', () => void runner.resume()));
    offs.push(
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === PLAYER_ID) runner.cancel(true);
      }),
    );
    teardown = () => {
      runner.dispose();
      for (const o of offs.splice(0).reverse()) o();
    };
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

export default scenes;
