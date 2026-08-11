#!/usr/bin/env node
/**
 * Does a palette meet the shell's design contract?
 *
 * The shell's part is `src/renderer/lib/contrast.ts`: which token is drawn on
 * which surface, which pairs must be legible, and which tokens have to exist at
 * all. That travels with the shell and is checked in CI.
 *
 * Takes the palette as an argument so a fixture can be checked, but the point
 * is the default: `npm run check:contrast` measures `tokens.css` and CI runs
 * it, so the shipped palette stays legible.
 *
 *   node scripts/check-contrast.mjs [tokens.css] [--selectors <list>]
 *
 * `--selectors` is comma separated and read in cascade order, later overriding
 * earlier, which is how a light theme layered on a dark base resolves. The list
 * is not trusted: a block that declares palette tokens and is not on it fails
 * the run, because a third theme nobody measured is the shape of every
 * empty-scope defect here.
 *
 * Three sections, because they need three different fixes: a token that is not
 * defined, a token defined in a form this cannot read, and a pair that reads
 * fine and does not contrast.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUIRED_TOKENS, checkPalette } from '../src/renderer/lib/contrast.ts';
import { scopedChecks } from './check-scope.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A path worth printing: relative inside the repo, absolute outside it. */
const show = (target) => {
  const relative = path.relative(ROOT, target);
  return relative.startsWith('..') ? target : relative;
};

/* ------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : (argv[at + 1] ?? fallback);
};

const positional = argv.filter(
  (item, index) =>
    !item.startsWith('--') && (index === 0 || argv[index - 1] !== '--selectors'),
);

const file = path.resolve(
  ROOT,
  positional[0] ?? 'src/renderer/styles/tokens.css',
);
const selectors = value('--selectors', ":root,:root[data-theme='light']")
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

/* ----------------------------------------------------------------- parse */

let css;
try {
  css = readFileSync(file, 'utf8');
} catch {
  console.error(` FAIL  no such file: ${show(file)}`);
  process.exit(1);
}

/**
 * Every brace block in the stylesheet, with the prelude that opened it.
 *
 * Deliberately simple. A palette is a flat list of declarations, and a CSS
 * parser would be a dependency this does not need. Balanced rather than
 * line-anchored, so a block inside `@media (prefers-color-scheme: dark)`
 * is found too: that is where a third theme would go.
 */
function blocks(text) {
  const found = [];
  const open = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') {
      open.push({ prelude: text.slice(start, index), at: index });
      start = index + 1;
    } else if (text[index] === '}') {
      const block = open.pop();
      if (block) found.push({ prelude: block.prelude, body: text.slice(block.at + 1, index) });
      start = index + 1;
    }
  }
  return found;
}

/** The custom properties declared directly in a block body. */
function declarations(body) {
  const found = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    found[match[1]] = (match[2] ?? '').trim();
  }
  return found;
}

const styleBlocks = blocks(css)
  .map(({ prelude, body }) => ({
    selector: prelude.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim(),
    properties: declarations(body),
  }))
  .filter(({ selector }) => selector !== '' && !selector.startsWith('@'));

const { check, summary } = scopedChecks();

/**
 * A block is a palette layer when it defines a token the shell reads.
 *
 * `[data-status]` sets `--status` at run time and is not one, which is why
 * this asks about `REQUIRED_TOKENS` rather than about any `--` declaration.
 */
const paletteSelectors = styleBlocks
  .filter(({ properties }) => REQUIRED_TOKENS.some((token) => properties[token] !== undefined))
  .map(({ selector }) => selector);

console.log(`${show(file)}\n`);

const unmeasured = paletteSelectors.filter((selector) => !selectors.includes(selector));
check(
  unmeasured.length === 0,
  unmeasured.length === 0
    ? 'every block that declares palette tokens is on the --selectors list'
    : `these blocks declare palette tokens and are not measured: ${unmeasured.join(', ')}`,
  { count: paletteSelectors.length, of: 'palette blocks in the file' },
);

const layers = [];
for (const selector of selectors) {
  const block = styleBlocks.find((entry) => entry.selector === selector);
  if (block === undefined) {
    console.error(` FAIL  no ${selector} block in ${show(file)}`);
    process.exit(1);
  }
  layers.push([selector, block.properties]);
}

/* --------------------------------------------------------------- report */

let palette = {};

for (const [selector, properties] of layers) {
  // Later selectors override earlier ones, as the cascade does at run time.
  palette = { ...palette, ...properties };
  const report = checkPalette(palette);
  const bad = report.checked.filter((result) => !result.passes);

  // The scope is `checked`, not `CONTRAST_PAIRS`. A palette written in
  // `oklch()` parses to nothing, skips every pair, and used to read as clean.
  check(
    bad.length === 0 && report.missing.length === 0 && report.skipped.length === 0,
    `${selector} is legible` +
      ` (${String(report.skipped.length)} skipped, ${String(report.missing.length)} missing)`,
    { count: report.checked.length, of: 'pairs judged' },
  );

  if (report.missing.length > 0) {
    console.log('   missing — the shell reads these and this palette does not define them');
    for (const token of report.missing) console.log(`     ${token}`);
  }

  if (report.skipped.length > 0) {
    console.log('   unreadable — defined, but not as #rgb or #rrggbb, so no verdict');
    for (const pair of report.skipped) {
      console.log(`     ${pair.unreadable.join(', ')}  (${pair.where})`);
    }
  }

  if (bad.length > 0) {
    console.log('   contrast — legible tokens that do not contrast enough');
    for (const result of bad) {
      console.log(
        `     ${result.foreground} on ${result.background}` +
          `  ${result.ratio.toFixed(2)} < ${String(result.minimum)}  — ${result.where}`,
      );
    }
  }
}

process.exit(summary('check:contrast'));
