import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

export const AXE_INCOMPLETE_MESSAGES = Object.freeze({
  ariaControls:
    /^Fix all of the following:\n {2}Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="[^"]+"$/u,
  overlap:
    "Fix any of the following:\n  Element's background color could not be determined because it is overlapped by another element",
  partialObscuration:
    "Fix any of the following:\n  Element's background color could not be determined because it's partially obscured by another element",
  partialOverlap:
    "Fix any of the following:\n  Element's background color could not be determined because it partially overlaps other elements",
});

export function colorChannels(value) {
  const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [];
  return channels.length >= 3
    ? [channels[0], channels[1], channels[2], channels[3] ?? 1]
    : null;
}

export function compositeColors(foreground, background) {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    ...foreground.slice(0, 3).map(
      (channel, index) =>
        (
          channel * foreground[3]
          + background[index] * background[3] * (1 - foreground[3])
        ) / alpha,
    ),
    alpha,
  ];
}

export function relativeLuminance(color) {
  return color.slice(0, 3)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce(
      (total, channel, index) =>
        total + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

export function contrastThreshold(fontSize, fontWeight) {
  const largeText =
    fontSize >= 24
    || (fontSize >= 18.66 && Number.isFinite(fontWeight) && fontWeight >= 700);
  return largeText ? 3 : 4.5;
}

export function rectanglesOverlap(left, right) {
  return (
    Math.max(left.left, right.left) < Math.min(left.right, right.right)
    && Math.max(left.top, right.top) < Math.min(left.bottom, right.bottom)
  );
}

export function focusIndicatorContrast(styles) {
  let maximumContrast = null;
  for (const style of styles) {
    const adjacent = colorChannels(style.adjacentBackgroundColor ?? '');
    if (adjacent === null || adjacent[3] !== 1) continue;
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    if (
      style.outlineStyle === 'solid'
      && Number.isFinite(outlineWidth)
      && outlineWidth > 0
    ) {
      const outline = colorChannels(style.outlineColor ?? '');
      if (outline !== null && outline[3] > 0) {
        maximumContrast = Math.max(
          maximumContrast ?? 0,
          contrastRatio(compositeColors(outline, adjacent), adjacent),
        );
      }
    }
    const shadow = style.boxShadow?.match(
      /^(rgba?\([^)]+\)) (-?[\d.]+px) (-?[\d.]+px) ([\d.]+px) ([\d.]+px)$/u,
    );
    if (
      shadow !== null
      && Number.parseFloat(shadow[2]) === 0
      && Number.parseFloat(shadow[3]) === 0
      && Number.parseFloat(shadow[4]) === 0
      && Number.parseFloat(shadow[5]) > 0
    ) {
      const shadowColor = colorChannels(shadow[1]);
      if (shadowColor !== null && shadowColor[3] > 0) {
        maximumContrast = Math.max(
          maximumContrast ?? 0,
          contrastRatio(compositeColors(shadowColor, adjacent), adjacent),
        );
      }
    }
  }
  return maximumContrast;
}

export function hasVisibleFocusIndicator(styles) {
  return (focusIndicatorContrast(styles) ?? 0) >= 3;
}

export function focusIsUnobscured({
  visibleBounds,
  hitTargetContainsVisualTarget,
}) {
  return (
    visibleBounds.left < visibleBounds.right
    && visibleBounds.top < visibleBounds.bottom
    && hitTargetContainsVisualTarget.some(Boolean)
  );
}

export function classifyAxeIncomplete({
  id,
  failureSummary,
  targetCount,
  allAriaControlsExist = false,
  allTargetsHaveSufficientContrast = false,
  allTargetsClipped = false,
  hasOverlappingSibling = true,
}) {
  if (
    id === 'aria-valid-attr-value'
    && AXE_INCOMPLETE_MESSAGES.ariaControls.test(failureSummary ?? '')
  ) {
    return targetCount > 0 && allAriaControlsExist;
  }
  if (
    id === 'color-contrast'
    && (
      failureSummary === AXE_INCOMPLETE_MESSAGES.overlap
      || failureSummary === AXE_INCOMPLETE_MESSAGES.partialOverlap
    )
  ) {
    return (
      targetCount > 0
      && allTargetsHaveSufficientContrast
      && !hasOverlappingSibling
    );
  }
  if (
    id === 'color-contrast'
    && failureSummary === AXE_INCOMPLETE_MESSAGES.partialObscuration
  ) {
    return (
      targetCount > 0
      && allTargetsHaveSufficientContrast
      && allTargetsClipped
    );
  }
  return false;
}

export async function axeResult(page, disabledRules = []) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async ({
    disabledRules: disabledRuleNames,
    incompleteMessages,
  }) => {
    const settle = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds));
    const colorChannels = (value) => {
      const channels = value.match(/[\d.]+/gu)?.map(Number) ?? [];
      return channels.length >= 3
        ? [channels[0], channels[1], channels[2], channels[3] ?? 1]
        : null;
    };
    const composite = (foreground, background) => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        ...foreground.slice(0, 3).map(
          (channel, index) =>
            (
              channel * foreground[3]
              + background[index] * background[3] * (1 - foreground[3])
            ) / alpha,
        ),
        alpha,
      ];
    };
    const luminance = (color) => color.slice(0, 3)
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce(
        (total, channel, index) =>
          total + channel * [0.2126, 0.7152, 0.0722][index],
        0,
      );
    const hasSufficientContrast = (element) => {
      const style = globalThis.getComputedStyle(element);
      const foreground = colorChannels(style.color);
      if (foreground === null || foreground[3] !== 1) return false;
      let background = [0, 0, 0, 0];
      for (
        let current = element;
        current instanceof globalThis.HTMLElement;
        current = current.parentElement
      ) {
        const currentStyle = globalThis.getComputedStyle(current);
        if (currentStyle.backgroundImage !== 'none') return false;
        const layer = colorChannels(currentStyle.backgroundColor);
        if (layer === null) return false;
        background = composite(background, layer);
        if (background[3] === 1) break;
      }
      if (background[3] !== 1) return false;
      const ratio =
        (Math.max(luminance(foreground), luminance(background)) + 0.05)
        / (Math.min(luminance(foreground), luminance(background)) + 0.05);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10);
      const largeText =
        fontSize >= 24
        || (fontSize >= 18.66 && Number.isFinite(fontWeight) && fontWeight >= 700);
      return ratio >= (largeText ? 3 : 4.5);
    };
    const hasOverlappingSibling = (element) => {
      const targetBounds = element.getBoundingClientRect();
      for (
        let current = element;
        current instanceof globalThis.HTMLElement;
        current = current.parentElement
      ) {
        const parent = current.parentElement;
        if (!(parent instanceof globalThis.HTMLElement)) break;
        for (const sibling of parent.children) {
          if (
            sibling === current
            || !(sibling instanceof globalThis.HTMLElement)
          ) {
            continue;
          }
          const siblingBounds = sibling.getBoundingClientRect();
          if (
            Math.max(targetBounds.left, siblingBounds.left)
              < Math.min(targetBounds.right, siblingBounds.right)
            && Math.max(targetBounds.top, siblingBounds.top)
              < Math.min(targetBounds.bottom, siblingBounds.bottom)
          ) {
            return true;
          }
        }
        const background = colorChannels(
          globalThis.getComputedStyle(parent).backgroundColor,
        );
        if (background?.[3] === 1) break;
      }
      return false;
    };
    const isClippedByAncestor = (element) => {
      const bounds = element.getBoundingClientRect();
      for (
        let current = element.parentElement;
        current instanceof globalThis.HTMLElement;
        current = current.parentElement
      ) {
        const style = globalThis.getComputedStyle(current);
        if (
          !['auto', 'hidden', 'scroll'].includes(style.overflowX)
          && !['auto', 'hidden', 'scroll'].includes(style.overflowY)
        ) {
          continue;
        }
        const clippingBounds = current.getBoundingClientRect();
        if (
          bounds.left < clippingBounds.left
          || bounds.right > clippingBounds.right
          || bounds.top < clippingBounds.top
          || bounds.bottom > clippingBounds.bottom
        ) {
          return true;
        }
      }
      return false;
    };
    for (let tries = 0; tries < 12; tries += 1) {
      try {
        const managedElements = [
          ...document.querySelectorAll(
            '[data-base-ui-focus-guard], [data-base-ui-inert]',
          ),
        ];
        const attributes = managedElements.map((element) => ({
          element,
          ariaHidden: element.getAttribute('aria-hidden'),
          dataInert: element.getAttribute('data-base-ui-inert'),
          inert: element.getAttribute('inert'),
          tabIndex: element.getAttribute('tabindex'),
        }));
        for (const entry of attributes) {
          entry.element.removeAttribute('aria-hidden');
          entry.element.removeAttribute('data-base-ui-inert');
          entry.element.removeAttribute('inert');
          if (entry.element.hasAttribute('data-base-ui-focus-guard')) {
            entry.element.setAttribute('tabindex', '-1');
          }
        }
        await settle(50);
        let report;
        try {
          report = await window.axe.run(document, {
            resultTypes: ['violations', 'incomplete'],
            runOnly: {
              type: 'tag',
              values: [
                'wcag2a',
                'wcag2aa',
                'wcag21a',
                'wcag21aa',
                'wcag22aa',
                'best-practice',
              ],
            },
            rules: Object.fromEntries(
              disabledRuleNames.map((rule) => [rule, { enabled: false }]),
            ),
          });
        } finally {
          for (const entry of attributes) {
            for (const [name, value] of [
              ['aria-hidden', entry.ariaHidden],
              ['data-base-ui-inert', entry.dataInert],
              ['inert', entry.inert],
              ['tabindex', entry.tabIndex],
            ]) {
              if (value === null) entry.element.removeAttribute(name);
              else entry.element.setAttribute(name, value);
            }
          }
        }
        const resolvedIncomplete = [];
        const incomplete = report.incomplete.flatMap((result) => {
          const unresolvedNodes = result.nodes.filter((node) => {
            const targets = node.target
              .map((target) => {
                try {
                  return typeof target === 'string'
                    ? document.querySelector(target)
                    : null;
                } catch {
                  return null;
                }
              })
              .filter((element) => element instanceof globalThis.HTMLElement);
            if (
              result.id === 'aria-valid-attr-value'
              && /^Fix all of the following:\n {2}Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="[^"]+"$/u.test(
                node.failureSummary ?? '',
              )
            ) {
              return (
                targets.length === 0
                || targets.some((element) => {
                  const controlledIds = element
                    .getAttribute('aria-controls')
                    ?.split(/\s+/u)
                    .filter(Boolean) ?? [];
                  return (
                    controlledIds.length === 0
                    || controlledIds.some(
                      (id) => document.getElementById(id) === null,
                    )
                  );
                })
              );
            }
            if (
              result.id === 'color-contrast'
              && (
                node.failureSummary === incompleteMessages.overlap
                || node.failureSummary === incompleteMessages.partialOverlap
              )
            ) {
              return (
                targets.length === 0
                || targets.some(
                  (element) =>
                    !hasSufficientContrast(element)
                    || hasOverlappingSibling(element),
                )
              );
            }
            if (
              result.id === 'color-contrast'
              && node.failureSummary === incompleteMessages.partialObscuration
            ) {
              return (
                targets.length === 0
                || targets.some(
                  (element) =>
                    !hasSufficientContrast(element)
                    || !isClippedByAncestor(element),
                )
              );
            }
            return true;
          });
          if (unresolvedNodes.length === result.nodes.length) return [result];
          resolvedIncomplete.push({
            ...result,
            nodes: result.nodes.filter((node) => !unresolvedNodes.includes(node)),
          });
          return unresolvedNodes.length === 0
            ? []
            : [{ ...result, nodes: unresolvedNodes }];
        });
        return {
          ran: true,
          violations: report.violations,
          incomplete,
          resolvedIncomplete,
        };
      } catch (error) {
        if (!/already running/iu.test(String(error))) throw error;
        await settle(250);
      }
    }
    return {
      ran: false,
      violations: [],
      incomplete: [],
      resolvedIncomplete: [],
    };
  }, {
    disabledRules,
    incompleteMessages: {
      overlap: AXE_INCOMPLETE_MESSAGES.overlap,
      partialObscuration: AXE_INCOMPLETE_MESSAGES.partialObscuration,
      partialOverlap: AXE_INCOMPLETE_MESSAGES.partialOverlap,
    },
  });
}

