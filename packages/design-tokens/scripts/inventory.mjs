import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '../..');
export const BASELINE_PATH = path.join(PACKAGE_ROOT, 'token-issues-baseline.json');
export const INVENTORY_PATH = path.join(PACKAGE_ROOT, 'dist', 'inventory.json');
const ICON_METRICS_PATH = path.join(PACKAGE_ROOT, 'tokens', 'icon-metrics.json');

const SOURCE_PATTERN = /\.(?:css|html|js|jsx|mjs|mts|ts|tsx)$/;
const ICON_SOURCE_PATTERN = /\.(?:js|jsx|mjs|mts|png|svg|ts|tsx)$/;
const DECLARATION = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;
const REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const LUCIDE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g;
const JSX_NUMERIC_SIZE = /<([A-Z][a-zA-Z0-9_.]*)\b[^>]*\bsize=\{(\d+(?:\.\d+)?)\}/g;
const SVG_VIEW_BOX = /<svg\b[^>]*\bviewBox=["']([^"']+)["']/i;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function trackedFiles(root = WORKSPACE_ROOT, pattern = SOURCE_PATTERN) {
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
    .filter(
      (file) =>
        pattern.test(file)
        && fs.existsSync(path.join(root, file)),
    )
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

export function readIconMetrics(file = ICON_METRICS_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function dimensionPixels(token) {
  const value = token?.$value;
  if (
    value === null
    || typeof value !== 'object'
    || value.unit !== 'px'
    || typeof value.value !== 'number'
  ) {
    throw new Error('Icon metric tokens must own pixel dimensions.');
  }
  return value.value;
}

function cssTokenValue(type, value) {
  if (type === 'dimension') {
    if (
      value === null
      || typeof value !== 'object'
      || value.unit !== 'px'
      || typeof value.value !== 'number'
    ) {
      throw new Error('Owned CSS dimensions must use pixel values.');
    }
    return `${String(value.value)}px`;
  }
  if (type === 'number' && typeof value === 'number') return String(value);
  throw new Error(`Unsupported owned CSS token type: ${String(type)}`);
}

function ownedCssProperties(node, inheritedType, properties = new Map()) {
  if (node === null || typeof node !== 'object') return properties;
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    const names = node.$extensions?.['dev.maximal.design-token']?.cssCustomProperties ?? [];
    for (const name of names) {
      if (properties.has(name)) throw new Error(`Duplicate icon CSS token owner: ${name}`);
      properties.set(name, {
        type,
        tokenValue: node.$value,
        cssValue: cssTokenValue(type, node.$value),
      });
    }
    return properties;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    ownedCssProperties(child, type, properties);
  }
  return properties;
}

function iconMetricContract(iconMetrics) {
  const sizes = iconMetrics.icon?.size;
  const canvases = iconMetrics.icon?.['source-canvas'];
  if (sizes === undefined || canvases === undefined) {
    throw new Error('Icon metrics must define size and source-canvas groups.');
  }

  const cssProperties = ownedCssProperties(iconMetrics);
  const allowedSizes = new Set();
  for (const token of Object.values(sizes)) {
    if (token === null || typeof token !== 'object' || !('$value' in token)) continue;
    const pixels = dimensionPixels(token);
    allowedSizes.add(pixels);
  }

  const allowedCanvases = new Set(
    Object.values(canvases)
      .filter((token) => token !== null && typeof token === 'object' && '$value' in token)
      .map(dimensionPixels),
  );
  return { allowedCanvases, allowedSizes, cssProperties };
}

export function dtcgInventory(tokens, iconMetrics = readIconMetrics()) {
  const { cssProperties } = iconMetricContract(iconMetrics);
  const entries = {};
  for (const [name, declarations] of [...tokens].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const values = [...new Set(declarations.map(({ value }) => value))].sort();
    const owned = cssProperties.get(name);
    entries[tokenKey(name)] = {
      $type: owned?.type ?? 'string',
      $value: owned?.tokenValue ?? values[0],
      $description: `Observed CSS custom property ${name}.`,
      $extensions: {
        'dev.maximal.inventory': {
          cssCustomProperty: name,
          declarations,
          observedValues: values,
          provisionalType: owned === undefined,
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

function lucideNames(source) {
  const names = new Set();
  for (const match of occurrences(source, LUCIDE_IMPORT)) {
    for (const imported of match[1].split(',')) {
      const part = imported.trim().replace(/^type\s+/, '');
      if (part === '') continue;
      const segments = part.split(/\s+as\s+/);
      names.add(segments.at(-1));
    }
  }
  return names;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function iconSourceIssues(file, source, iconMetrics = readIconMetrics()) {
  const { allowedCanvases, allowedSizes } = iconMetricContract(iconMetrics);
  const issues = [];

  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const text = String(source);
    const directNames = lucideNames(text);
    if (directNames.size === 0) return issues;
    const seen = new Set();
    for (const match of occurrences(text, JSX_NUMERIC_SIZE)) {
      const component = match[1];
      if (!directNames.has(component) && component !== 'Icon' && component !== 'Glyph') {
        continue;
      }
      const size = Number(match[2]);
      if (allowedSizes.has(size)) continue;
      const id = `icon-size-outlier:${file}:${component}:${String(size)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      issues.push({
        id,
        kind: 'icon-size-outlier',
        detail: `${file}:${String(lineNumber(text, match.index))} renders ${component} at ${String(size)}px; allowed icon sizes are ${[...allowedSizes].sort((left, right) => left - right).join(', ')}px.`,
      });
    }
    return issues;
  }

  if (!/(?:^|[/_-])(?:icons?|tray)(?:[/_.@-]|$)/i.test(file)) return issues;
  if (file.endsWith('.png')) {
    const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      issues.push({
        id: `icon-source-canvas-missing:${file}`,
        kind: 'icon-source-canvas-missing',
        detail: `${file} does not contain a readable PNG header.`,
      });
      return issues;
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width !== height) {
      issues.push({
        id: `icon-source-canvas-non-square:${file}`,
        kind: 'icon-source-canvas-non-square',
        detail: `${file} uses a ${String(width)}x${String(height)} raster canvas.`,
      });
    } else if (!allowedCanvases.has(width)) {
      issues.push({
        id: `icon-source-canvas-outlier:${file}:${String(width)}`,
        kind: 'icon-source-canvas-outlier',
        detail: `${file} uses a ${String(width)}px raster canvas; allowed canvases are ${[...allowedCanvases].sort((left, right) => left - right).join(', ')}px.`,
      });
    }
    return issues;
  }

  const text = String(source);
  const viewBox = text.match(SVG_VIEW_BOX)?.[1]?.trim().split(/\s+/).map(Number);
  if (viewBox === undefined || viewBox.length !== 4 || viewBox.some(Number.isNaN)) {
    issues.push({
      id: `icon-source-canvas-missing:${file}`,
      kind: 'icon-source-canvas-missing',
      detail: `${file} does not declare a numeric SVG viewBox.`,
    });
    return issues;
  }
  const [, , width, height] = viewBox;
  if (width !== height) {
    issues.push({
      id: `icon-source-canvas-non-square:${file}`,
      kind: 'icon-source-canvas-non-square',
      detail: `${file} uses a ${String(width)}x${String(height)} viewBox.`,
    });
  } else if (!allowedCanvases.has(width)) {
    issues.push({
      id: `icon-source-canvas-outlier:${file}:${String(width)}`,
      kind: 'icon-source-canvas-outlier',
      detail: `${file} uses a ${String(width)}px source canvas; allowed canvases are ${[...allowedCanvases].sort((left, right) => left - right).join(', ')}px.`,
    });
  }

  return issues;
}

export function iconMetricIssues(
  root = WORKSPACE_ROOT,
  iconMetrics = readIconMetrics(),
) {
  return trackedFiles(root, ICON_SOURCE_PATTERN)
    .filter((file) => !/(?:^|\/)(?:\.github|docs|research_log)\//.test(file))
    .flatMap((file) =>
      iconSourceIssues(
        file,
        fs.readFileSync(path.join(root, file)),
        iconMetrics,
      ),
    );
}

export function inventoryIssues(
  { tokens, references },
  iconMetrics = readIconMetrics(),
) {
  const { cssProperties } = iconMetricContract(iconMetrics);
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
    const owned = cssProperties.get(name);
    if (owned === undefined) {
      issues.push({
        id: `provisional-type:${name}`,
        kind: 'provisional-type',
        detail: `${name} is inventoried as a string until its DTCG type is explicitly owned.`,
      });
    } else {
      const mismatches = declarations.filter(({ value }) => value !== owned.cssValue);
      if (mismatches.length > 0) {
        issues.push({
          id: `typed-token-value-mismatch:${name}`,
          kind: 'typed-token-value-mismatch',
          detail: `${name} must equal its owned DTCG value ${owned.cssValue}.`,
        });
      }
    }
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
