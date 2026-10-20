#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import {
  PLAY_FUNCTION_THREW_EXCEPTION,
  STORY_ERRORED,
  STORY_FINISHED,
  STORY_THREW_EXCEPTION,
} from 'storybook/internal/core-events';

import {
  axeResult,
  keyboardFocusResult,
} from './storybook-browser-audit.mjs';

export {
  AXE_INCOMPLETE_MESSAGES,
  axeResult,
  classifyAxeIncomplete,
  colorChannels,
  compositeColors,
  contrastRatio,
  contrastThreshold,
  focusIndicatorContrast,
  focusIsUnobscured,
  hasVisibleFocusIndicator,
  keyboardFocusResult,
  rectanglesOverlap,
  relativeLuminance,
} from './storybook-browser-audit.mjs';

const DEFAULT_PORT = 6008;

export const ACCEPTANCE_PROFILES = Object.freeze({
  default: Object.freeze({}),
  'reflow-320': Object.freeze({
    viewport: Object.freeze({ width: 320, height: 900 }),
  }),
  'zoom-200-equivalent': Object.freeze({
    viewport: Object.freeze({ width: 640, height: 450 }),
  }),
  'forced-colors': Object.freeze({
    media: Object.freeze({ forcedColors: 'active' }),
  }),
  'reduced-motion': Object.freeze({
    media: Object.freeze({ reducedMotion: 'reduce' }),
  }),
  'text-spacing': Object.freeze({
    style: `
      * {
        letter-spacing: 0.12em !important;
        line-height: 1.5 !important;
        word-spacing: 0.16em !important;
      }
      p {
        margin-bottom: 2em !important;
      }
    `,
  }),
});

export function parseOptions(argv, config) {
  const options = {
    only: undefined,
    profiles: ['default'],
    scope: 'design-system',
    themes: config.browser.themes,
  };
  for (const argument of argv) {
    if (argument === '--') {
      continue;
    } else if (argument.startsWith('--only=')) {
      options.only = argument.slice('--only='.length);
    } else if (argument.startsWith('--profiles=')) {
      options.profiles = argument
        .slice('--profiles='.length)
        .split(',')
        .filter(Boolean);
    } else if (argument.startsWith('--scope=')) {
      options.scope = argument.slice('--scope='.length);
    } else if (argument.startsWith('--themes=')) {
      options.themes = argument.slice('--themes='.length).split(',').filter(Boolean);
    } else if (!argument.startsWith('-') && options.only === undefined) {
      options.only = argument;
    } else {
      throw new Error(`Unknown Storybook quality option: ${argument}`);
    }
  }
  if (!['all', 'design-system'].includes(options.scope)) {
    throw new Error(`Unknown Storybook quality scope: ${options.scope}`);
  }
  if (options.themes.length === 0) {
    throw new Error('At least one Storybook quality theme is required.');
  }
  if (options.profiles.length === 0) {
    throw new Error('At least one Storybook acceptance profile is required.');
  }
  const unknownProfiles = options.profiles.filter(
    (profile) => ACCEPTANCE_PROFILES[profile] === undefined,
  );
  if (unknownProfiles.length > 0) {
    throw new Error(
      `Unknown Storybook acceptance profile: ${unknownProfiles.join(', ')}`,
    );
  }
  return options;
}

export async function applyAcceptanceProfile(page, profile, defaultViewport) {
  const definition = ACCEPTANCE_PROFILES[profile];
  if (definition === undefined) {
    throw new Error(`Unknown Storybook acceptance profile: ${profile}`);
  }
  await page.setViewportSize(definition.viewport ?? defaultViewport);
  if (definition.media !== undefined) {
    await page.emulateMedia(definition.media);
  }
  if (definition.style !== undefined) {
    await page.addInitScript((style) => {
      const install = () => {
        const element = globalThis.document.createElement('style');
        element.dataset.maximalAcceptanceProfile = 'text-spacing';
        element.textContent = style;
        globalThis.document.head.append(element);
      };
      if (globalThis.document.head) install();
      else globalThis.document.addEventListener('DOMContentLoaded', install, {
        once: true,
      });
    }, definition.style);
  }
}

