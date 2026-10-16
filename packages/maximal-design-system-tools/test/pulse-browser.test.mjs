import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from '@playwright/test';
import { expect, onTestFinished, test } from 'vitest';

import {
  comparePulseObservation,
  confirmPulseCandidate,
  discoverPulseCatalogRoots,
  discoverPulseStoryFiles,
  probePulseBindingOnPage,
  pulseCorrectnessCandidates,
} from '../src/pulse-browser.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'maximal-pulse-browser-'));
  onTestFinished(() => rm(root, { force: true, recursive: true }));
  return root;
}

test('rejects long custom component targets without regex backtracking', async () => {
  await expect(probePulseBindingOnPage(
    {},
    {
      event: 'click',
      reactProp: 'onClick',
      target: 'A'.repeat(100_000),
      line: 1,
      handler: 'handleClick',
    },
    {},
    { kind: 'response' },
  )).resolves.toEqual({
    state: 'skipped',
    reason: 'custom component target has no DOM selector',
  });
});

test('discovers a story that directly imports the implementation', async () => {
  const root = await fixture();
  const source = path.join(root, 'src');
  await mkdir(source);
  await writeFile(path.join(root, 'package.json'), '{}');
  await writeFile(path.join(source, 'Component.tsx'), 'export function Component() {}');
  await writeFile(
    path.join(source, 'Component.stories.tsx'),
    "import { Component } from './Component.js';\nexport default { component: Component };",
  );
  await writeFile(
    path.join(source, 'Other.stories.tsx'),
    "import { Other } from './Other.js';",
  );

  await expect(discoverPulseStoryFiles(
    path.join(source, 'Component.tsx'),
  )).resolves.toEqual([
    path.join(source, 'Component.stories.tsx'),
  ]);
});

test('discovers stories through symbol-specific package re-exports', async () => {
  const root = await fixture();
  const controls = path.join(root, 'src', 'controls');
  const stories = path.join(root, 'stories');
  await mkdir(controls, { recursive: true });
  await mkdir(stories);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: '@example/components',
    exports: {
      './controls': './src/index.ts',
    },
  }));
  await writeFile(
    path.join(root, 'src', 'index.ts'),
    "export * from './controls';",
  );
  await writeFile(
    path.join(controls, 'index.ts'),
    "export * from './text-input.js';\nexport * from './combobox.js';",
  );
  await writeFile(
    path.join(controls, 'text-input.tsx'),
    'export function TextInput() { return <input />; }',
  );
  await writeFile(
    path.join(controls, 'combobox.tsx'),
    'export function Combobox() { return <input role="combobox" />; }',
  );
  await writeFile(
    path.join(stories, 'TextInput.stories.tsx'),
    "import { TextInput } from '@example/components/controls';\n"
      + 'export default { component: TextInput };',
  );
  await writeFile(
    path.join(stories, 'Combobox.stories.tsx'),
    "import { Combobox } from '@example/components/controls';\n"
      + 'export default { component: Combobox };',
  );

  await expect(discoverPulseStoryFiles(
    path.join(controls, 'text-input.tsx'),
  )).resolves.toEqual([
    path.join(stories, 'TextInput.stories.tsx'),
  ]);
});

test('follows named aliases in package re-export chains', async () => {
  const root = await fixture();
  const source = path.join(root, 'src');
  await mkdir(source);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'components',
    exports: './src/index.ts',
  }));
  await writeFile(
    path.join(source, 'index.ts'),
    "export { TextInput as SearchInput } from './text-input.js';",
  );
  await writeFile(
    path.join(source, 'text-input.tsx'),
    'export function TextInput() { return <input />; }',
  );
  await writeFile(
    path.join(source, 'other.tsx'),
    'export function Other() { return <div />; }',
  );
  await writeFile(
    path.join(source, 'SearchInput.stories.tsx'),
    "import { SearchInput } from 'components';\n"
      + 'export default { component: SearchInput };',
  );
  await writeFile(
    path.join(source, 'Other.stories.tsx'),
    "import { Other } from 'components';\n"
      + 'export default { component: Other };',
  );

  await expect(discoverPulseStoryFiles(
    path.join(source, 'text-input.tsx'),
  )).resolves.toEqual([
    path.join(source, 'SearchInput.stories.tsx'),
  ]);
});