export async function keyboardFocusResult(page) {
  const focusableCount = await page.evaluate(() => {
    if (
      document.querySelector(
        '[role="dialog"][data-open], [role="menu"][data-open], [role="listbox"][data-open]',
      ) !== null
    ) {
      return 0;
    }
    document.activeElement instanceof globalThis.HTMLElement
      && document.activeElement.blur();
    const storyRoot = document.getElementById('storybook-root');
    if (storyRoot instanceof globalThis.HTMLElement) {
      storyRoot.tabIndex = -1;
      storyRoot.focus();
    }
    return [...document.querySelectorAll([
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[tabindex]',
    ].join(','))].filter(
      (element) =>
        element instanceof globalThis.HTMLElement
        && (
          element.closest('#storybook-root') !== null
          || element.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== null
        )
        && element.tabIndex >= 0
        && !element.hasAttribute('disabled')
        && !element.hasAttribute('data-disabled')
        && element.getAttribute('aria-disabled') !== 'true',
    ).length;
  });
  if (focusableCount === 0) return { applicable: false };

  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof globalThis.HTMLElement) || active === document.body) {
      return {
        applicable: true,
        focused: false,
        visibleIndicator: false,
        unobscured: false,
      };
    }

    const channels = (value) => {
      const values = value.match(/[\d.]+/gu)?.map(Number) ?? [];
      return values.length >= 3
        ? [values[0], values[1], values[2], values[3] ?? 1]
        : null;
    };
    const composite = (foreground, background) => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        ...foreground.slice(0, 3).map(
          (channel, index) =>
            (
              channel * foreground[3]
              + background[index] * background[3] * (1 - foreground[3])
            ) / alpha,
        ),
        alpha,
      ];
    };
    const luminance = (color) => color.slice(0, 3)
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce(
        (total, channel, index) =>
          total + channel * [0.2126, 0.7152, 0.0722][index],
        0,
      );
    const ratio = (left, right) =>
      (Math.max(luminance(left), luminance(right)) + 0.05)
      / (Math.min(luminance(left), luminance(right)) + 0.05);
    const adjacentBackground = (element) => {
      let background = [0, 0, 0, 0];
      for (
        let current = element;
        current instanceof globalThis.HTMLElement;
        current = current.parentElement
      ) {
        const style = globalThis.getComputedStyle(current);
        if (style.backgroundImage !== 'none') return null;
        const layer = channels(style.backgroundColor);
        if (layer === null) return null;
        background = composite(background, layer);
        if (background[3] === 1) return background;
      }
      return null;
    };
    const focusCandidates = [];
    const addFocusCandidate = (element) => {
      const style = globalThis.getComputedStyle(element);
      focusCandidates.push({
        style,
        adjacent: adjacentBackground(element.parentElement),
      });
    };
    for (
      let element = active;
      element instanceof globalThis.HTMLElement;
      element = element.parentElement
    ) {
      addFocusCandidate(element);
      if (element.id === 'storybook-root') break;
    }
    for (const element of document.querySelectorAll(
      '[data-focus-visible], :focus-visible',
    )) {
      addFocusCandidate(element);
    }
    const activeStyle = globalThis.getComputedStyle(active);
    const visualTarget =
      activeStyle.clipPath !== 'none'
      && active.parentElement instanceof globalThis.HTMLElement
        ? active.parentElement
        : active;
    const bounds = visualTarget.getBoundingClientRect();
    let visibleBounds = {
      left: Math.max(bounds.left, 0),
      right: Math.min(bounds.right, globalThis.innerWidth),
      top: Math.max(bounds.top, 0),
      bottom: Math.min(bounds.bottom, globalThis.innerHeight),
    };
    for (
      let element = visualTarget.parentElement;
      element instanceof globalThis.HTMLElement;
      element = element.parentElement
    ) {
      const style = globalThis.getComputedStyle(element);
      const clipsX = ['auto', 'hidden', 'scroll'].includes(style.overflowX);
      const clipsY = ['auto', 'hidden', 'scroll'].includes(style.overflowY);
      if (clipsX || clipsY) {
        const clippingBounds = element.getBoundingClientRect();
        if (clipsX) {
          visibleBounds.left = Math.max(visibleBounds.left, clippingBounds.left);
          visibleBounds.right = Math.min(visibleBounds.right, clippingBounds.right);
        }
        if (clipsY) {
          visibleBounds.top = Math.max(visibleBounds.top, clippingBounds.top);
          visibleBounds.bottom = Math.min(visibleBounds.bottom, clippingBounds.bottom);
        }
      }
    }
    const hitTargets = [0.25, 0.5, 0.75].flatMap((xRatio) =>
      [0.25, 0.5, 0.75].map((yRatio) =>
        document.elementFromPoint(
          visibleBounds.left
            + (visibleBounds.right - visibleBounds.left) * xRatio,
          visibleBounds.top
            + (visibleBounds.bottom - visibleBounds.top) * yRatio,
        )
      )
    );
    let indicatorContrast = null;
    for (const { style, adjacent } of focusCandidates) {
      if (adjacent === null) continue;
      const outlineWidth = Number.parseFloat(style.outlineWidth);
      if (
        style.outlineStyle === 'solid'
        && Number.isFinite(outlineWidth)
        && outlineWidth > 0
      ) {
        const outline = channels(style.outlineColor);
        if (outline !== null && outline[3] > 0) {
          indicatorContrast = Math.max(
            indicatorContrast ?? 0,
            ratio(composite(outline, adjacent), adjacent),
          );
        }
      }
      const shadow = style.boxShadow.match(
        /^(rgba?\([^)]+\)) (-?[\d.]+px) (-?[\d.]+px) ([\d.]+px) ([\d.]+px)$/u,
      );
      if (
        shadow !== null
        && Number.parseFloat(shadow[2]) === 0
        && Number.parseFloat(shadow[3]) === 0
        && Number.parseFloat(shadow[4]) === 0
        && Number.parseFloat(shadow[5]) > 0
      ) {
        const shadowColor = channels(shadow[1]);
        if (shadowColor !== null && shadowColor[3] > 0) {
          indicatorContrast = Math.max(
            indicatorContrast ?? 0,
            ratio(composite(shadowColor, adjacent), adjacent),
          );
        }
      }
    }
    const visibleIndicator =
      indicatorContrast !== null && indicatorContrast >= 3;
    return {
      applicable: true,
      focused: true,
      tagName: active.tagName.toLowerCase(),
      role: active.getAttribute('role'),
      name: active.getAttribute('aria-label') ?? active.textContent?.trim() ?? '',
      indicatorContrast,
      visibleIndicator,
      unobscured:
        visibleBounds.left < visibleBounds.right
        && visibleBounds.top < visibleBounds.bottom
        && hitTargets.some(
          (target) => target === visualTarget || visualTarget.contains(target),
        ),
    };
  });
}
