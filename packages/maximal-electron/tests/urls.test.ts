import { describe, expect, it } from 'vitest';

import { isSafeExternalUrl } from '../src/shared/urls.js';

/**
 * `shell:open-external` is the one channel that hands data straight to the
 * operating system, so its guard gets direct tests.
 */
describe('isSafeExternalUrl', () => {
  it('allows web and mail schemes', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/path?q=1')).toBe(true);
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true);
  });

  it('refuses local file access', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('refuses script and data schemes', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    );
  });

  it('refuses custom protocol handlers', () => {
    // These launch another application, with arguments the caller chose.
    expect(isSafeExternalUrl('ms-msdt:/id')).toBe(false);
    expect(isSafeExternalUrl('vscode://file/etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('smb://host/share')).toBe(false);
  });

  it('refuses anything that is not a URL', () => {
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('example.com')).toBe(false);
    expect(isSafeExternalUrl('   ')).toBe(false);
  });

  it('is not fooled by a scheme in the middle of the string', () => {
    expect(isSafeExternalUrl('file:///x#https://example.com')).toBe(false);
  });
});
