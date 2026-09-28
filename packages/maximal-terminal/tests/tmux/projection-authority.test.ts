import { describe, expect, it } from 'vitest';

import { TmuxProjectionAuthority } from '../../src/tmux/projection-authority.js';

interface TestOwner {
  id: string;
}

const creator: TestOwner = { id: 'creator' };
const recipient: TestOwner = { id: 'recipient' };
const delegate: TestOwner = { id: 'delegate' };
const stranger: TestOwner = { id: 'stranger' };

function authority(): TmuxProjectionAuthority<TestOwner> {
  return new TmuxProjectionAuthority<TestOwner>();
}

describe('TmuxProjectionAuthority', () => {
  it('lets the session owner revoke a pending copy grant', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    expect(ledger.claim(creator, 'work', 'first')).toBe('claimed');
    ledger.grant(creator, 'work', recipient);

    expect(ledger.revoke(creator, 'work', recipient)).toBe(true);
    expect(ledger.claim(recipient, 'work', 'second')).toBe('denied');
  });

  it('requires active control, consumes one-time grants, and lets a viewer delegate', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    expect(ledger.claim(creator, 'work', 'creator')).toBe('claimed');

    expect(ledger.grant(stranger, 'work', recipient)).toBe(false);
    expect(ledger.grant(creator, 'work', recipient)).toBe(true);
    expect(ledger.claim(recipient, 'work', 'recipient')).toBe('claimed');
    expect(ledger.claim(recipient, 'work', 'recipient')).toBe('held');
    expect(ledger.claim(recipient, 'work', 'second')).toBe('denied');
    expect(ledger.grant(recipient, 'work', delegate)).toBe(true);
    expect(ledger.claim(delegate, 'work', 'delegate')).toBe('claimed');
    expect(ledger.grant(stranger, 'work', delegate)).toBe(false);
    expect(ledger.claim(creator, 'work', 'creator')).toBe('held');
    expect(ledger.projections('work')).toEqual([
      ['creator', creator],
      ['recipient', recipient],
      ['delegate', delegate],
    ]);
  });

  it('deduplicates one-time grants and keeps them scoped to one session', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    ledger.reserve(delegate, 'other');
    expect(ledger.grant(creator, 'work', recipient)).toBe(true);
    expect(ledger.grant(creator, 'work', recipient)).toBe(true);
    expect(ledger.list(stranger)).toEqual([]);
    expect(ledger.list(recipient)).toEqual(['work']);

    expect(ledger.claim(recipient, 'other', 'wrong-session')).toBe('denied');
    expect(ledger.revoke(delegate, 'other', recipient)).toBe(false);
    expect(ledger.claim(recipient, 'work', 'first')).toBe('claimed');
    expect(ledger.claim(recipient, 'work', 'second')).toBe('denied');
  });

  it('moves session authority before the destination projection is claimed', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    ledger.claim(creator, 'work', 'left');

    expect(ledger.transfer(stranger, 'work', recipient)).toBe(false);
    expect(ledger.transfer(creator, 'work', recipient)).toBe(true);
    expect(ledger.grant(creator, 'work', delegate)).toBe(true);
    expect(ledger.grant(stranger, 'work', delegate)).toBe(false);
    expect(ledger.claim(recipient, 'work', 'right')).toBe('claimed');
    expect(ledger.controls(recipient, 'work')).toBe(true);
  });

  it('lists grant-only authority and removes it on revoke or owner release', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');

    expect(ledger.list(creator)).toEqual(['work']);
    expect(ledger.revoke(creator, 'work', recipient)).toBe(false);
    expect(ledger.revoke(stranger, 'work', recipient)).toBe(false);
    expect(ledger.grant(creator, 'work', recipient)).toBe(true);
    expect(ledger.revoke(stranger, 'work', recipient)).toBe(false);
    expect(ledger.list(recipient)).toEqual(['work']);
    expect(ledger.revoke(creator, 'work', stranger)).toBe(false);
    expect(ledger.revoke(creator, 'work', recipient)).toBe(true);
    expect(ledger.list(recipient)).toEqual([]);

    expect(ledger.grant(creator, 'work', recipient)).toBe(true);
    ledger.release(recipient);
    expect(ledger.list(recipient)).toEqual([]);
    expect(ledger.claim(recipient, 'work', 'right')).toBe('denied');
  });

  it('keeps other pending grants when one recipient is released', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    expect(ledger.grant(creator, 'work', recipient)).toBe(true);
    expect(ledger.grant(creator, 'work', delegate)).toBe(true);
    ledger.release(recipient);
    ledger.release(recipient);

    expect(ledger.claim(recipient, 'work', 'recipient')).toBe('denied');
    expect(ledger.claim(delegate, 'work', 'delegate')).toBe('claimed');
  });

  it('lists projection owners separately from session owners', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    ledger.grant(creator, 'work', recipient);
    expect(ledger.claim(recipient, 'work', 'right')).toBe('claimed');

    expect(ledger.list(creator)).toEqual(['work']);
    expect(ledger.list(recipient)).toEqual(['work']);
    expect(ledger.list(stranger)).toEqual([]);
    expect(ledger.viewedSessions()).toEqual(['work']);
  });

  it('rejects a second owner reusing a claimed projection identity', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    ledger.claim(creator, 'work', 'left');
    ledger.grant(creator, 'work', recipient);

    expect(ledger.claim(recipient, 'work', 'left')).toBe('denied');
    expect(ledger.owns(creator, 'work', 'left')).toBe(true);
    expect(ledger.owns(recipient, 'work', 'left')).toBe(false);
    expect(ledger.list(recipient)).toEqual(['work']);
  });

  it('forgets an unclaimed projection and drops the empty session', () => {
    const ledger = authority();
    ledger.reserve(creator, 'work');
    ledger.claim(creator, 'work', 'left');
    ledger.claim(creator, 'work', 'right');

    expect(ledger.unclaim('work', 'left')).toBe(creator);
    expect(ledger.unclaim('work', 'left')).toBeUndefined();
    expect(ledger.viewedSessions()).toEqual(['work']);
    expect(ledger.unclaim('work', 'right')).toBe(creator);
    expect(ledger.viewedSessions()).toEqual([]);
    expect(ledger.unclaim('missing', 'left')).toBeUndefined();
  });

  it('does not let a projection in a similarly named session control another session', () => {
    const ledger = authority();
    ledger.reserve(stranger, 'one');
    ledger.reserve(creator, 'one-more');
    ledger.claim(creator, 'one-more', 'right');

    expect(ledger.controls(creator, 'one')).toBe(false);
    expect(ledger.projections('one')).toEqual([]);
    expect(ledger.projections('one-more')).toEqual([['right', creator]]);
  });

  it('clears one session or all authority', () => {
    const ledger = authority();
    ledger.reserve(creator, 'one');
    ledger.reserve(creator, 'two');
    ledger.claim(creator, 'one', 'left');
    ledger.grant(creator, 'one', recipient);
    ledger.grant(creator, 'two', recipient);

    ledger.clearSession('one');
    expect(ledger.list(creator)).toEqual(['two']);
    expect(ledger.list(recipient)).toEqual(['two']);
    expect(ledger.viewedSessions()).toEqual([]);

    ledger.clear();
    expect(ledger.list(creator)).toEqual([]);
    expect(ledger.list(recipient)).toEqual([]);
  });
});