test('uses package module fallback and default exports', async () => {
  const root = await fixture();
  const source = path.join(root, 'src');
  await mkdir(source);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'components',
    module: './src/Component.tsx',
  }));
  await writeFile(
    path.join(source, 'Component.tsx'),
    'export default function Component() { return <div />; }',
  );
  await writeFile(
    path.join(source, 'Component.stories.tsx'),
    "import Component from 'components';\n"
      + 'export default { component: Component };',
  );
  await writeFile(
    path.join(source, 'WrongPackage.stories.tsx'),
    "import Component from 'components-extra';\n"
      + 'export default { component: Component };',
  );
  await writeFile(
    path.join(source, 'WrongSubpath.stories.tsx'),
    "import Component from 'components/subpath';\n"
      + 'export default { component: Component };',
  );

  await expect(discoverPulseStoryFiles(
    path.join(source, 'Component.tsx'),
  )).resolves.toEqual([
    path.join(source, 'Component.stories.tsx'),
  ]);
});

test('follows imported aliases re-exported from conditional wildcard exports', async () => {
  const root = await fixture();
  const source = path.join(root, 'src');
  const stories = path.join(root, 'stories');
  await mkdir(source);
  await mkdir(stories);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: '@example/components',
    exports: {
      './controls': './src/other.ts',
      './controls/*-entry': {
        types: './types/*.d.ts',
        import: './src/*.ts',
      },
    },
  }));
  await writeFile(
    path.join(source, 'controls.ts'),
    "import { TextInput as Input } from './text-input.js';\n"
      + 'export { Input as SearchInput };',
  );
  await writeFile(
    path.join(source, 'text-input.tsx'),
    'export const TextInput = () => <input />;',
  );
  await writeFile(
    path.join(source, 'other.ts'),
    'export const Other = () => null;',
  );
  await writeFile(
    path.join(source, 'control.ts'),
    "export { TextInput as SearchInput } from './text-input.js';",
  );
  await writeFile(
    path.join(stories, 'SearchInput.stories.tsx'),
    "import { SearchInput } from '@example/components/controls/controls-entry';\n"
      + 'export default { component: SearchInput };',
  );
  await writeFile(
    path.join(stories, 'WrongPrefix.stories.tsx'),
    "import { SearchInput } from '@example/components/widgets/controls-entry';",
  );
  await writeFile(
    path.join(stories, 'WrongSuffix.stories.tsx'),
    "import { SearchInput } from '@example/components/controls/controls-view';",
  );

  await expect(discoverPulseStoryFiles(
    path.join(source, 'text-input.tsx'),
  )).resolves.toEqual([
    path.join(stories, 'SearchInput.stories.tsx'),
  ]);
});

test('ignores type-only story imports and re-exports', async () => {
  const root = await fixture();
  const source = path.join(root, 'src');
  await mkdir(source);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'components',
    exports: './src/index.ts',
  }));
  await writeFile(
    path.join(source, 'index.ts'),
    "export type { Component } from './Component.js';",
  );
  await writeFile(
    path.join(source, 'Component.tsx'),
    'export function Component() { return <div />; }',
  );
  await writeFile(
    path.join(source, 'Component.stories.tsx'),
    "import type { Component } from 'components';",
  );

  await expect(discoverPulseStoryFiles(
    path.join(source, 'Component.tsx'),
  )).resolves.toEqual([]);
});

test('discovers workspace Storybook quality catalogs from only the entry path', async () => {
  const root = await fixture();
  const componentRoot = path.join(root, 'packages', 'component');
  const catalogRoot = path.join(root, 'packages', 'catalog');
  const dispatcher = path.join(
    catalogRoot,
    'node_modules',
    'storybook',
    'dist',
    'bin',
  );
  await mkdir(path.join(componentRoot, 'src'), { recursive: true });
  await mkdir(path.join(catalogRoot, '.storybook'), { recursive: true });
  await mkdir(dispatcher, { recursive: true });
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(path.join(componentRoot, 'package.json'), '{}');
  await writeFile(path.join(catalogRoot, 'quality.config.json'), '{}');
  await writeFile(path.join(dispatcher, 'dispatcher.js'), '');

  await expect(discoverPulseCatalogRoots(
    path.join(componentRoot, 'src', 'Component.tsx'),
  )).resolves.toEqual([catalogRoot]);
});

