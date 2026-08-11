import { describe, expect, it } from 'vitest';

import {
  initials,
  NO_INITIALS,
  profileLabel,
  type Account,
} from '../src/renderer/lib/account.js';

/**
 * The account seam.
 *
 * Nothing here knows about an identity provider, which is the whole claim.
 * What is worth testing is the two derivations the shell makes from a name it
 * is handed: the monogram, and the accessible name of the control.
 */

describe('initials', () => {
  it('takes one letter from a single word', () => {
    expect(initials('Ada')).toBe('A');
  });

  it('takes the first and the last word', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });

  it('skips the middle names', () => {
    // Three letters in a 22px circle is a smudge. First and last is what reads
    // as a monogram.
    expect(initials('Ada King Lovelace')).toBe('AL');
  });

  it('uppercases what it finds', () => {
    expect(initials('ada lovelace')).toBe('AL');
  });

  it('ignores the space either side of a name', () => {
    // A consumer's field is whatever their user typed into it.
    expect(initials('  Ada Lovelace  ')).toBe('AL');
  });

  it('falls back when a name yields no letters', () => {
    // The literal, not the constant. Asserting against `NO_INITIALS` passes
    // whatever `NO_INITIALS` happens to be, including nothing at all — and an
    // avatar drawn as an empty circle is the failure this guards.
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
    expect(NO_INITIALS).toBe('?');
  });
});

describe('profileLabel', () => {
  const ada: Account = { id: 'user-1', displayName: 'Ada Lovelace' };

  it('names the account when there is one', () => {
    expect(profileLabel(ada)).toBe('Account: Ada Lovelace');
  });

  it('says so when there is not', () => {
    // The control still shows, because signing in is what it offers. Its name
    // has to say which of the two it is.
    expect(profileLabel(undefined)).toBe('Account: not signed in');
  });
});
