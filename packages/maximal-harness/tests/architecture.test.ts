import {
  failedShellVariableChecks,
  shellVariableChecks,
  shellVariableContract,
  shellVariableEntries,
  shellVariablesIn,
} from '@stuffbucket/maximal-electron/verify/shell-variables';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
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
  it('uses only public renderer seams and no host globals', () => {
    const sources = sourceFiles(rendererRoot).map((file) => ({
      file,
      text: readFileSync(file, 'utf8'),
    }));
    expect(sources.length).toBeGreaterThan(0);

    const forbidden = [
      /@stuffbucket\/maximal-core/u,
      /from\s+['"]electron['"]/u,
      /window\.maximal/u,
      /maximal-electron\/src\//u,
      /@stuffbucket\/maximal-electron\/(?:host|electron-)/u,
    ];
    for (const { file, text } of sources) {
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file} matched ${String(pattern)}`).toBe(false);
      }
    }

    const imports = sources.flatMap(({ text }) =>
      [...text.matchAll(/from\s+['"](@stuffbucket\/maximal-electron[^'"]*)['"]/gu)].map(
        (match) => match[1],
      ),
    );
    expect(imports.length).toBeGreaterThan(0);
    expect(new Set(imports)).toEqual(new Set(['@stuffbucket/maximal-electron/renderer']));
  });

  it('uses only shell variables published by maximal-electron', () => {
    const upstreamCss = readFileSync(
      require.resolve('@stuffbucket/maximal-electron/renderer/styles.css'),
      'utf8',
    );
    const stylesheets = [{ name: 'maximal-electron styles.css', css: upstreamCss }];
    const published = shellVariableEntries({ stylesheets, runtimeProperties: [] });
    const checks = shellVariableChecks({
      stylesheets,
      runtimeProperties: [],
      published,
    });
    expect(checks.length).toBeGreaterThan(0);
    expect(failedShellVariableChecks(checks)).toEqual([]);

    const contract = shellVariableContract({ stylesheets, runtimeProperties: [] });
    const known = new Set([
      ...contract.required,
      ...contract.fallback,
      ...contract.structural,
    ]);
    const ownCss = readFileSync(join(packageRoot, 'src', 'styles.css'), 'utf8');
    const own = shellVariablesIn(ownCss);
    const used = [...new Set([...own.required, ...own.fallback])];
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((variable) => !known.has(variable))).toEqual([]);
    for (const variable of [
      '--shell-space-1',
      '--shell-space-2',
      '--shell-space-3',
      '--shell-space-4',
      '--shell-radius',
      '--shell-radius-large',
      '--shell-text-sm',
      '--shell-text-xs',
      '--shell-scrim',
      '--shell-elevation',
    ]) {
      expect(own.fallback, `${variable} must work without a host override`).toContain(
        variable,
      );
    }
    expect(ownCss).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
  });
});
