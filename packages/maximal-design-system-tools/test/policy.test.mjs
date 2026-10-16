import assert from 'node:assert/strict';
import { test } from 'vitest';

import { policyRelaxations } from '../src/policy.mjs';

const baseline = {
  coverageMinimums: { branches: 50, functions: 60, lines: 70, statements: 70 },
  accessibilityMaximums: {
    maximumIncomplete: 0,
    maximumUncheckedStories: 0,
    maximumViolations: 0,
  },
  runtimeMaximums: { maximumConsoleErrors: 0, maximumPageErrors: 0 },
  sourceSwitches: {
    allowReviewedException: false,
    forbidImportantDeclarations: true,
    forbidLiteralColors: true,
  },
  acceptanceProfiles: [
    'forced-colors',
    'reflow-320',
    'reduced-motion',
    'text-spacing',
    'zoom-200-equivalent',
  ],
  themes: ['dark', 'light'],
  ownedStoryImportPrefix: './stories/',
  storyOwnership: ['../stories/**/*.stories.tsx'],
  disabledAxeRules: ['region'],
  profileDisabledAxeRules: {
    'forced-colors': ['color-contrast'],
  },
};

function cloneBaseline() {
  return JSON.parse(JSON.stringify(baseline));
}

test('anti-relaxation policy rejects every guarded relaxation', () => {
  const relaxed = cloneBaseline();
  relaxed.coverageMinimums.lines = 69;
  relaxed.accessibilityMaximums.maximumViolations = 1;
  relaxed.runtimeMaximums.maximumConsoleErrors = 1;
  relaxed.sourceSwitches.forbidLiteralColors = false;
  relaxed.acceptanceProfiles = relaxed.acceptanceProfiles.filter(
    (profile) => profile !== 'forced-colors',
  );
  relaxed.themes = ['dark'];
  relaxed.ownedStoryImportPrefix = './some-stories/';
  relaxed.storyOwnership = [];
  relaxed.disabledAxeRules.push('color-contrast');
  relaxed.profileDisabledAxeRules['forced-colors'].push('aria-valid-attr-value');

  assert.deepEqual(policyRelaxations(relaxed, baseline), [
    'acceptanceProfiles must retain forced-colors',
    'accessibilityMaximums.maximumViolations must be at most 0',
    'coverageMinimums.lines must be at least 70',
    'disabledAxeRules must not add color-contrast',
    'ownedStoryImportPrefix must not change',
    'profileDisabledAxeRules.forced-colors must not add aria-valid-attr-value',
    'runtimeMaximums.maximumConsoleErrors must be at most 0',
    'sourceSwitches.forbidLiteralColors must remain enabled',
    'storyOwnership must retain ../stories/**/*.stories.tsx',
    'themes must retain light',
  ]);
});

test('anti-relaxation policy permits strengthening every guarded category', () => {
  const strengthened = cloneBaseline();
  strengthened.coverageMinimums = {
    branches: 55,
    functions: 65,
    lines: 75,
    statements: 75,
  };
  strengthened.themes.push('high-contrast');
  strengthened.acceptanceProfiles.push('future-profile');
  strengthened.storyOwnership.push('../new-stories/**/*.stories.tsx');
  strengthened.disabledAxeRules = [];
  strengthened.profileDisabledAxeRules['forced-colors'] = [];

  assert.deepEqual(policyRelaxations(strengthened, baseline), []);
});

test('anti-relaxation policy leaves optional and disabled guardrails inactive', () => {
  const optionalBaseline = cloneBaseline();
  delete optionalBaseline.acceptanceProfiles;
  optionalBaseline.sourceSwitches.forbidLiteralColors = false;
  const current = cloneBaseline();
  delete current.acceptanceProfiles;
  current.sourceSwitches.forbidLiteralColors = false;

  assert.deepEqual(policyRelaxations(current, optionalBaseline), []);
});

test('anti-relaxation policy rejects a missing current acceptance profile list', () => {
  const current = cloneBaseline();
  delete current.acceptanceProfiles;

  assert.deepEqual(
    policyRelaxations(current, baseline).filter((finding) =>
      finding.startsWith('acceptanceProfiles ')),
    baseline.acceptanceProfiles
      .map((profile) => `acceptanceProfiles must retain ${profile}`)
      .sort((left, right) => left.localeCompare(right)),
  );
});

test('missing current profiles do not inherit arbitrary baseline values', () => {
  const required = cloneBaseline();
  required.acceptanceProfiles = ['Stryker was here'];
  const current = cloneBaseline();
  delete current.acceptanceProfiles;

  assert.deepEqual(policyRelaxations(current, required), [
    'acceptanceProfiles must retain Stryker was here',
  ]);
});

test('profile Axe exceptions require an explicit reviewed baseline', () => {
  const unreviewed = cloneBaseline();
  delete unreviewed.profileDisabledAxeRules;

  assert.deepEqual(
    policyRelaxations(baseline, unreviewed).filter((finding) =>
      finding.startsWith('profileDisabledAxeRules.')),
    ['profileDisabledAxeRules.forced-colors must not add color-contrast'],
  );
});
