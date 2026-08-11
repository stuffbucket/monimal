import { describe, expect, it } from 'vitest';

import {
  loopbackBaseUrl,
  pinnedKey,
  resolveEndpoints,
} from '../src/main/native/provider-endpoint.js';

/**
 * The pin and the endpoint override.
 *
 * `provider-endpoint.ts` is on the stryker mutate list. Every case below kills
 * a specific mutant rather than adding coverage: the property that matters is
 * that neither environment variable can point the agent at something that is
 * not on this machine, so a mutant that removes a rejection has to fail a test.
 *
 * The backend names are the caller's. These use the two the agent has, because
 * a test over invented names would not fail when the real ones change shape.
 */
const ENDPOINTS = {
  first: 'http://localhost:4141',
  second: 'http://localhost:11434',
} as const;

describe('pinnedKey', () => {
  it('names a backend the caller declared', () => {
    expect(pinnedKey(ENDPOINTS, 'first')).toBe('first');
    expect(pinnedKey(ENDPOINTS, 'second')).toBe('second');
  });

  // The embedded model runs in this process and has no endpoint, so a pin
  // naming it is not a key here and moves nothing.
  it('refuses anything the caller did not declare', () => {
    expect(pinnedKey(ENDPOINTS, '')).toBeUndefined();
    expect(pinnedKey(ENDPOINTS, 'embedded')).toBeUndefined();
    expect(pinnedKey(ENDPOINTS, 'FIRST')).toBeUndefined();
  });
});

describe('loopbackBaseUrl', () => {
  it('accepts an http address on a loopback host', () => {
    expect(loopbackBaseUrl('http://localhost:4141')).toBe('http://localhost:4141');
    expect(loopbackBaseUrl('http://127.0.0.1:53219')).toBe('http://127.0.0.1:53219');
    expect(loopbackBaseUrl('http://[::1]:8080')).toBe('http://[::1]:8080');
  });

  it('accepts https, and keeps nothing past the origin', () => {
    expect(loopbackBaseUrl('https://localhost:9/v1/chat?a=b')).toBe('https://localhost:9');
  });

  // The point of the whole module. Discovery finds a provider on this machine,
  // and an address that could name another one would make that untrue.
  it('refuses a host that is not loopback', () => {
    expect(loopbackBaseUrl('http://example.com')).toBeUndefined();
    expect(loopbackBaseUrl('http://127.0.0.2:4141')).toBeUndefined();
    expect(loopbackBaseUrl('http://localhost.example.com')).toBeUndefined();
  });

  it('refuses a scheme that is not http or https', () => {
    expect(loopbackBaseUrl('ftp://localhost')).toBeUndefined();
    expect(loopbackBaseUrl('file://localhost/etc/passwd')).toBeUndefined();
  });

  it('refuses what is not a URL at all', () => {
    expect(loopbackBaseUrl('')).toBeUndefined();
    expect(loopbackBaseUrl('localhost:4141')).toBeUndefined();
  });
});

describe('resolveEndpoints', () => {
  it('moves the pinned backend and leaves the other alone', () => {
    expect(resolveEndpoints(ENDPOINTS, 'second', 'http://127.0.0.1:53219')).toEqual({
      first: ENDPOINTS.first,
      second: 'http://127.0.0.1:53219',
    });

    expect(resolveEndpoints(ENDPOINTS, 'first', 'http://127.0.0.1:53219')).toEqual({
      first: 'http://127.0.0.1:53219',
      second: ENDPOINTS.second,
    });
  });

  // An address on its own does nothing. Moving discovery is asked for twice.
  it('ignores an address with no pin', () => {
    expect(resolveEndpoints(ENDPOINTS, '', 'http://127.0.0.1:53219')).toEqual(ENDPOINTS);
    expect(resolveEndpoints(ENDPOINTS, 'embedded', 'http://127.0.0.1:53219')).toEqual(
      ENDPOINTS,
    );
  });

  it('ignores an address the loopback rule refuses', () => {
    expect(resolveEndpoints(ENDPOINTS, 'first', 'http://example.com')).toEqual(ENDPOINTS);
    expect(resolveEndpoints(ENDPOINTS, 'first', '')).toEqual(ENDPOINTS);
  });

  it('leaves both endpoints alone when nothing is set', () => {
    expect(resolveEndpoints(ENDPOINTS, '', '')).toEqual(ENDPOINTS);
  });
});
