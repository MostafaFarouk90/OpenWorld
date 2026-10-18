import { describe, expect, it } from 'vitest';
import { ChaseTimer, CHASE_RED_SECONDS, type ChaseReading } from './ChaseTimer';
import { ClassLabel, goldText } from './ClassLabel';
import { StubDocument, textOf, type ElementLike } from './dom';
import { MountStamina } from './MountStamina';
import { StealthEye, type StealthEyeReading } from './StealthEye';

const shown = (e: ElementLike) => e.style.display !== 'none';
const find = (e: ElementLike, cls: string): ElementLike => {
  const hit = (x: ElementLike): ElementLike | null => (x.className.split(' ').includes(cls) ? x : (x.children.map(hit).find(Boolean) ?? null));
  return hit(e)!;
};
const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${Object.values(p).join(',')}` : k);
const boom = () => {
  throw new Error('boom');
};

describe('StealthEye', () => {
  const make = (src: { eye?: () => StealthEyeReading | null; noise?: () => number | null }) => new StealthEye(new StubDocument(), { t, ...src });

  it('hidden with no service, null readers and throwing readers', () => {
    for (const w of [make({}), make({ eye: () => null, noise: () => null }), make({ eye: boom, noise: boom })]) {
      expect(() => w.update()).not.toThrow();
      expect(w.visible).toBe(false);
      expect(shown(w.element)).toBe(false);
    }
  });

  it('shows the eye with level and state, boundary levels clamp', () => {
    const r: StealthEyeReading = { level: 0, state: 'calm', observerId: null };
    const w = make({ eye: () => r });
    w.update();
    const lid = find(w.element, 'owg-eye-lid');
    expect(w.visible).toBe(true);
    expect(lid.style.transform).toBe('scaleY(1)');
    r.level = 1;
    r.state = 'alerted';
    w.update();
    expect(lid.style.transform).toBe('scaleY(0)');
    expect(find(w.element, 'owg-eye').className).toContain('owg-eye-alerted');
    r.level = 7;
    w.update();
    expect(lid.style.transform).toBe('scaleY(0)');
    r.level = NaN;
    r.state = 'bogus' as never;
    w.update();
    expect(lid.style.transform).toBe('scaleY(1)');
    expect(find(w.element, 'owg-eye').className).toContain('owg-eye-calm');
  });

  it('writes the DOM only when the value changed', () => {
    const r: StealthEyeReading = { level: 0.5, state: 'suspicious', observerId: 'a' };
    const w = make({ eye: () => r });
    w.update();
    const lid = find(w.element, 'owg-eye-lid');
    lid.style.transform = 'sentinel';
    w.update();
    expect(lid.style.transform).toBe('sentinel');
    r.level = 0.8;
    w.update();
    expect(lid.style.transform).toBe('scaleY(0.2)');
  });

  it('eye hides again when the reading goes null', () => {
    let r: StealthEyeReading | null = { level: 0.3, state: 'calm', observerId: null };
    const w = make({ eye: () => r });
    w.update();
    expect(w.visible).toBe(true);
    r = null;
    w.update();
    expect(w.visible).toBe(false);
  });

  it('noise ring: null hides, 0 shows, scales with metres and caps, junk hides', () => {
    let n: number | null = null;
    const w = make({ noise: () => n });
    const ring = find(w.element, 'owg-noise-ring');
    w.update();
    expect(shown(ring)).toBe(false);
    n = 0;
    w.update();
    expect(shown(ring)).toBe(true);
    expect(ring.style.width).toBe('0px');
    n = 5;
    w.update();
    expect(ring.style.width).toBe('30px');
    n = 1e6;
    w.update();
    expect(ring.style.width).toBe('240px');
    for (const bad of [-1, NaN, Infinity]) {
      n = bad;
      w.update();
      expect(shown(ring)).toBe(false);
    }
    expect(w.visible).toBe(false);
  });
});

describe('ChaseTimer', () => {
  const make = (timer?: () => ChaseReading | null) => new ChaseTimer(new StubDocument(), { t, timer });

  it('hidden when absent, null or throwing', () => {
    for (const w of [make(), make(() => null), make(boom)]) {
      expect(() => w.update()).not.toThrow();
      expect(w.visible).toBe(false);
    }
  });

  it('hidden for malformed readings', () => {
    for (const bad of [{ remaining: NaN, total: 60 }, { remaining: 5, total: 0 }, { remaining: 5, total: NaN }] as ChaseReading[]) {
      const w = make(() => bad);
      w.update();
      expect(w.visible).toBe(false);
    }
  });

  it('red strictly under 15 s, not at 15; remaining 0 still shows', () => {
    const r: ChaseReading = { remaining: CHASE_RED_SECONDS, total: 60, gap: 12.4, phase: 'running' };
    const w = make(() => r);
    w.update();
    expect(w.element.className).toBe('owg-chase');
    expect(textOf(w.element)).toContain('hud.chase.seconds:15');
    expect(textOf(w.element)).toContain('hud.chase.gap:12');
    r.remaining = 14.99;
    w.update();
    expect(w.element.className).toContain('owg-chase-red');
    r.remaining = 0;
    w.update();
    expect(w.visible).toBe(true);
    expect(find(w.element, 'owg-chase-fill').style.width).toBe('0%');
    r.remaining = -3;
    w.update();
    expect(find(w.element, 'owg-chase-fill').style.width).toBe('0%');
    r.remaining = 500;
    w.update();
    expect(find(w.element, 'owg-chase-fill').style.width).toBe('100%');
  });

  it('again phase has its own style and string', () => {
    const r: ChaseReading = { remaining: 5, total: 60, gap: 3, phase: 'again' };
    const w = make(() => r);
    w.update();
    expect(w.element.className).toContain('owg-chase-again');
    expect(w.element.className).not.toContain('red');
    expect(textOf(w.element)).toContain('hud.chase.again');
    r.phase = 'running';
    w.update();
    expect(textOf(w.element)).not.toContain('hud.chase.again');
  });

  it('gap hidden when invalid; hides on null again', () => {
    let r: ChaseReading | null = { remaining: 30, total: 60, gap: NaN, phase: 'running' };
    const w = make(() => r);
    w.update();
    expect(shown(find(w.element, 'owg-chase-gap'))).toBe(false);
    r = null;
    w.update();
    expect(w.visible).toBe(false);
  });
});

describe('MountStamina', () => {
  const make = (stamina?: () => { value: number; max: number } | null) => new MountStamina(new StubDocument(), { t, stamina });

  it('hidden when absent, null or throwing', () => {
    for (const w of [make(), make(() => null), make(boom)]) {
      w.update();
      expect(w.visible).toBe(false);
    }
  });

  it('boundaries: empty, full, over, NaN, zero max', () => {
    const r = { value: 0, max: 100 };
    const w = make(() => r);
    const fill = find(w.element, 'owg-bar-fill');
    w.update();
    expect(w.visible).toBe(true);
    expect(fill.style.width).toBe('0%');
    r.value = 100;
    w.update();
    expect(fill.style.width).toBe('100%');
    r.value = 250;
    w.update();
    expect(fill.style.width).toBe('100%');
    r.value = NaN;
    w.update();
    expect(fill.style.width).toBe('0%');
    r.value = 5;
    r.max = 0;
    w.update();
    expect(fill.style.width).toBe('0%');
  });

  it('dispose removes the element', () => {
    const w = make(() => ({ value: 1, max: 2 }));
    expect(() => w.dispose()).not.toThrow();
  });
});

describe('ClassLabel and gold', () => {
  const make = (src: Partial<ConstructorParameters<typeof ClassLabel>[1]>) => new ClassLabel(new StubDocument(), { t: (k) => (k === 'class.knight' ? 'Knight' : `[[${k}]]`), ...src });

  it('hidden with no service', () => {
    const w = make({});
    w.update();
    expect(w.visible).toBe(false);
  });

  it('label hidden when not chosen, even if current() says knight; gold still shows', () => {
    const w = make({ chosen: () => false, current: () => 'knight', nameKey: () => 'class.knight', gold: () => 12 });
    w.update();
    expect(shown(find(w.element, 'owg-class-name'))).toBe(false);
    expect(textOf(w.element)).toContain('12');
    expect(w.visible).toBe(true);
  });

  it('shows the translated class name; a class swap re-reads', () => {
    let id = 'knight';
    const w = make({ chosen: () => true, current: () => id, nameKey: (c) => `class.${c}` });
    w.update();
    expect(find(w.element, 'owg-class-name').textContent).toBe('Knight');
    id = 'ranger';
    w.update();
    expect(find(w.element, 'owg-class-name').textContent).toBe('ranger'); // unknown string -> id
  });

  it('falls back to the id when the kit or name key is missing or the reader throws', () => {
    expect(find(make({ chosen: () => true, current: () => 'mage', nameKey: () => undefined }).element, 'owg-class-name')).toBeTruthy();
    const a = make({ chosen: () => true, current: () => 'mage', nameKey: () => undefined });
    a.update();
    expect(find(a.element, 'owg-class-name').textContent).toBe('mage');
    const b = make({ chosen: () => true, current: () => 'mage', nameKey: boom });
    b.update();
    expect(find(b.element, 'owg-class-name').textContent).toBe('mage');
    const c = make({ chosen: boom, current: () => 'mage' });
    c.update();
    expect(c.visible).toBe(false);
  });

  it('gold readout: 0, huge, NaN, negative, fractional, throwing', () => {
    expect(goldText(0)).toBe('0');
    expect(goldText(12.9)).toBe('12');
    expect(goldText(-5)).toBe('0');
    expect(goldText(1e12)).toBe('999999999+');
    expect(goldText(NaN)).toBeNull();
    expect(goldText(Infinity)).toBeNull();
    expect(goldText('5')).toBeNull();
    let g: number | undefined = 0;
    const w = make({ gold: () => g });
    w.update();
    expect(find(w.element, 'owg-gold-amount').textContent).toBe('0');
    g = NaN;
    w.update();
    expect(w.visible).toBe(false);
    g = 40;
    w.update();
    expect(find(w.element, 'owg-gold-amount').textContent).toBe('40');
    const x = make({ gold: boom });
    x.update();
    expect(x.visible).toBe(false);
  });
});
