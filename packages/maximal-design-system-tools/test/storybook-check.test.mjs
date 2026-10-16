import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { chromium } from '@playwright/test';
import { onTestFinished, test } from 'vitest';

import {
  ACCEPTANCE_PROFILES,
  AXE_INCOMPLETE_MESSAGES,
  applyAcceptanceProfile,
  axeResult,
  classifyAxeIncomplete,
  colorChannels,
  compositeColors,
  contrastRatio,
  contrastThreshold,
  failuresFor,
  focusIsUnobscured,
  focusIndicatorContrast,
  hasVisibleFocusIndicator,
  keyboardFocusResult,
  parseOptions,
  rectanglesOverlap,
  relativeLuminance,
  storyRenderResult,
  storyRenderResultWithNavigationRetry,
  waitForStoryCompletion,
} from '../src/storybook-check.mjs';

class Channel extends EventEmitter {
  off(event, listener) {
    return this.removeListener(event, listener);
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

const OPTION_CONFIG = {
  browser: {
    themes: ['dark', 'light'],
  },
};

test('acceptance profiles parse with a backward-compatible default', () => {
  assert.deepEqual(parseOptions([], OPTION_CONFIG).profiles, ['default']);
  assert.deepEqual(
    parseOptions(
      ['--profiles=reflow-320,forced-colors'],
      OPTION_CONFIG,
    ).profiles,
    ['reflow-320', 'forced-colors'],
  );
  assert.throws(
    () => parseOptions(['--profiles='], OPTION_CONFIG),
    /At least one Storybook acceptance profile is required/u,
  );
  assert.throws(
    () => parseOptions(['--profiles=unknown'], OPTION_CONFIG),
    /Unknown Storybook acceptance profile: unknown/u,
  );
});

test('acceptance profiles apply explicit viewport, media, and style contracts', async () => {
  for (const profile of Object.keys(ACCEPTANCE_PROFILES)) {
    const calls = [];
    const page = {
      addInitScript: async (...arguments_) => calls.push(['style', ...arguments_]),
      emulateMedia: async (media) => calls.push(['media', media]),
      setViewportSize: async (viewport) => calls.push(['viewport', viewport]),
    };
    await applyAcceptanceProfile(page, profile, { width: 1280, height: 900 });
    const definition = ACCEPTANCE_PROFILES[profile];
    assert.deepEqual(calls[0], [
      'viewport',
      definition.viewport ?? { width: 1280, height: 900 },
    ]);
    assert.equal(
      calls.some(([operation]) => operation === 'media'),
      definition.media !== undefined,
    );
    assert.equal(
      calls.some(([operation]) => operation === 'style'),
      definition.style !== undefined,
    );
  }
});

test('storyRendered cannot complete a story before delayed play failure', async () => {
  const channel = new Channel();
  const completion = waitForStoryCompletion({
    channel,
    storyId: 'button--interaction',
    timeoutMs: 100,
  });
  let settled = false;
  completion.then(() => {
    settled = true;
  });

  channel.emit('storyRendered', 'button--interaction');
  await delay(5);
  assert.equal(settled, false);
  channel.emit('playFunctionThrewException', { message: 'late assertion' });
  await delay(5);
  assert.equal(settled, false);
  channel.emit('storyFinished', {
    storyId: 'button--interaction',
    status: 'error',
    reporters: [],
  });

  assert.deepEqual(await completion, {
    state: 'play failed',
    message: 'late assertion',
  });
  assert.equal(channel.eventNames().length, 0);
});

test('story completion waits for the matching official success event', async () => {
  const channel = new Channel();
  const completion = waitForStoryCompletion({
    channel,
    storyId: 'button--default',
    timeoutMs: 100,
  });

  channel.emit('storyRendered', 'button--default');
  channel.emit('storyFinished', {
    storyId: 'other--story',
    status: 'success',
    reporters: [],
  });
  await delay(5);
  channel.emit('storyFinished', {
    storyId: 'button--default',
    status: 'success',
    reporters: [],
  });

  assert.deepEqual(await completion, { state: 'ok', message: '' });
});

test('story completion distinguishes render failure and timeout', async () => {
  const renderChannel = new Channel();
  const render = waitForStoryCompletion({
    channel: renderChannel,
    storyId: 'broken--story',
    timeoutMs: 100,
  });
  renderChannel.emit('storyErrored', { error: { message: 'render exploded' } });
  renderChannel.emit('storyFinished', {
    storyId: 'broken--story',
    status: 'error',
    reporters: [],
  });
  assert.deepEqual(await render, {
    state: 'render failed',
    message: 'render exploded',
  });

  assert.deepEqual(
    await waitForStoryCompletion({ channel: new Channel(), timeoutMs: 5 }),
    { state: 'timeout', message: 'story did not finish' },
  );
});

test('story completion reports observer destruction without aborting the run', async () => {
  assert.deepEqual(
    await storyRenderResult(
      {
        evaluate: async () => {
          throw new Error('execution context was destroyed');
        },
      },
      'navigating--story',
    ),
    {
      state: 'observer failed',
      message: 'execution context was destroyed',
    },
  );
});

test('story checks retry one navigation-interrupted observer', async () => {
  let evaluations = 0;
  let loadWaits = 0;
  const result = await storyRenderResultWithNavigationRetry(
    {
      evaluate: async () => {
        evaluations += 1;
        if (evaluations === 1) throw new Error('execution context was destroyed');
        return { state: 'ok', message: '' };
      },
      waitForLoadState: async () => {
        loadWaits += 1;
      },
    },
    'navigating--story',
  );

  assert.deepEqual(result, { state: 'ok', message: '' });
  assert.equal(evaluations, 2);
  assert.equal(loadWaits, 1);
});

test('failuresFor applies strict greater-than thresholds', () => {
  const config = {
    accessibility: { maximumIncomplete: 1, maximumViolations: 1 },
    runtime: {
      maximumConsoleErrors: 1,
      maximumPageErrors: 1,
      requireUnobscuredKeyboardFocus: true,
      requireVisibleFocusIndicator: true,
    },
  };
  const result = {
    render: { state: 'ok', message: '' },
    tokenStylesLoaded: true,
    axeRan: true,
    violations: [{ id: 'one' }],
    incomplete: [{ id: 'one' }],
    consoleErrors: ['one'],
    pageErrors: ['one'],
    keyboardFocus: {
      applicable: true,
      focused: true,
      visibleIndicator: true,
      unobscured: true,
    },
  };
  assert.deepEqual(failuresFor(result, config), []);

  result.violations.push({ id: 'two' });
  result.incomplete.push({ id: 'two' });
  result.consoleErrors.push('two');
  result.pageErrors.push('two');
  result.keyboardFocus.visibleIndicator = false;
  result.keyboardFocus.unobscured = false;
  assert.deepEqual(failuresFor(result, config), [
    'axe violations: one (unknown), two (unknown)',
    'axe requires review: one (unknown), two (unknown)',
    'console errors: one | two',
    'page errors: one | two',
    'first keyboard focus target has no supported 3:1 focus indicator',
    'first keyboard focus target is obscured',
  ]);
});

test('Axe incomplete resolution is exact and proof-based', () => {
  const ariaEvidence = {
    id: 'aria-valid-attr-value',
    failureSummary:
      'Fix all of the following:\n  Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="popup"',
    targetCount: 1,
    allAriaControlsExist: true,
  };
  assert.equal(classifyAxeIncomplete(ariaEvidence), true);
  assert.equal(
    classifyAxeIncomplete({ ...ariaEvidence, allAriaControlsExist: false }),
    false,
  );
  assert.equal(
    classifyAxeIncomplete({
      ...ariaEvidence,
      failureSummary: `${ariaEvidence.failureSummary}\nextra`,
    }),
    false,
  );
  assert.equal(
    classifyAxeIncomplete({
      id: 'color-contrast',
      failureSummary: AXE_INCOMPLETE_MESSAGES.overlap,
      targetCount: 1,
      allTargetsHaveSufficientContrast: true,
      hasOverlappingSibling: false,
    }),
    true,
  );
  assert.equal(
    classifyAxeIncomplete({
      id: 'color-contrast',
      failureSummary: AXE_INCOMPLETE_MESSAGES.partialOverlap,
      targetCount: 1,
      allTargetsHaveSufficientContrast: true,
      hasOverlappingSibling: false,
    }),
    true,
  );
  assert.equal(
    classifyAxeIncomplete({
      id: 'color-contrast',
      failureSummary: AXE_INCOMPLETE_MESSAGES.partialObscuration,
      targetCount: 1,
      allTargetsHaveSufficientContrast: true,
      allTargetsClipped: true,
    }),
    true,
  );
  assert.equal(
    classifyAxeIncomplete({
      id: 'color-contrast',
      failureSummary: AXE_INCOMPLETE_MESSAGES.partialObscuration,
      targetCount: 1,
      allTargetsHaveSufficientContrast: true,
      allTargetsClipped: false,
    }),
    false,
  );
  assert.equal(
    classifyAxeIncomplete({
      id: 'color-contrast',
      failureSummary:
        "Fix any of the following:\n  Element's background color could not be determined due to a background gradient",
      targetCount: 1,
      allTargetsHaveSufficientContrast: true,
      hasOverlappingSibling: false,
    }),
    false,
  );
});

test('contrast calculations cover alpha composition and WCAG boundaries', () => {
  assert.deepEqual(colorChannels('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]);
  assert.deepEqual(compositeColors([255, 255, 255, 0.5], [0, 0, 0, 1]), [
    127.5,
    127.5,
    127.5,
    1,
  ]);
  assert.equal(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1]), 21);
  assert.ok(relativeLuminance([10, 10, 10, 1]) < 0.01);
  assert.ok(
    Math.abs(
      relativeLuminance([10.31475, 10.31475, 10.31475, 1])
      - 0.04045 / 12.92,
    ) < 1e-15,
  );
  assert.ok(
    Math.abs(
      contrastRatio([10, 10, 10, 1], [255, 255, 255, 1])
      - 19.79814571052481,
    ) < Number.EPSILON,
  );
  assert.equal(contrastThreshold(18.65, 700), 4.5);
  assert.equal(contrastThreshold(18.66, 700), 3);
  assert.equal(contrastThreshold(18.66, 400), 4.5);
  assert.equal(contrastThreshold(24, 400), 3);
});

test('focus indicator contrast proves supported indicators at the 3:1 boundary', () => {
  const style = {
    adjacentBackgroundColor: 'rgb(255, 255, 255)',
    boxShadow: 'none',
    outlineStyle: 'solid',
    outlineWidth: '2px',
  };
  const passing = [{ ...style, outlineColor: 'rgb(148, 148, 148)' }];
  const failing = [{ ...style, outlineColor: 'rgb(149, 149, 149)' }];
  const translucent = [{
    ...style,
    outlineColor: 'rgba(5, 0, 73, 0.8)',
  }];
  assert.ok(focusIndicatorContrast(passing) >= 3);
  assert.ok(focusIndicatorContrast(failing) < 3);
  assert.equal(hasVisibleFocusIndicator(passing), true);
  assert.equal(hasVisibleFocusIndicator(failing), false);
  assert.equal(hasVisibleFocusIndicator(translucent), true);
  assert.equal(
    hasVisibleFocusIndicator([{
      ...style,
      outlineColor: 'rgb(0, 0, 0)',
      outlineStyle: 'dashed',
    }]),
    false,
  );
  assert.equal(
    hasVisibleFocusIndicator([{
      ...style,
      boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 2px',
      outlineStyle: 'none',
      outlineWidth: '0px',
    }]),
    true,
  );
  assert.equal(
    hasVisibleFocusIndicator([{
      ...style,
      boxShadow: 'rgb(0, 0, 0) 0px 0px 1px 2px',
      outlineStyle: 'none',
      outlineWidth: '0px',
    }]),
    false,
  );
  assert.equal(
    hasVisibleFocusIndicator([{
      ...style,
      adjacentBackgroundColor: 'rgba(255, 255, 255, 0.5)',
      outlineColor: 'rgb(0, 0, 0)',
    }]),
    false,
  );
  assert.equal(
    hasVisibleFocusIndicator([{
      ...style,
      boxShadow:
        'rgb(0, 0, 0) 0px 0px 0px 2px, rgb(255, 255, 255) 0px 0px 0px 4px',
      outlineStyle: 'none',
      outlineWidth: '0px',
    }]),
    false,
  );
});

test('overlap and focus decisions reject edge contact and obscured targets', () => {
  const target = { left: 0, right: 10, top: 0, bottom: 10 };
  assert.equal(
    rectanglesOverlap(target, { left: 10, right: 20, top: 0, bottom: 10 }),
    false,
  );
  assert.equal(
    rectanglesOverlap(target, { left: 9, right: 20, top: 9, bottom: 20 }),
    true,
  );
  assert.equal(
    focusIsUnobscured({
      visibleBounds: target,
      hitTargetContainsVisualTarget: [false, true],
    }),
    true,
  );
  assert.equal(
    focusIsUnobscured({
      visibleBounds: { ...target, right: 0 },
      hitTargetContainsVisualTarget: [true],
    }),
    false,
  );
});

test('browser checks restore attributes and detect focus obstruction', async () => {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });

  await page.setContent(`
    <div
      id="managed"
      aria-hidden="true"
      data-base-ui-focus-guard
      data-base-ui-inert="active"
      inert
      tabindex="4"
    ></div>
  `);
  await page.evaluate(() => {
    globalThis.window.axe = {
      run: async () => {
        const element = globalThis.document.getElementById('managed');
        if (
          element?.hasAttribute('aria-hidden')
          || element?.hasAttribute('data-base-ui-inert')
          || element?.hasAttribute('inert')
          || element?.getAttribute('tabindex') !== '-1'
        ) {
          throw new Error('managed attributes were not normalized');
        }
        throw new Error('audit failure');
      },
    };
  });
  const pageWithoutScriptInjection = {
    addScriptTag: async () => {},
    evaluate: (...arguments_) => page.evaluate(...arguments_),
  };
  await assert.rejects(axeResult(pageWithoutScriptInjection), /audit failure/u);
  assert.deepEqual(
    await page.locator('#managed').evaluate((element) => ({
      ariaHidden: element.getAttribute('aria-hidden'),
      dataInert: element.getAttribute('data-base-ui-inert'),
      inert: element.getAttribute('inert'),
      tabIndex: element.getAttribute('tabindex'),
    })),
    {
      ariaHidden: 'true',
      dataInert: 'active',
      inert: '',
      tabIndex: '4',
    },
  );

  await page.setContent(`
    <button id="control" aria-haspopup="dialog" aria-controls="popup">Open</button>
    <div id="popup"></div>
  `);
  await page.evaluate(() => {
    const exact =
      'Fix all of the following:\n  Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="popup"';
    globalThis.window.axe = {
      run: async () => ({
        violations: [],
        incomplete: [
          {
            id: 'aria-valid-attr-value',
            impact: 'serious',
            nodes: [
              {
                target: ['#control'],
                failureSummary: exact,
                html: '<button id="control">',
              },
              {
                target: ['#control'],
                failureSummary: `${exact}\nadditional uncertainty`,
                html: '<button id="control">',
              },
            ],
          },
        ],
      }),
    };
  });
  const classified = await axeResult(pageWithoutScriptInjection);
  assert.equal(classified.resolvedIncomplete[0].nodes.length, 1);
  assert.equal(classified.incomplete[0].nodes.length, 1);

  await page.setContent(`
    <style>
      body { background: white; }
      button { margin: 40px; outline: 2px solid blue; }
      #cover {
        position: fixed;
        inset: 0;
        z-index: 2;
        background: white;
      }
    </style>
    <div id="storybook-root"><button>Focusable</button></div>
    <div id="cover"></div>
  `);
  const focus = await keyboardFocusResult(page);
  assert.equal(focus.applicable, true);
  assert.equal(focus.focused, true);
  assert.equal(focus.tagName, 'button');
  assert.equal(focus.role, null);
  assert.equal(focus.name, 'Focusable');
  assert.ok(focus.indicatorContrast >= 3);
  assert.equal(focus.visibleIndicator, true);
  assert.equal(focus.unobscured, false);
});
