// K12's first-run gate on the Greyfen ferry (FERRY_FIRST_RUN_FLAG): the four cases the plugin lambdas reduce to.
import { describe, expect, it } from 'vitest';
import { ferryGate } from './traversal.plugin';

describe('ferryGate', () => {
  it('nothing set: the boat does not run and there is no ticket', () => {
    expect(ferryGate({ token: false, running: false, firstRun: false })).toEqual({ hasToken: false, running: false });
  });
  it('the horn blown before M24 ends: the boat runs and the first ride is free', () => {
    expect(ferryGate({ token: false, running: false, firstRun: true })).toEqual({ hasToken: true, running: true });
  });
  it('M24 complete with the token: the boat runs, the token is the ticket', () => {
    expect(ferryGate({ token: true, running: true, firstRun: true })).toEqual({ hasToken: true, running: true });
  });
  it('M24 complete without the token: the boat runs and the ride is refused, even with the first-run flag still set', () => {
    expect(ferryGate({ token: false, running: true, firstRun: true })).toEqual({ hasToken: false, running: true });
    expect(ferryGate({ token: false, running: true, firstRun: false })).toEqual({ hasToken: false, running: true });
  });
});
