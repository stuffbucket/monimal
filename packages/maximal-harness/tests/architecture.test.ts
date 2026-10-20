import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const rendererRoot = join(packageRoot, 'src', 'renderer');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return ['.ts', '.tsx'].includes(extname(file)) ? [file] : [];
  });
}

describe('renderer architecture', () => {
  it('depends on maximal-design-system without maximal-electron', () => {
    const manifest = readFileSync(join(packageRoot, 'package.json'), 'utf8');
    expect(manifest).toContain('"@maximal/maximal-design-system"');
    expect(manifest).not.toContain('"@maximal/maximal-electron"');
  });

  it('uses only public renderer seams and no host globals', () => {
    const sources = sourceFiles(rendererRoot).map((file) => ({
      file,
      text: readFileSync(file, 'utf8'),
    }));
    expect(sources.length).toBeGreaterThan(0);

    const forbidden = [
      /@maximal\/maximal-core/u,
      /from\s+['"]electron['"]/u,
      /window\.maximal/u,
      /maximal-electron\/src\//u,
      /@maximal\/maximal-electron/u,
    ];
    for (const { file, text } of sources) {
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file} matched ${String(pattern)}`).toBe(false);
      }
    }

    const imports = sources.flatMap(({ text }) =>
      [...text.matchAll(/from\s+['"](@maximal\/maximal-design-system[^'"]*)['"]/gu)].map(
        (match) => match[1],
      ),
    );
    expect(imports.length).toBeGreaterThan(0);
    expect(new Set(imports)).toEqual(new Set(['@maximal/maximal-design-system']));
  });

  it('loads design-system CSS without maximal-electron selectors', () => {
    const ownCss = readFileSync(join(packageRoot, 'src', 'styles.css'), 'utf8');
    expect(ownCss).toContain(
      "@import '@maximal/maximal-design-system/tokens.css';",
    );
    expect(ownCss).toContain(
      "@import '@maximal/maximal-design-system/styles.css';",
    );
    expect(ownCss).not.toMatch(/maximal-electron|sb-shell/u);
    expect(ownCss).not.toContain('--shell-');
    expect(ownCss).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
    expect(ownCss).not.toMatch(/\[data-testid(?:=|\])/u);
    expect(ownCss).not.toMatch(
      /(?<!\.mh-overlay-body )\.maximal-menu-item:has\(/u,
    );
  });

  it('keeps the assistant card above its click-away layer', () => {
    const ownCss = readFileSync(join(packageRoot, 'src', 'styles.css'), 'utf8');
    expect(ownCss).toMatch(
      /\.mh-dialog-viewport\s*\{[^}]*z-index:\s*var\(--z-index-assistant\);[^}]*pointer-events:\s*none;/su,
    );
    expect(ownCss).toMatch(
      /\.mh-card\s*\{[^}]*pointer-events:\s*auto;/su,
    );
    expect(ownCss).toMatch(
      /\.mh-click-away\s*\{[^}]*z-index:\s*calc\(var\(--z-index-assistant\) - var\(--z-index-raised-content\)\);/su,
    );
    expect(ownCss).toMatch(
      /\.maximal-popup-positioner\s*\{[^}]*z-index:\s*calc\(var\(--z-index-assistant\) \+ var\(--z-index-raised-content\)\);/su,
    );
  });

  it('uses ease-in fade and zoom animations in both directions', () => {
    const ownCss = readFileSync(join(packageRoot, 'src', 'styles.css'), 'utf8');
    expect(ownCss).toMatch(
      /@keyframes mh-card-enter\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*scale\(0\.96\);[^}]*\}[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\);/su,
    );
    expect(ownCss).toMatch(
      /@keyframes mh-card-exit\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\);[^}]*\}[^}]*opacity:\s*0;[^}]*transform:\s*scale\(0\.96\);/su,
    );
    expect(ownCss).toMatch(
      /\.mh-card--entering\s*\{[^}]*animation:\s*mh-card-enter 180ms ease-in;/su,
    );
    expect(ownCss).toMatch(
      /\.mh-card--exiting\s*\{[^}]*animation:\s*mh-card-exit 180ms ease-in forwards;/su,
    );
  });
});
