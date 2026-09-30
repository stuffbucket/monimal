import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '../..');
export const BASELINE_PATH = path.join(PACKAGE_ROOT, 'token-issues-baseline.json');
export const INVENTORY_PATH = path.join(PACKAGE_ROOT, 'dist', 'inventory.json');

const SOURCE_PATTERN = /\.(?:css|html|js|jsx|mjs|mts|ts|tsx)$/;
const DECLARATION = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;
const REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)/g;

function trackedFiles(root = WORKSPACE_ROOT) {
  return execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'apps',
      'packages',
    ],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter((file) => SOURCE_PATTERN.test(file))
    .sort();
}

function occurrences(source, pattern) {
  pattern.lastIndex = 0;
  return [...source.matchAll(pattern)];
}

export function scanTokenSources(root = WORKSPACE_ROOT) {
  const tokens = new Map();
  const references = new Map();

  for (const file of trackedFiles(root)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of occurrences(source, DECLARATION)) {
      const name = match[1];
      const value = match[2]?.trim();
      if (name === undefined || value === undefined || value === '') continue;
      const declarations = tokens.get(name) ?? [];
      declarations.push({ file, value });
      tokens.set(name, declarations);
    }
    for (const match of occurrences(source, REFERENCE)) {
      const name = match[1];
      if (name === undefined) continue;
      const files = references.get(name) ?? new Set();
      files.add(file);
      references.set(name, files);
    }
  }

  return { tokens, references };
}

function tokenKey(name) {
  return name.slice(2);
}

export function dtcgInventory(tokens) {
  const entries = {};
  for (const [name, declarations] of [...tokens].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const values = [...new Set(declarations.map(({ value }) => value))].sort();
    entries[tokenKey(name)] = {
      $type: 'string',
      $value: values[0],
      $description: `Observed CSS custom property ${name}.`,
      $extensions: {
        'dev.maximal.inventory': {
          cssCustomProperty: name,
          declarations,
          observedValues: values,
          provisionalType: true,
        },
      },
    };
  }
  return {
    inventory: {
      $description: 'Observed workspace CSS custom properties pending typed migration.',
      ...entries,
    },
  };
}

export function inventoryIssues({ tokens, references }) {
  const issues = [
    {
      id: 'tool-gap:style-dictionary-dtcg-2025.10',
      kind: 'tool-gap',
      detail: 'Pinned Style Dictionary does not yet claim complete DTCG 2025.10 support.',
    },
  ];

  for (const [name, declarations] of [...tokens].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    issues.push({
      id: `provisional-type:${name}`,
      kind: 'provisional-type',
      detail: `${name} is inventoried as a string until its DTCG type is explicitly owned.`,
    });
    const values = [...new Set(declarations.map(({ value }) => value))];
    if (values.length > 1) {
      issues.push({
        id: `multiple-values:${name}`,
        kind: 'multiple-values',
        detail: `${name} has ${String(values.length)} observed source values.`,
      });
    }
  }

  for (const [name, files] of [...references].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (tokens.has(name)) continue;
    issues.push({
      id: `unresolved-reference:${name}`,
      kind: 'unresolved-reference',
      detail: `${name} is referenced but not declared in tracked workspace sources (${String(files.size)} file(s)).`,
    });
  }

  return issues;
}

export function readBaseline(file = BASELINE_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function issueId(issue) {
  return typeof issue === 'string' ? issue : issue.id;
}

export function ratchetChanges(current, recorded) {
  const currentIds = new Set(current.map(issueId));
  const recordedIds = new Set(recorded.map(issueId));
  return {
    added: current.filter((issue) => !recordedIds.has(issueId(issue))),
    gone: recorded.filter((issue) => !currentIds.has(issueId(issue))),
  };
}
