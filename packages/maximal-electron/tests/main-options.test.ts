import { describe, expect, it } from 'vitest';

import {
  RUN_MAIN_OPTIONS_VERSION,
  assertOptionsVersion,
  normalizeDaemonUrl,
  quitsWithLastWindow,
} from '../src/host/main-options.js';

describe('assertOptionsVersion', () => {
  it('accepts the version this shell publishes', () => {
    expect(() => {
      assertOptionsVersion(RUN_MAIN_OPTIONS_VERSION);
    }).not.toThrow();
  });

  it('names both versions when a call site passes another', () => {
    expect(() => {
      assertOptionsVersion(2);
    }).toThrow('runMain options are version 1, and this call passed 2.');
    expect(() => {
      assertOptionsVersion(0);
    }).toThrow('runMain options are version 1, and this call passed 0.');
  });
});

describe('normalizeDaemonUrl', () => {
  it('gives one spelling to an origin with and without a trailing slash', () => {
    expect(normalizeDaemonUrl('http://127.0.0.1:53211')).toBe('http://127.0.0.1:53211');
    expect(normalizeDaemonUrl('http://127.0.0.1:53211/')).toBe('http://127.0.0.1:53211');
  });

  it('keeps a path and strips only the trailing slash', () => {
    expect(normalizeDaemonUrl('https://host.example/base')).toBe(
      'https://host.example/base',
    );
    expect(normalizeDaemonUrl('https://host.example/base/')).toBe(
      'https://host.example/base',
    );
  });

  it('rejects a value that is not an absolute URL', () => {
    expect(() => normalizeDaemonUrl('/control')).toThrow(
      'discoverDaemonUrl must return an absolute URL, and returned "/control".',
    );
    expect(() => normalizeDaemonUrl('')).toThrow(
      'discoverDaemonUrl must return an absolute URL, and returned "".',
    );
  });
});

describe('quitsWithLastWindow', () => {
  it('quits everywhere except macOS', () => {
    expect(quitsWithLastWindow('win32', false)).toBe(true);
    expect(quitsWithLastWindow('linux', false)).toBe(true);
    expect(quitsWithLastWindow('darwin', false)).toBe(false);
  });

  it('never quits while the application asks to keep running', () => {
    expect(quitsWithLastWindow('win32', true)).toBe(false);
    expect(quitsWithLastWindow('darwin', true)).toBe(false);
  });
});
