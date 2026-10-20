import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { qualityPolicyFindings } from '../src/source-quality.mjs';

async function fixture({ source = '', style = '' }) {
  const root = await mkdtemp(path.join(tmpdir(), 'maximal-quality-policy-'));
  await mkdir(path.join(root, 'src', 'styles'), { recursive: true });
  await writeFile(
    path.join(root, 'quality.config.json'),
    JSON.stringify({
      source: {
        forbiddenDomLikeProps: ['ariaLabel', 'testId'],
        forbidImportantDeclarations: true,
        forbidLiteralColors: true,
        forbidLiteralSpatialDimensions: true,
        forbidLiteralStackingLevels: true,
        forbidLiteralMotionDurations: true,
      },
    }),
  );
  await writeFile(path.join(root, 'src', 'component.tsx'), source);
  await writeFile(path.join(root, 'src', 'styles', 'component.css'), style);
  return root;
}

async function findingsFor(context, contents) {
  const root = await fixture(contents);
  context.after(() => rm(root, { force: true, recursive: true }));
  return qualityPolicyFindings(root);
}

test('quality policy accepts native attributes and tokenized CSS', async (context) => {
  const findings = await findingsFor(context, {
    source: `
      export const props = {
        "aria-label": "Name",
        "data-testid": "field",
        note: "testId and ariaLabel are documentation text",
      };
      const testId = "a local identifier";
      function ariaLabel() { return testId; }
      // interface Props { testId?: string }
      /* const { ariaLabel } = props; */
    `,
    style: `
      /* .fake { color: red !important; padding: 8px; } */
      .field::before {
        content: "color: #fff; margin: 20px; !important";
        color: var(--maximal-color-text-default);
        background: transparent;
        border-color: currentColor;
        width: min(100%, var(--width-content-standard));
        margin: 0;
        transform: translateX(-50%) rotate(45deg);
        z-index: var(--z-index-menu);
        transition: color var(--duration-fade) var(--easing-standard);
        background-image: url("/red/#fff.png");
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
    `,
  });

  assert.deepEqual(findings, []);
});

test('TypeScript AST rejects property declarations and accesses', async (context) => {
  const findings = await findingsFor(context, {
    source: `
      export interface InterfaceProps { testId?: string }
      export type LiteralProps = { ariaLabel: string };
      export class ClassProps {
        testId = "";
        constructor(public ariaLabel: string) {}
      }
      const { testId: localId, ariaLabel } = input;
      const object = { testId: localId, ariaLabel, ["testId"]: localId };
      object.ariaLabel = input["testId"];
      export const view = <div testId="field" />;
    `,
  });

  assert.deepEqual(
    findings.map(({ message }) => message),
    [
      'invented DOM-like prop: testId',
      'invented DOM-like prop: ariaLabel',
      'invented DOM-like prop: testId',
      'invented DOM-like prop: ariaLabel',
      'invented DOM-like prop: testId',
      'invented DOM-like prop: ariaLabel',
      'invented DOM-like prop: testId',
      'invented DOM-like prop: ariaLabel',
      'invented DOM-like prop: testId',
      'invented DOM-like prop: ariaLabel',
      'invented DOM-like prop: testId',
      'invented DOM-like prop: testId',
    ],
  );
});

test('CSS parser rejects literals in declarations and functions', async (context) => {
  const findings = await findingsFor(context, {
    style: `
      .field {
        color: rebeccapurple ! important;
        border: 2px solid rgb(1 2 3);
        padding: calc(var(--spacer-1) + 0.5rem) 8px;
        transform: translate3d(4px, 0, var(--offset));
        z-index: calc(2);
        transition: color 20ms ease, opacity .2s;
      }
      .not-visually-hidden { width: 1px; }
      @media (width > 1px) {
        .other { background-image: linear-gradient(#fff, blue); }
      }
    `,
  });

  assert.deepEqual(
    findings.map(({ message }) => message),
    [
      'important declaration: !important',
      'literal color: rebeccapurple',
      'literal color: rgb(',
      'literal spatial dimension: border: 2px solid rgb(1 2 3)',
      'literal spatial dimension: padding: calc(var(--spacer-1) + 0.5rem) 8px',
      'literal spatial dimension: transform: translate3d(4px, 0, var(--offset))',
      'literal stacking level: z-index: calc(2)',
      'literal motion duration: transition: color 20ms ease, opacity .2s',
      'literal spatial dimension: width: 1px',
      'literal color: #fff',
      'literal color: blue',
    ],
  );
});

test('CSS checks ignore comments, strings, URLs, selectors, and unrelated identifiers', async (context) => {
  const findings = await findingsFor(context, {
    style: `
      [data-color="red"] {
        --label: "blue #fff rgb(1 2 3) !important";
        content: "padding: 8px; transition: 10ms";
        background-image: url(data:image/svg+xml;name=red#fff);
        animation-name: red;
      }
      /* #fff { margin: 12px; z-index: 4; transition: 1s !important; } */
    `,
  });

  assert.deepEqual(findings, []);
});

test('findings are stable by file, line, offset, and category', async (context) => {
  const findings = await findingsFor(context, {
    source: 'export interface Props { testId?: string; ariaLabel?: string }',
    style: '.field { color: #fff !important; padding: 8px; z-index: 2; transition: color 20ms; }',
  });

  assert.deepEqual(findings, [
    {
      file: 'src/component.tsx',
      line: 1,
      message: 'invented DOM-like prop: testId',
    },
    {
      file: 'src/component.tsx',
      line: 1,
      message: 'invented DOM-like prop: ariaLabel',
    },
    {
      file: 'src/styles/component.css',
      line: 1,
      message: 'important declaration: !important',
    },
    {
      file: 'src/styles/component.css',
      line: 1,
      message: 'literal color: #fff',
    },
    {
      file: 'src/styles/component.css',
      line: 1,
      message: 'literal spatial dimension: padding: 8px',
    },
    {
      file: 'src/styles/component.css',
      line: 1,
      message: 'literal stacking level: z-index: 2',
    },
    {
      file: 'src/styles/component.css',
      line: 1,
      message: 'literal motion duration: transition: color 20ms',
    },
  ]);
});
