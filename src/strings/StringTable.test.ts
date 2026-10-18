import { describe, expect, it, vi } from 'vitest';
import { StringTable } from './StringTable';

function make(locale?: string) {
  const warn = vi.fn<(message: string) => void>();
  const strings = new StringTable(locale ? { warn, locale } : { warn });
  return { strings, warn };
}

describe('StringTable', () => {
  describe('lookup', () => {
    it('returns the registered text for the current locale', () => {
      const { strings } = make();
      strings.register('en', { 'interact.talk': 'Talk' });
      expect(strings.t('interact.talk')).toBe('Talk');
    });

    it('defaults to the en locale', () => {
      expect(make().strings.locale).toBe('en');
    });

    it('accepts an initial locale in the constructor', () => {
      expect(make('fr').strings.locale).toBe('fr');
    });

    it('uses console.warn when no warn option is given', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        new StringTable().t('no.such.key');
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('params', () => {
    it('fills {name} placeholders from params, strings and numbers alike', () => {
      const { strings } = make();
      strings.register('en', { 'hud.hits': '{name} hit {hits} times' });
      expect(strings.t('hud.hits', { name: 'Ann', hits: 3 })).toBe('Ann hit 3 times');
    });

    it('keeps a placeholder whose param is missing', () => {
      const { strings } = make();
      strings.register('en', { 'a.greet': 'Hi {name}, you have {n}' });
      expect(strings.t('a.greet', { n: 2 })).toBe('Hi {name}, you have 2');
      expect(strings.t('a.greet')).toBe('Hi {name}, you have {n}');
    });

    it('does not treat inherited object properties as params', () => {
      const { strings } = make();
      strings.register('en', { 'a.ctor': 'value {constructor}' });
      expect(strings.t('a.ctor')).toBe('value {constructor}');
    });
  });

  describe('plurals', () => {
    it('chooses one or other for en by count', () => {
      const { strings } = make();
      strings.register('en', {
        'items.count.one': '{count} item',
        'items.count.other': '{count} items',
      });
      expect(strings.t('items.count', { count: 1 })).toBe('1 item');
      expect(strings.t('items.count', { count: 0 })).toBe('0 items');
      expect(strings.t('items.count', { count: 2 })).toBe('2 items');
    });

    it('falls back to .other when the plural category is missing', () => {
      const { strings } = make('ru');
      strings.register('ru', {
        'files.found.one': 'Найден {count} файл',
        'files.found.other': 'Найдено {count} файлов',
      });
      // Russian "few" (2 to 4) has no key, so .other is used.
      expect(strings.t('files.found', { count: 2 })).toBe('Найдено 2 файлов');
      expect(strings.t('files.found', { count: 1 })).toBe('Найден 1 файл');
    });

    it('uses the plain key when count is given but no plural keys exist', () => {
      const { strings } = make();
      strings.register('en', { 'inv.gold': 'Gold: {count}' });
      expect(strings.t('inv.gold', { count: 5 })).toBe('Gold: 5');
    });
  });

  describe('locale fallback', () => {
    it('falls back to en for a key missing in the current locale', () => {
      const { strings, warn } = make();
      strings.register('en', { 'a.b': 'Hello' });
      strings.register('fr', { 'a.c': 'Bonjour' });
      strings.setLocale('fr');
      expect(strings.t('a.b')).toBe('Hello');
      expect(strings.t('a.c')).toBe('Bonjour');
      expect(warn).not.toHaveBeenCalled();
    });

    it('prefers the current locale over en', () => {
      const { strings } = make('fr');
      strings.register('en', { 'a.b': 'Hello' });
      strings.register('fr', { 'a.b': 'Bonjour' });
      expect(strings.t('a.b')).toBe('Bonjour');
    });

    it('falls back to en plural forms when the current locale has none', () => {
      const { strings } = make('fr');
      strings.register('en', {
        'items.count.one': '{count} item',
        'items.count.other': '{count} items',
      });
      expect(strings.t('items.count', { count: 3 })).toBe('3 items');
    });
  });

  describe('missing keys', () => {
    it('returns the [[key]] marker and warns once per key', () => {
      const { strings, warn } = make();
      expect(strings.t('no.such.key')).toBe('[[no.such.key]]');
      expect(strings.t('no.such.key')).toBe('[[no.such.key]]');
      expect(strings.t('no.such.key', { x: 1 })).toBe('[[no.such.key]]');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('no.such.key');
    });

    it('warns separately for each distinct missing key', () => {
      const { strings, warn } = make();
      strings.t('a.one');
      strings.t('a.two');
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('has() reports only keys that exist', () => {
      const { strings } = make();
      strings.register('en', { 'a.b': 'x' });
      expect(strings.has('a.b')).toBe(true);
      expect(strings.has('a.c')).toBe(false);
    });
  });

  describe('register', () => {
    it('throws on a duplicate key and names it', () => {
      const { strings } = make();
      strings.register('en', { 'a.b': 'first' });
      expect(() => strings.register('en', { 'a.b': 'second' })).toThrow(/a\.b/);
      expect(strings.t('a.b')).toBe('first');
    });

    it('override replaces the value, and unregister restores the previous one', () => {
      const { strings } = make();
      strings.register('en', { 'a.b': 'old' });
      const undo = strings.register('en', { 'a.b': 'new' }, { override: true });
      expect(strings.t('a.b')).toBe('new');
      undo();
      expect(strings.t('a.b')).toBe('old');
    });

    it('unregister removes the keys this call added', () => {
      const { strings } = make();
      const undo = strings.register('en', { 'c.d': 'x' });
      expect(strings.has('c.d')).toBe(true);
      undo();
      expect(strings.has('c.d')).toBe(false);
    });

    it('unregister is idempotent and does not remove a later registration', () => {
      const { strings } = make();
      const undo = strings.register('en', { 'a.b': 'one' });
      undo();
      const again = strings.register('en', { 'a.b': 'two' });
      undo();
      expect(strings.t('a.b')).toBe('two');
      again();
      again();
      expect(strings.has('a.b')).toBe(false);
    });

    it('is all or nothing when a key is invalid', () => {
      const { strings } = make();
      expect(() =>
        strings.register('en', { 'ok.one': 'a', 'Bad.key': 'b' }),
      ).toThrow(/Bad\.key/);
      expect(strings.has('ok.one')).toBe(false);
    });

    it('is all or nothing when a value is not a string', () => {
      const { strings } = make();
      expect(() =>
        strings.register('en', { 'ok.one': 'a', 'ok.two': 3 } as unknown as Record<string, string>),
      ).toThrow(/ok\.two/);
      expect(strings.has('ok.one')).toBe(false);
    });

    it('is all or nothing when a later key is a duplicate', () => {
      const { strings } = make();
      strings.register('en', { 'x.y': '1' });
      expect(() => strings.register('en', { 'new.k': '2', 'x.y': '3' })).toThrow(/x\.y/);
      expect(strings.has('new.k')).toBe(false);
      expect(strings.t('x.y')).toBe('1');
    });

    it('throws on invalid key formats', () => {
      const { strings } = make();
      for (const key of ['nodot', 'Upper.case', 'a..b', '1a.b', 'a.', 'a b.c', '.a.b']) {
        expect(() => strings.register('en', { [key]: 'x' }), key).toThrow(/Invalid string key/);
      }
    });

    it('throws when a value is not a string', () => {
      const { strings } = make();
      expect(() =>
        strings.register('en', { 'a.b': 42 } as unknown as Record<string, string>),
      ).toThrow(/must be a string/);
    });
  });

  describe('setLocale', () => {
    it('switches the lookup locale and falls back to en', () => {
      const { strings } = make();
      strings.register('en', { 'a.b': 'Hello' });
      strings.register('de', { 'a.b': 'Hallo' });
      strings.setLocale('de');
      expect(strings.locale).toBe('de');
      expect(strings.t('a.b')).toBe('Hallo');
      strings.setLocale('en');
      expect(strings.locale).toBe('en');
      expect(strings.t('a.b')).toBe('Hello');
    });

    it('rejects an invalid locale tag', () => {
      const { strings } = make();
      expect(() => strings.setLocale('not a locale!')).toThrow();
      expect(strings.locale).toBe('en');
    });
  });
});
