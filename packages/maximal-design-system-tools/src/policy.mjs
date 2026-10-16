#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageApiReport, serializeApiReport } from './api-surface.mjs';

const BASELINE_NAME = 'policy-baseline.json';

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function captureNumbers(source, blockName) {
  const block = source.match(
    new RegExp(`${blockName}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'u'),
  )?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/(\w+)\s*:\s*(\d+(?:\.\d+)?)/gu)]
      .map((match) => [match[1], Number(match[2])])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function disabledAxeRules(source) {
  return sortedUnique([
    ...[...source.matchAll(/\{\s*id:\s*['"]([^'"]+)['"],\s*enabled:\s*false/gu)]
      .map((match) => match[1]),
    ...[...source.matchAll(/(?:['"]([^'"]+)['"]|(\w+))\s*:\s*\{\s*enabled:\s*false/gu)]
      .map((match) => match[1] ?? match[2]),
  ]);
}

export async function policyGuardrails(root = process.cwd()) {
  const quality = JSON.parse(await readFile(path.join(root, 'quality.config.json'), 'utf8'));
  const vitest = await readFile(path.join(root, 'vitest.config.ts'), 'utf8');
  const storybookMain = await readFile(path.join(root, '.storybook', 'main.ts'), 'utf8');
  const preview = await readFile(path.join(root, '.storybook', 'preview.ts'), 'utf8');
  return {
    coverageMinimums: captureNumbers(vitest, 'thresholds'),
    accessibilityMaximums: {
      maximumIncomplete: quality.accessibility.maximumIncomplete,
      maximumUncheckedStories: quality.accessibility.maximumUncheckedStories,
      maximumViolations: quality.accessibility.maximumViolations,
    },
    runtimeMaximums: {
      maximumConsoleErrors: quality.runtime.maximumConsoleErrors,
      maximumPageErrors: quality.runtime.maximumPageErrors,
    },
    sourceSwitches: Object.fromEntries(
      Object.entries(quality.source)
        .filter(([, value]) => typeof value === 'boolean')
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    acceptanceProfiles: sortedUnique(quality.browser.acceptanceProfiles ?? []),
    themes: sortedUnique(quality.browser.themes),
    ownedStoryImportPrefix: quality.browser.ownedStoryImportPrefix,
    storyOwnership: sortedUnique(
      [...storybookMain.matchAll(/['"]([^'"]*\.stories\.[^'"]*)['"]/gu)]
        .map((match) => match[1]),
    ),
    disabledAxeRules: sortedUnique([
      ...(quality.accessibility.disabledRules ?? []),
      ...disabledAxeRules(preview),
    ]),
    profileDisabledAxeRules: Object.fromEntries(
      Object.entries(quality.accessibility.profileDisabledAxeRules ?? {})
        .map(([profile, rules]) => [profile, sortedUnique(rules)])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

export function policyRelaxations(current, baseline) {
  const findings = [];
  for (const [name, minimum] of Object.entries(baseline.coverageMinimums)) {
    if (!(name in current.coverageMinimums) || current.coverageMinimums[name] < minimum) {
      findings.push(`coverageMinimums.${name} must be at least ${String(minimum)}`);
    }
  }
  for (const group of ['accessibilityMaximums', 'runtimeMaximums']) {
    for (const [name, maximum] of Object.entries(baseline[group])) {
      if (!(name in current[group]) || current[group][name] > maximum) {
        findings.push(`${group}.${name} must be at most ${String(maximum)}`);
      }
    }
  }
  for (const [name, required] of Object.entries(baseline.sourceSwitches)) {
    if (required === true && current.sourceSwitches[name] !== true) {
      findings.push(`sourceSwitches.${name} must remain enabled`);
    }
  }
  for (const theme of baseline.themes) {
    if (!current.themes.includes(theme)) findings.push(`themes must retain ${theme}`);
  }
  for (const profile of baseline.acceptanceProfiles ?? []) {
    if (current.acceptanceProfiles?.includes(profile) !== true) {
      findings.push(`acceptanceProfiles must retain ${profile}`);
    }
  }
  if (current.ownedStoryImportPrefix !== baseline.ownedStoryImportPrefix) {
    findings.push('ownedStoryImportPrefix must not change');
  }
  for (const scope of baseline.storyOwnership) {
    if (!current.storyOwnership.includes(scope)) {
      findings.push(`storyOwnership must retain ${scope}`);
    }
  }
  for (const rule of current.disabledAxeRules) {
    if (!baseline.disabledAxeRules.includes(rule)) {
      findings.push(`disabledAxeRules must not add ${rule}`);
    }
  }
  for (const [profile, rules] of Object.entries(
    current.profileDisabledAxeRules ?? {},
  )) {
    const reviewed = baseline.profileDisabledAxeRules?.[profile];
    for (const rule of rules) {
      if (reviewed?.includes(rule) !== true) {
        findings.push(`profileDisabledAxeRules.${profile} must not add ${rule}`);
      }
    }
  }
  return findings.sort((left, right) => left.localeCompare(right));
}

export async function policyReport(root = process.cwd()) {
  return {
    version: 1,
    api: await packageApiReport(root),
    guardrails: await policyGuardrails(root),
  };
}

export async function checkPolicy({
  root = process.cwd(),
  update = false,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const baselinePath = path.join(root, BASELINE_NAME);
  const current = await policyReport(root);
  if (update) {
    await writeFile(baselinePath, serializeApiReport(current));
    stdout(`Updated reviewed API and quality policy baseline for ${root}.`);
    return true;
  }
  const baselineText = await readFile(baselinePath, 'utf8').catch(() => '');
  if (baselineText === '') {
    stderr(`Missing ${BASELINE_NAME}; rerun the policy check with --update.`);
    return false;
  }
  const baseline = JSON.parse(baselineText);
  const relaxations = policyRelaxations(current.guardrails, baseline.guardrails);
  const apiMatches =
    serializeApiReport(current.api) === serializeApiReport(baseline.api);
  if (apiMatches && relaxations.length === 0) {
    stdout(`API and quality policy match the reviewed baseline for ${root}.`);
    return true;
  }
  if (!apiMatches) stderr('Package exports, CSS, or token surface changed.');
  for (const finding of relaxations) stderr(`Policy relaxation: ${finding}`);
  stderr('Review changes, then rerun the policy check with --update.');
  return false;
}

export async function main(argv = process.argv.slice(2)) {
  const positional = argv.filter((argument) =>
    argument !== '--' && !argument.startsWith('--'));
  if (positional.length > 1) {
    throw new Error('Usage: maximal-ds-policy-check [project-root] [--update]');
  }
  return checkPolicy({
    root: path.resolve(positional[0] ?? process.cwd()),
    update: argv.includes('--update'),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!await main()) process.exitCode = 1;
}
