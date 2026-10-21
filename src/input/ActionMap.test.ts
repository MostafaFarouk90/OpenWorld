import { describe, expect, it } from 'vitest';
import { ActionMap } from './ActionMap';
import { InputBindings } from './InputBindings';
import { InputContexts } from './InputContexts';

function setup(pointerLocked = () => true) {
  const bindings = new InputBindings(null, () => {});
  const contexts = new InputContexts();
  const map = new ActionMap(bindings, contexts, { pointerLocked });
  return { bindings, contexts, map };
}

describe('ActionMap edges', () => {
  it('reports down, pressed, heldTicks and released', () => {
    const { map } = setup();
    map.keyDown('Space');
    let s = map.sample();
    expect([s.down('jump'), s.pressed('jump'), s.released('jump'), s.heldTicks('jump')]).toEqual([true, true, false, 1]);
    s = map.sample();
    expect([s.down('jump'), s.pressed('jump'), s.heldTicks('jump')]).toEqual([true, false, 2]);
    map.keyUp('Space');
    s = map.sample();
    expect([s.down('jump'), s.released('jump'), s.heldTicks('jump')]).toEqual([false, true, 0]);
    s = map.sample();
    expect(s.released('jump')).toBe(false);
  });

  it('latches a tap between samples as pressed and released with down false', () => {
    const { map } = setup();
    map.keyDown('KeyF');
    map.keyUp('KeyF');
    const s = map.sample();
    expect([s.down('interact'), s.pressed('interact'), s.released('interact')]).toEqual([false, true, true]);
    expect(map.sample().pressed('interact')).toBe(false);
  });

  it('ignores auto-repeat for pressed', () => {
    const { map } = setup();
    map.keyDown('KeyF');
    map.sample();
    map.keyDown('KeyF', true);
    map.keyDown('KeyF'); // duplicate keydown without a keyup
    const s = map.sample();
    expect([s.down('interact'), s.pressed('interact')]).toEqual([true, false]);
  });

  it('a repeat with no initial press holds but never presses', () => {
    const { map } = setup();
    map.keyDown('KeyF', true);
    const s = map.sample();
    expect([s.down('interact'), s.pressed('interact')]).toEqual([true, false]);
  });

  it('blur releases everything on the next sample', () => {
    const { map } = setup();
    map.keyDown('KeyW');
    map.keyDown('ShiftLeft');
    map.sample();
    map.blur();
    const s = map.sample();
    expect(s.down('moveForward')).toBe(false);
    expect(s.released('moveForward')).toBe(true);
    expect(s.released('sprint')).toBe(true);
  });

  it('axis cancels opposite actions', () => {
    const { map } = setup();
    map.keyDown('KeyA');
    expect(map.sample().axis('moveLeft', 'moveRight')).toBe(-1);
    map.keyDown('ArrowRight');
    expect(map.sample().axis('moveLeft', 'moveRight')).toBe(0);
    map.keyUp('KeyA');
    expect(map.sample().axis('moveLeft', 'moveRight')).toBe(1);
  });

  it('snapshots are frozen and independent of later input', () => {
    const { map } = setup();
    map.keyDown('Space');
    const s = map.sample();
    expect(Object.isFrozen(s)).toBe(true);
    map.keyUp('Space');
    expect(s.down('jump')).toBe(true);
  });

  it('a second key bound to the same action keeps it held', () => {
    const { map } = setup();
    map.keyDown('ShiftLeft');
    map.keyDown('ShiftRight');
    map.keyUp('ShiftLeft');
    expect(map.sample().down('sprint')).toBe(true);
  });

  it('follows rebinds', () => {
    const { map, bindings } = setup();
    bindings.rebind('jump', 0, { device: 'key', code: 'KeyU' });
    map.keyDown('Space');
    expect(map.sample().down('jump')).toBe(false);
    map.keyDown('KeyU');
    expect(map.sample().pressed('jump')).toBe(true);
  });

  it('pressSeq orders presses', () => {
    const { map } = setup();
    map.keyDown('Digit2');
    map.keyDown('Digit3');
    const s = map.sample();
    expect(s.pressSeq('attack3')).toBeGreaterThan(s.pressSeq('attack2'));
    expect(s.pressSeq('attack4')).toBe(0);
  });
});

describe('ActionMap mouse', () => {
  it('left mouse attacks only while pointer locked', () => {
    let locked = false;
    const { map } = setup(() => locked);
    map.mouseDown(0);
    map.mouseUp(0);
    expect(map.sample().pressed('attack1')).toBe(false);
    locked = true;
    map.mouseDown(0);
    const s = map.sample();
    expect([s.down('attack1'), s.pressed('attack1')]).toEqual([true, true]);
    map.mouseUp(0);
    expect(map.sample().released('attack1')).toBe(true);
  });

  it('right mouse is block (hold) and button 3 is dodge', () => {
    const { map } = setup();
    map.mouseDown(2);
    map.mouseDown(3);
    const s = map.sample();
    expect(s.down('block')).toBe(true);
    expect(s.pressed('dodge')).toBe(true);
  });

  it('left mouse default applies even when the pointer lock drops while held', () => {
    let locked = true;
    const { map } = setup(() => locked);
    map.mouseDown(0);
    locked = false;
    expect(map.sample().down('attack1')).toBe(true);
    map.mouseUp(0);
    expect(map.sample().down('attack1')).toBe(false);
  });
});