export function storyUrl(story, theme, baseUrl, config) {
  const url = new URL('/iframe.html', baseUrl);
  url.searchParams.set('id', story.id);
  url.searchParams.set('viewMode', 'story');
  const globals = { ...config.browser.globals, theme };
  url.searchParams.set(
    'globals',
    Object.entries(globals)
      .map(([name, value]) => `${name}:${String(value)}`)
      .join(';'),
  );
  return url.href;
}

function summarizeAxeResult(result) {
  return result.map((entry) => ({
    id: entry.id,
    impact: entry.impact,
    help: entry.help,
    helpUrl: entry.helpUrl,
    targets: entry.nodes.map((node) => node.target.join(' ')),
    details: entry.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      html: node.html,
    })),
  }));
}

export async function waitForServer(server, serverError, baseUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    assertServerRunning(server, serverError, 'before startup');
    try {
      const response = await fetch(`${baseUrl}/index.json`);
      if (response.ok) return response.json();
    } catch {
      // Startup is bounded by the deadline below.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Storybook did not start on ${baseUrl} within 90 seconds.` +
      (serverError.value ? `\n${serverError.value.trim()}` : ''),
  );
}

export function assertServerRunning(server, serverError, phase = 'during checks') {
  if (server.exitCode === null) return;
  throw new Error(
    `Storybook exited with code ${String(server.exitCode)} ${phase}.` +
      (serverError.value ? `\n${serverError.value.trim()}` : ''),
  );
}

export function waitForStoryCompletion({
  channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__,
  events = {
    playFailed: 'playFunctionThrewException',
    storyErrored: 'storyErrored',
    storyFinished: 'storyFinished',
    storyThrew: 'storyThrewException',
  },
  storyId,
  timeoutMs = 20_000,
} = {}) {
  return new Promise((resolve) => {
    if (!channel) {
      resolve({ state: 'error', message: 'no Storybook channel on the page' });
      return;
    }

    let observedFailure;
    const listeners = [];
    let timer;
    const listen = (event, handler) => {
      channel.on(event, handler);
      listeners.push([event, handler]);
    };
    const finish = (result) => {
      if (timer !== undefined) globalThis.clearTimeout(timer);
      for (const [event, handler] of listeners) channel.off(event, handler);
      resolve(result);
    };
    const messageFor = (payload) =>
      payload?.error?.message ?? payload?.message ?? String(payload ?? '');
    const rememberFailure = (state) => (payload) => {
      observedFailure ??= { state, message: messageFor(payload) };
    };

    listen(events.storyThrew, rememberFailure('render failed'));
    listen(events.storyErrored, rememberFailure('render failed'));
    listen(events.playFailed, rememberFailure('play failed'));
    listen(events.storyFinished, (payload) => {
      if (storyId !== undefined && payload?.storyId !== storyId) return;
      if (observedFailure !== undefined) {
        finish(observedFailure);
        return;
      }
      if (payload?.status === 'success') {
        finish({ state: 'ok', message: '' });
        return;
      }
      const failedReport = payload?.reporters?.find(
        (report) => report?.status === 'failed',
      );
      finish({
        state: 'story failed',
        message: messageFor(failedReport?.error ?? failedReport ?? payload),
      });
    });
    timer = setTimeout(
      () => finish({ state: 'timeout', message: 'story did not finish' }),
      timeoutMs,
    );
  });
}