test('classifies static and observed responses without overclaiming', () => {
  expect(comparePulseObservation('response', true)).toBe('corroborated');
  expect(comparePulseObservation('response', false)).toBe('unobserved');
  expect(comparePulseObservation('none', true)).toBe('divergent');
  expect(comparePulseObservation('none', false)).toBe('corroborated');
  expect(comparePulseObservation('opaque', true)).toBe('observed-opaque');
  expect(comparePulseObservation('opaque', false)).toBe('stable-opaque');
  expect(comparePulseObservation('response', true, ['failed'])).toBe('runtime-error');
  expect(confirmPulseCandidate(['divergent', 'divergent', 'divergent']))
    .toBe('confirmed-divergent');
  expect(confirmPulseCandidate(['runtime-error', 'runtime-error', 'runtime-error']))
    .toBe('confirmed-runtime-error');
  expect(confirmPulseCandidate(['divergent', 'divergent']))
    .toBe('flaky-candidate');
  expect(confirmPulseCandidate(['divergent', 'corroborated', 'divergent']))
    .toBe('flaky-candidate');
  expect(confirmPulseCandidate(['unobserved'])).toBe('unobserved');

  const binding = {
    event: 'click',
    reactProp: 'onClick',
    target: 'button',
    line: 1,
    handler: 'click',
  };
  expect(pulseCorrectnessCandidates({
    state: 'complete',
    probes: [{
      binding,
      prediction: { kind: 'none', possibleTransitions: 0, effects: [] },
      observations: [
        { comparison: 'confirmed-divergent' },
        { comparison: 'unobserved' },
        { comparison: 'confirmed-runtime-error' },
      ],
    }],
  })).toEqual([
    expect.objectContaining({
      binding,
      observation: { comparison: 'confirmed-divergent' },
    }),
    expect.objectContaining({
      binding,
      observation: { comparison: 'confirmed-runtime-error' },
    }),
  ]);
  expect(pulseCorrectnessCandidates({ state: 'unavailable' })).toEqual([]);
});

test('dispatches a Chromium stimulus and observes its DOM response', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <button aria-label="Toggle">Off</button>
    <script>
      document.querySelector('button').addEventListener('click', (event) => {
        event.currentTarget.textContent = 'On';
      });
    </script>
  `);

  const observation = await probePulseBindingOnPage(
    page,
    {
      event: 'click',
      reactProp: 'onClick',
      target: 'button[aria-label="Toggle"]',
      line: 1,
      handler: 'toggle',
    },
    {},
    { kind: 'response' },
  );

  expect(observation).toEqual(expect.objectContaining({
    state: 'observed',
    changed: true,
    comparison: 'corroborated',
    errors: [],
  }));

  await page.setContent(`
    <button data-testid="save">Save</button>
    <script>
      document.querySelector('button').addEventListener('click', (event) => {
        event.currentTarget.dataset.clicked = 'true';
      });
    </script>
  `);
  await expect(probePulseBindingOnPage(
    page,
    {
      event: 'click',
      reactProp: 'onClick',
      target: 'Button[data-testid="save"]',
      line: 2,
      handler: 'save',
    },
    {},
    { kind: 'response' },
  )).resolves.toEqual(expect.objectContaining({
    state: 'observed',
    changed: true,
    comparison: 'corroborated',
  }));
});

test('supplies in-memory files to change, paste, and drop probes', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <input class="hidden" type="file" data-testid="file">
    <textarea data-testid="paste"></textarea>
    <div data-testid="drop"></div>
    <script>
      document.querySelector('[data-testid="file"]').addEventListener('change', (event) => {
        event.currentTarget.dataset.files = String(event.currentTarget.files.length);
      });
      document.querySelector('[data-testid="paste"]').addEventListener('paste', (event) => {
        event.currentTarget.dataset.files = String(event.clipboardData.files.length);
      });
      document.querySelector('[data-testid="drop"]').addEventListener('drop', (event) => {
        event.currentTarget.dataset.files = String(event.dataTransfer.files.length);
      });
    </script>
  `);
  const probes = [
    {
      event: 'change',
      reactProp: 'onChange',
      target: 'input.hidden[type="file"][data-testid="file"]',
    },
    {
      event: 'paste',
      reactProp: 'onPaste',
      target: 'textarea[data-testid="paste"]',
    },
    {
      event: 'drop',
      reactProp: 'onDrop',
      target: 'div[data-testid="drop"]',
    },
  ];

  for (const [index, probe] of probes.entries()) {
    const observation = await probePulseBindingOnPage(
      page,
      {
        ...probe,
        line: index + 1,
        handler: probe.event,
      },
      {},
      { kind: 'response' },
    );
    expect(observation).toEqual(expect.objectContaining({
      state: 'observed',
      changed: true,
      comparison: 'corroborated',
      errors: [],
    }));
  }
});

test('classifies a browser handler exception as runtime correctness evidence', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <button data-testid="fail">Fail</button>
    <script>
      document.querySelector('button').addEventListener('click', () => {
        throw new Error('component probe failure');
      });
    </script>
  `);

  const observation = await probePulseBindingOnPage(
    page,
    {
      event: 'click',
      reactProp: 'onClick',
      target: 'button[data-testid="fail"]',
      line: 1,
      handler: 'fail',
    },
    {},
    { kind: 'response' },
  );

  expect(observation).toEqual(expect.objectContaining({
    state: 'observed',
    comparison: 'runtime-error',
    errors: [expect.stringContaining('component probe failure')],
  }));
});
