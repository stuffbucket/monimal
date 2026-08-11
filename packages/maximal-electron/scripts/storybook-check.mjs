#!/usr/bin/env node
/**
 * Run every story, and report the ones that break.
 *
 * A developer tool, deliberately not in CI, for the same reason Storybook
 * itself is not: a workshop should not gate a pull request.
 *
 * It exists because `play` functions are assertions, and an assertion that
 * only fires when somebody opens the story is the same "test that never runs"
 * problem this repository already has with the model-dependent end-to-end
 * scenarios. This is the local answer: one command, before you push.
 *
 * No new dependencies. Storybook's dev server publishes every story at
 * `/index.json`, `@playwright/test` is already here for the end-to-end suite,
 * and `axe-core` arrives with `@storybook/addon-a11y`.
 *
 * Three things are checked per story, and all three fail the run:
 *
 *   - it renders without throwing
 *   - its `play` function, if it has one, completes without throwing
 *   - axe finds no violations
 *
 * Axe used to be reported and tolerated, because the palette could not reach
 * zero and a tool nobody can get to zero is a tool nobody runs. The palette
 * reaches zero now, so a tolerated count of one hid every regression after it:
 * the next one arrives as "2 violations" and reads the same. Nothing in CI
 * builds Storybook, so a non-zero exit reaches only the developer who asked
 * for it. See `docs/storybook.md`.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AXE = require.resolve('axe-core/axe.min.js');
// `storybook` publishes its CLI as a bin script, not as a resolvable module
// entry, so this is the path the bin symlink points at.
const CLI = path.join(ROOT, 'node_modules/storybook/dist/bin/dispatcher.js');
const PORT = 6008;
const BASE = `http://localhost:${String(PORT)}`;

const only = process.argv[2];

/* ------------------------------------------------------------- the server */

const server = spawn(
  process.execPath,
  [
    CLI,
    'dev',
    '-p',
    String(PORT),
    '--no-open',
    '--quiet',
  ],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], env: process.env },
);

// Keep the last of stderr. A server that dies at startup otherwise shows up
// only as "did not start within 90 seconds", which says nothing.
let serverError = '';
server.stderr.on('data', (chunk) => {
  serverError = (serverError + String(chunk)).slice(-1200);
});

let failed = false;

function stop(code) {
  server.kill();
  process.exit(code);
}

process.on('SIGINT', () => stop(130));

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/index.json`);
      if (response.ok) return response.json();
    } catch {
      // Not up yet. The deadline is the only thing that gives up.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Storybook did not start on ${BASE} within 90 seconds.` +
      (serverError ? `\n${serverError.trim()}` : ''),
  );
}

/* --------------------------------------------------------------- the run */

try {
  const index = await waitForServer();
  const stories = Object.values(index.entries).filter(
    (entry) => entry.type === 'story' && (!only || entry.id.includes(only)),
  );

  if (stories.length === 0) {
    console.error(only ? ` FAIL  no story matches "${only}"` : ' FAIL  no stories');
    stop(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  let violations = 0;
  let unchecked = 0;
  const offenders = [];

  for (const story of stories) {
    await page.goto(`${BASE}/iframe.html?id=${story.id}&viewMode=story`, {
      waitUntil: 'domcontentloaded',
    });

    // The preview's event channel is how Storybook itself reports a story that
    // threw, in render or in its play function.
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
          if (!channel) {
            resolve({ state: 'error', message: 'no Storybook channel on the page' });
            return;
          }
          const done = (state) => (payload) =>
            resolve({
              state,
              message:
                payload?.error?.message ?? payload?.message ?? String(payload ?? ''),
            });
          channel.once('storyRendered', () => resolve({ state: 'ok' }));
          channel.once('storyThrewException', done('threw'));
          channel.once('storyErrored', done('errored'));
          channel.once('playFunctionThrewException', done('play failed'));
          setTimeout(() => resolve({ state: 'timeout' }), 20_000);
        }),
    );

    if (result.state !== 'ok') {
      failed = true;
      console.error(` FAIL  ${story.id}\n        ${result.state}: ${result.message}`);
      continue;
    }

    // `@storybook/addon-a11y` runs axe on every render, and axe refuses to run
    // twice at once. Wait it out rather than racing it.
    await page.addScriptTag({ path: AXE });
    const attempt = await page.evaluate(async () => {
      const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let tries = 0; tries < 12; tries += 1) {
        try {
          const report = await window.axe.run(document, {
            resultTypes: ['violations'],
            // The same exclusions `.storybook/preview.ts` gives the addon: a
            // story is a component, not a page.
            rules: {
              'landmark-one-main': { enabled: false },
              'page-has-heading-one': { enabled: false },
              region: { enabled: false },
            },
          });
          return {
            ran: true,
            found: report.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              count: violation.nodes.length,
            })),
          };
        } catch (error) {
          if (!/already running/i.test(String(error))) throw error;
          await settle(250);
        }
      }
      return { ran: false, found: [] };
    });

    // The floor. Giving up used to return an empty list, so a story that never
    // let axe run read as a clean one.
    if (!attempt.ran) {
      failed = true;
      unchecked += 1;
      console.error(
        ` FAIL  ${story.id}\n        a11y: axe was still running after 12 attempts, so nothing was checked`,
      );
      continue;
    }

    const found = attempt.found;

    if (found.length > 0) {
      failed = true;
      violations += found.reduce((total, entry) => total + entry.count, 0);
      const summary = found
        .map((entry) => `${entry.id} x${String(entry.count)} (${entry.impact})`)
        .join(', ');
      offenders.push(`${story.id}: ${summary}`);
      console.error(` FAIL  ${story.id}\n        a11y: ${summary}`);
    } else {
      console.log(` ok    ${story.id}`);
    }
  }

  await browser.close();

  const rendered = failed ? 'Some failed.' : 'All rendered and played.';
  const a11y =
    violations === 0
      ? 'No accessibility violations.'
      : `${String(violations)} accessibility violation(s): ${offenders.join('; ')}.`;
  // What the run declined to answer, stated as a number. A story axe never saw
  // is not a clean story, and a summary that omits it reads as one.
  const skipped = unchecked === 0 ? '' : ` Axe did not run on ${String(unchecked)}.`;
  console.log(`\n${String(stories.length)} stories. ${rendered} ${a11y}${skipped}`);
} catch (error) {
  console.error(` FAIL  ${error instanceof Error ? error.message : String(error)}`);
  failed = true;
}

stop(failed ? 1 : 0);