describe('ActionMap contexts', () => {
  it('gameplay actions report nothing outside gameplay', () => {
    const { map, contexts } = setup();
    contexts.push('menu', 'm');
    map.keyDown('Space');
    map.keyDown('KeyW');
    const s = map.sample();
    expect([s.down('jump'), s.pressed('jump'), s.down('moveForward')]).toEqual([false, false, false]);
  });

  it('actions shared with menu keep working in menu; menu action reports everywhere', () => {
    const { map, contexts } = setup();
    contexts.push('cutscene', 'c');
    map.keyDown('Escape');
    map.keyDown('KeyI');
    const s = map.sample();
    expect(s.down('menu')).toBe(true);
    expect(s.pressed('inventory')).toBe(false);
    contexts.push('menu', 'm');
    map.keyDown('KeyJ');
    expect(map.sample().pressed('journal')).toBe(true);
  });

  it('codex (L, v0.4) reports in gameplay and menu, not in dialogue', () => {
    const { map, contexts } = setup();
    map.keyDown('KeyL');
    expect(map.sample().pressed('codex')).toBe(true);
    map.keyUp('KeyL');
    map.sample();
    contexts.push('menu', 'm');
    map.keyDown('KeyL');
    expect(map.sample().pressed('codex')).toBe(true);
    map.keyUp('KeyL');
    map.sample();
    contexts.push('dialogue', 'd');
    map.keyDown('KeyL');
    expect(map.sample().pressed('codex')).toBe(false);
  });

  it('held actions of the old context report released once on push', () => {
    const { map, contexts } = setup();
    map.keyDown('KeyQ');
    map.mouseDown(2);
    expect(map.sample().down('block')).toBe(true);
    contexts.push('menu', 'inv');
    let s = map.sample();
    expect([s.down('block'), s.released('block')]).toEqual([false, true]);
    s = map.sample();
    expect(s.released('block')).toBe(false);
  });

  it('the F that opens a dialogue never gives dialogueNext', () => {
    const { map, contexts } = setup();
    map.keyDown('KeyF');
    expect(map.sample().pressed('interact')).toBe(true);
    contexts.push('dialogue', 'd');
    let s = map.sample();
    expect([s.down('dialogueNext'), s.pressed('dialogueNext')]).toEqual([false, false]);
    map.keyUp('KeyF');
    map.sample();
    map.keyDown('KeyF');
    s = map.sample();
    expect(s.pressed('dialogueNext')).toBe(true);
  });

  it('the Space that closes a dialogue never gives jump', () => {
    const { map, contexts } = setup();
    const pop = contexts.push('dialogue', 'd');
    map.keyDown('Space');
    const s1 = map.sample();
    expect(s1.pressed('dialogueNext')).toBe(true);
    pop();
    const s2 = map.sample();
    expect([s2.down('jump'), s2.pressed('jump')]).toEqual([false, false]);
    map.keyUp('Space');
    map.sample();
    map.keyDown('Space');
    expect(map.sample().pressed('jump')).toBe(true);
  });

  it('ignores any held key after a change, including movement, until release', () => {
    const { map, contexts } = setup();
    map.keyDown('KeyW');
    const pop = contexts.push('menu', 'm');
    pop();
    expect(map.sample().down('moveForward')).toBe(false);
    map.keyUp('KeyW');
    map.keyDown('KeyW');
    expect(map.sample().down('moveForward')).toBe(true);
  });

  it('out-of-order pops still work', () => {
    const { map, contexts } = setup();
    const popMenu = contexts.push('menu', 'a');
    contexts.push('dialogue', 'b');
    popMenu();
    map.keyDown('Digit1');
    expect(map.sample().pressed('dialogueChoice1')).toBe(true);
    expect(map.sample().pressed('attack1')).toBe(false);
  });

  it('a press latched before a context change is dropped', () => {
    const { map, contexts } = setup();
    map.keyDown('Digit2');
    map.keyUp('Digit2');
    contexts.push('dialogue', 'd');
    expect(map.sample().pressed('attack2')).toBe(false);
  });

  it('blur clears the ignored set', () => {
    const { map, contexts } = setup();
    map.keyDown('KeyW');
    contexts.push('menu', 'm');
    map.blur();
    map.keyDown('KeyW');
    contexts.push('cutscene', 'x')(); // pops immediately; W held again is ignored
    expect(map.sample().down('moveForward')).toBe(false);
  });
});

describe('ActionMap filter', () => {
  it('filtered actions report nothing, and lifting it restores held state', () => {
    const { map } = setup();
    map.keyDown('KeyW');
    map.keyDown('Space');
    map.setActionFilter((a) => a !== 'moveForward');
    let s = map.sample();
    expect([s.down('moveForward'), s.pressed('jump')]).toEqual([false, true]);
    map.setActionFilter(null);
    s = map.sample();
    expect(s.down('moveForward')).toBe(true);
  });

  it('a filtered tap is dropped', () => {
    const { map } = setup();
    map.setActionFilter(() => false);
    map.keyDown('Space');
    map.keyUp('Space');
    const s = map.sample();
    expect([s.pressed('jump'), s.released('jump')]).toEqual([false, false]);
  });
});
