import * as Tooltip from '@radix-ui/react-tooltip';
import { createElement } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';

// Neither stylesheet is imported for its side effect. `shell-mode.ts` holds
// both and installs one, because the two cannot share a document: see the
// comment on `SHELL_MODES` there.
import {
  applyShellMode,
  applyShellRoot,
  initialShellMode,
  SHELL_MODES,
  type ShellMode,
} from './shell-mode.js';
// Then undo the parts of shell.css's document reset that assume an
// application window.
import './preview.css';

/**
 * Theme, as a toolbar switch.
 *
 * The palette is defined twice in `tokens.css` and selected by `data-theme` on
 * the document root, exactly as `useThemePreference` does it at run time. Every
 * story therefore gets both schemes for free, which is the one thing that was
 * genuinely hard to see before: the light palette only ever appeared by driving
 * the application and toggling a preference.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals['theme'] as string;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  return Story();
};

/**
 * Stylesheet, as a toolbar switch.
 *
 * A story drawn by `shell.css` is a story drawn the way this application draws
 * it. The file a consumer installs is `structural.css`: no palette, and every
 * rule under `.sb-shell`. Two defects lived in that gap — a portalled surface
 * that no shipped rule could reach, and status colours the package cannot
 * draw — and both were invisible here, because an unscoped stylesheet with a
 * palette in it makes every story look finished. See `docs/storybook.md`.
 *
 * The mode installs its stylesheet and, in package mode, marks the story root
 * with the class the shipped rules are scoped under. Nothing else changes.
 */
const withShellMode: Decorator = (Story, context) => {
  const mode = context.globals['shell'] as ShellMode;
  applyShellMode(mode);
  applyShellRoot(mode, context.canvasElement);
  return Story();
};

/**
 * `IconButton` wraps its child in a Radix `Tooltip.Root`, which needs a
 * provider above it. `ShellLayout` supplies one in the application; a story
 * has no shell, and without this the button renders nothing rather than
 * throwing. Global, because forgetting it per story is exactly the trap.
 */
const withTooltips: Decorator = (Story) =>
  createElement(Tooltip.Provider, { delayDuration: 200, children: Story() });

const preview: Preview = {
  decorators: [withTooltips, withTheme, withShellMode],
  // A docs page for every component, from its args and its docstring.
  tags: ['autodocs'],
  initialGlobals: { theme: 'dark', shell: initialShellMode() },
  globalTypes: {
    theme: {
      description: 'Colour scheme',
      toolbar: {
        icon: 'contrast',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
          { value: 'system', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
    shell: {
      description: 'Stylesheet',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: SHELL_MODES[0], title: 'Application (shell.css)' },
          { value: SHELL_MODES[1], title: 'Package (structural.css)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    a11y: {
      /*
       * A story is a component, not a page. `landmark-one-main`,
       * `page-has-heading-one` and `region` all ask for document structure the
       * shell supplies and an isolated control cannot. Leaving them on trains
       * everyone to ignore the panel, which costs the rules that do apply —
       * `color-contrast` found a real defect the day this was installed.
       */
      config: {
        rules: [
          { id: 'landmark-one-main', enabled: false },
          { id: 'page-has-heading-one', enabled: false },
          { id: 'region', enabled: false },
        ],
      },
    },
    layout: 'padded',
    controls: { expanded: true },
    backgrounds: { disable: true },
  },
};

export default preview;
