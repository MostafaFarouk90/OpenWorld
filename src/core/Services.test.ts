import { describe, expect, it } from 'vitest';
import { Services } from './Services';

declare module './Services' {
  interface GameServices {
    testSvc: { hello(): string };
    otherSvc: { n: number };
  }
}

describe('Services', () => {
  it('provide then get returns the implementation', () => {
    const s = new Services();
    const impl = { hello: () => 'hi' };
    s.provide('testSvc', impl);
    expect(s.get('testSvc')).toBe(impl);
    expect(s.has('testSvc')).toBe(true);
    expect(s.require('testSvc')).toBe(impl);
  });

  it('get of a missing service is undefined; has is false', () => {
    const s = new Services();
    expect(s.get('testSvc')).toBeUndefined();
    expect(s.has('testSvc')).toBe(false);
    expect(s.has('anything')).toBe(false);
  });

  it('require of a missing service throws naming it', () => {
    const s = new Services();
    expect(() => s.require('testSvc')).toThrow(/testSvc.*required/);
  });

  it('a second provider for the same name throws and keeps the first', () => {
    const s = new Services();
    const first = { hello: () => 'a' };
    s.provide('testSvc', first);
    expect(() => s.provide('testSvc', { hello: () => 'b' })).toThrow(/already provided/);
    expect(s.get('testSvc')).toBe(first);
  });

  it('unprovide removes the service so it can be provided again', () => {
    const s = new Services();
    const off = s.provide('testSvc', { hello: () => 'a' });
    off();
    expect(s.has('testSvc')).toBe(false);
    expect(s.get('testSvc')).toBeUndefined();
    const second = { hello: () => 'b' };
    s.provide('testSvc', second);
    expect(s.get('testSvc')).toBe(second);
  });

  it('a stale unprovide does not remove a newer provider', () => {
    const s = new Services();
    const off = s.provide('testSvc', { hello: () => 'a' });
    off();
    const second = { hello: () => 'b' };
    s.provide('testSvc', second);
    off();
    expect(s.get('testSvc')).toBe(second);
  });

  it('unprovide twice is safe; services are independent', () => {
    const s = new Services();
    const off = s.provide('testSvc', { hello: () => 'a' });
    s.provide('otherSvc', { n: 1 });
    off();
    off();
    expect(s.get('otherSvc')).toEqual({ n: 1 });
  });
});
