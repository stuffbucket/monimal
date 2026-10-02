import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const rules = readFileSync(
  new URL('../src/renderer/styles/shell-package-rules.css', import.meta.url),
  'utf8',
);

function zIndex(selector: string): number {
  const block = new RegExp(
    `${selector.replaceAll('.', String.raw`\.`)}\\s*\\{([^}]*)\\}`,
  ).exec(rules)?.[1];
  const value = block ? /z-index:\s*(\d+)/.exec(block)?.[1] : undefined;
  if (value === undefined) throw new Error(`No z-index found for ${selector}`);
  return Number(value);
}

describe('overlay stacking', () => {
  it('keeps dialogs above their scrim and popups above dialogs', () => {
    const scrim = zIndex('.sb-shell .dialog__scrim');
    const dialog = zIndex('.sb-shell .dialog');

    expect(dialog).toBeGreaterThan(scrim);
    expect(zIndex('.sb-shell .menu')).toBeGreaterThan(dialog);
    expect(zIndex('.sb-shell .tooltip')).toBeGreaterThan(dialog);
  });
});