export async function storyRenderResult(page, storyId, timeoutMs = 20_000) {
  try {
    return await page.evaluate(
      waitForStoryCompletion,
      {
        events: {
          playFailed: PLAY_FUNCTION_THREW_EXCEPTION,
          storyErrored: STORY_ERRORED,
          storyFinished: STORY_FINISHED,
          storyThrew: STORY_THREW_EXCEPTION,
        },
        storyId,
        timeoutMs,
      },
    );
  } catch (error) {
    return {
      state: 'observer failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function storyRenderResultWithNavigationRetry(
  page,
  storyId,
  maxNavigationRetries = 1,
) {
  for (let attempt = 0; ; attempt += 1) {
    const result = await storyRenderResult(page, storyId);
    const navigationInterrupted =
      result.state === 'observer failed'
      && /execution context was destroyed/iu.test(result.message);
    if (!navigationInterrupted || attempt >= maxNavigationRetries) return result;
    await page.waitForLoadState('domcontentloaded');
  }
}

export async function checkStory(
  page,
  story,
  theme,
  runtimeErrors,
  { baseUrl, config, profile = 'default' },
) {
  runtimeErrors.console.length = 0;
  runtimeErrors.page.length = 0;
  await applyAcceptanceProfile(page, profile, config.browser.viewport);
  await page.goto(
    storyUrl(story, theme, baseUrl, config),
    { waitUntil: 'domcontentloaded' },
  );
  const render = await storyRenderResultWithNavigationRetry(page, story.id);
  await page.waitForTimeout(50);
  if (render.state !== 'ok') {
    return {
      story: story.id,
      theme,
      profile,
      render,
      axeRan: false,
      violations: [],
      incomplete: [],
      resolvedIncomplete: [],
      consoleErrors: [...runtimeErrors.console],
      pageErrors: [...runtimeErrors.page],
    };
  }

  const tokenStylesLoaded = await page.evaluate(
    (requiredCssCustomProperties) => {
      const style = globalThis.getComputedStyle(document.documentElement);
      return requiredCssCustomProperties.every((property) =>
        style.getPropertyValue(property).trim().length > 0);
    },
    config.browser.requiredCssCustomProperties ?? [],
  );
  const axeDisabledRules = [
    ...(config.accessibility.disabledRules ?? []),
    ...(config.accessibility.profileDisabledAxeRules?.[profile] ?? []),
  ];
  const axe = await axeResult(page, axeDisabledRules);
  const keyboardFocus = await keyboardFocusResult(page);
  return {
    story: story.id,
    theme,
    profile,
    axeDisabledRules,
    render,
    tokenStylesLoaded,
    axeRan: axe.ran,
    violations: summarizeAxeResult(axe.violations),
    incomplete: summarizeAxeResult(axe.incomplete),
    resolvedIncomplete: summarizeAxeResult(axe.resolvedIncomplete),
    keyboardFocus,
    consoleErrors: [...runtimeErrors.console],
    pageErrors: [...runtimeErrors.page],
  };
}

export function failuresFor(result, config) {
  const failures = [];
  if (result.render.state !== 'ok') {
    failures.push(`${result.render.state}: ${result.render.message}`);
  }
  if (result.tokenStylesLoaded === false) {
    failures.push('generated token styles did not load');
  }
  if (!result.axeRan) failures.push('axe did not run');
  if (result.violations.length > config.accessibility.maximumViolations) {
    failures.push(
      `axe violations: ${result.violations
        .map((entry) => `${entry.id} (${entry.impact ?? 'unknown'})`)
        .join(', ')}`,
    );
  }
  if (
    result.incomplete.length > config.accessibility.maximumIncomplete
  ) {
    failures.push(
      `axe requires review: ${result.incomplete
        .map((entry) => `${entry.id} (${entry.impact ?? 'unknown'})`)
        .join(', ')}`,
    );
  }
  if (result.consoleErrors.length > config.runtime.maximumConsoleErrors) {
    failures.push(`console errors: ${result.consoleErrors.join(' | ')}`);
  }
  if (result.pageErrors.length > config.runtime.maximumPageErrors) {
    failures.push(`page errors: ${result.pageErrors.join(' | ')}`);
  }
  if (
    config.runtime.requireVisibleFocusIndicator
    && result.keyboardFocus?.applicable
    && (!result.keyboardFocus.focused || !result.keyboardFocus.visibleIndicator)
  ) {
    failures.push(
      'first keyboard focus target has no supported 3:1 focus indicator',
    );
  }
  if (
    config.runtime.requireUnobscuredKeyboardFocus
    && result.keyboardFocus?.applicable
    && !result.keyboardFocus.unobscured
  ) {
    failures.push('first keyboard focus target is obscured');
  }
  return failures;
}

async function writeReport({
  browserVersion,
  config,
  options,
  reportPath,
  results,
  stories,
}) {
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy: config,
    browserVersion,
    profiles: options.profiles,
    scope: options.scope,
    storyCount: stories.length,
    executionCount: results.length,
    failures: results.filter((result) => failuresFor(result, config).length > 0).length,
    results,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

export function storybookBaseUrl(port) {
  return `http://127.0.0.1:${String(port)}`;
}

export async function runStorybookCheck({
  root = process.cwd(),
  argv = [],
} = {}) {
  const config = JSON.parse(
    await readFile(path.join(root, 'quality.config.json'), 'utf8'),
  );
  const options = parseOptions(argv, config);
  const port = config.browser.port ?? DEFAULT_PORT;
  const baseUrl = storybookBaseUrl(port);
  const cli = path.join(root, 'node_modules/storybook/dist/bin/dispatcher.js');
  const reportPath = path.resolve(
    root,
    config.browser.reportPath ?? 'reports/quality/storybook.json',
  );
  const serverError = { value: '' };
  const server = spawn(
    process.execPath,
    [cli, 'dev', '-p', String(port), '--no-open', '--quiet'],
    { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: process.env },
  );
  server.stderr.on('data', (chunk) => {
    serverError.value = (serverError.value + String(chunk)).slice(-2000);
  });

  let browser;
  try {
    const index = await waitForServer(server, serverError, baseUrl);
    const stories = Object.values(index.entries)
      .filter((entry) => entry.type === 'story')
      .filter(
        (entry) =>
          options.scope === 'all'
          || entry.importPath.startsWith(config.browser.ownedStoryImportPrefix),
      )
      .filter((entry) => options.only === undefined || entry.id.includes(options.only))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (stories.length === 0) {
      throw new Error(
        options.only === undefined
          ? `No stories found for scope "${options.scope}".`
          : `No story matches "${options.only}".`,
      );
    }

    browser = await chromium.launch();
    const results = [];
    for (const profile of options.profiles) {
      for (const theme of options.themes) {
        for (const story of stories) {
          assertServerRunning(server, serverError);
          const page = await browser.newPage({
            viewport: config.browser.viewport,
          });
          const runtimeErrors = { console: [], page: [] };
          page.on('console', (message) => {
            if (message.type() === 'error') {
              runtimeErrors.console.push(message.text());
            }
          });
          page.on('pageerror', (error) => runtimeErrors.page.push(error.message));
          let result;
          try {
            result = await checkStory(
              page,
              story,
              theme,
              runtimeErrors,
              { baseUrl, config, profile },
            );
          } catch (error) {
            result = {
              story: story.id,
              theme,
              profile,
              render: {
                state: 'harness failed',
                message: error instanceof Error ? error.message : String(error),
              },
              axeRan: false,
              violations: [],
              incomplete: [],
              resolvedIncomplete: [],
              consoleErrors: [...runtimeErrors.console],
              pageErrors: [...runtimeErrors.page],
            };
          } finally {
            await page.close();
          }
          results.push(result);
          const failures = failuresFor(result, config);
          if (failures.length === 0) {
            console.log(` ok    ${story.id} [${theme}/${profile}]`);
          } else {
            console.error(
              ` FAIL  ${story.id} [${theme}/${profile}]\n        ${
                failures.join('\n        ')
              }`,
            );
          }
        }
      }
    }

    await writeReport({
      browserVersion: browser.version(),
      config,
      options,
      reportPath,
      results,
      stories,
    });
    const failed = results.filter((result) => failuresFor(result, config).length > 0);
    const unchecked = results.filter((result) => !result.axeRan).length;
    console.log(
      `\n${String(stories.length)} stories, ${String(results.length)} executions, ` +
        `${String(failed.length)} failures, ${String(unchecked)} unchecked against ` +
        `${config.accessibility.standard}.`,
    );
    if (
      failed.length > 0
      || unchecked > config.accessibility.maximumUncheckedStories
    ) {
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    server.kill();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const rootArgument = argv.find((argument) =>
    argument !== '--' && !argument.startsWith('--'));
  const toolArguments = rootArgument === undefined
    ? argv
    : argv.filter((argument) => argument !== rootArgument);
  await runStorybookCheck({
    root: path.resolve(rootArgument ?? process.cwd()),
    argv: toolArguments,
  });
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(` FAIL  ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
