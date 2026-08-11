import * as Tooltip from '@radix-ui/react-tooltip';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RENDERER_SURFACE } from '../scripts/export-checks.mjs';
import * as controls from '../src/renderer/components/controls/index.js';
import * as surface from '../src/renderer/index.js';
import { exportedModules } from './stylesheets.js';
import {
  getTabPanelId,
  getTabTriggerId,
  TabBar,
} from '../src/renderer/components/TabBar.js';
import { TitleBar } from '../src/renderer/components/TitleBar.js';

const tabs = [{ id: 'one', title: 'First document' }];

/**
 * The demo fixture is the first consumer of `./renderer`, and it reached into
 * `src/` for names the entry point did not export. A control the barrel gains
 * and the entry point does not re-export puts that gap back.
 */
describe('the renderer entry point', () => {
  it('publishes a control only when RENDERER_SURFACE names it', () => {
    /*
     * Adding a primitive to the barrel is an internal decision. Publishing one
     * is a permanent commitment to a consumer. Requiring the entry point to
     * re-export the whole barrel collapses the two, so a primitive added for
     * one call site inside this repository becomes public API with nothing
     * asked. `RENDERER_SURFACE` is the deliberate list `verify:exports` holds
     * the built entry to, and this keeps the barrel from writing to it.
     */
    const barrel = Object.keys(controls);
    const undeclared = barrel.filter(
      (name) => name in surface && !RENDERER_SURFACE.includes(name),
    );

    expect(barrel.length).toBeGreaterThan(10);
    expect(undeclared).toEqual([]);
  });

  it('exports the hooks and the terminal theme pair a consumer composes with', () => {
    expect(typeof surface.useThemePreference).toBe('function');
    expect(typeof surface.useShellTabs).toBe('function');
    expect(typeof surface.readTerminalTheme).toBe('function');
  });

  it('resolves the terminal theme through the --shell-* namespace only', () => {
    /*
     * `terminalTheme` and `TERMINAL_TOKENS` in `lib/theme.ts` read
     * `--bg-canvas`, `--text-primary` and `--accent`, which are this
     * application's names and appear in no shipped stylesheet. Both were
     * exported once. A consumer resolving them against a `--shell-*` adapter
     * gets an empty theme and the emulator's defaults, and nothing raises.
     */
    const properties = Object.values(surface.SHELL_TERMINAL_PROPERTIES);

    expect(properties.length).toBeGreaterThan(0);
    expect(properties.filter((name) => !name.startsWith('--shell-'))).toEqual([]);
    expect('terminalTheme' in surface).toBe(false);
    expect('TERMINAL_TOKENS' in surface).toBe(false);
  });

  it('names no custom property outside the --shell-* namespace', () => {
    /*
     * The general form of the assertion above. That one names two symbols, so
     * it catches the mistake that was made and not the next one: any module
     * the entry point reaches can write `--bg-canvas` into a string and hand a
     * consumer a property their adapter never defines.
     *
     * The stylesheet half of this is `tests/package-styles.test.ts`, which
     * holds `structural.css` to the same namespace. This is the JavaScript
     * half, and nothing covered it.
     */
    const modules = exportedModules();
    const named = modules.flatMap(([module, text]) =>
      [...text.matchAll(/'(--[a-z][a-z0-9-]*)'/g)].map((match) => ({
        module,
        property: match[1] ?? '',
      })),
    );

    // The floor. A walk that reached nothing would report a clean namespace
    // over no modules at all.
    expect(modules.length).toBeGreaterThan(10);
    expect(named.length).toBeGreaterThan(0);

    expect(
      named
        .filter((entry) => !entry.property.startsWith('--shell-'))
        .map((entry) => `${entry.module}: ${entry.property}`)
        .sort(),
    ).toEqual([]);
  });
});

describe('packaged renderer components', () => {
  it('renders injected titlebar regions with their accessible labels', () => {
    const markup = renderToStaticMarkup(
      <Tooltip.Provider>
        <TitleBar
          tabIdBase="test-documents"
          leading={<button aria-label="Open workspace switcher">W</button>}
          actions={<button aria-label="Open command palette">C</button>}
          tabs={tabs}
          activeTab="one"
          onSelectTab={vi.fn()}
        />
      </Tooltip.Provider>,
    );

    expect(markup).toContain('class="titlebar__leading"');
    expect(markup).toContain('aria-label="Open workspace switcher"');
    expect(markup).toContain('class="titlebar__actions"');
    expect(markup).toContain('aria-label="Open command palette"');
    expect(markup).not.toContain('summon overlay');
  });

  it('omits close and new-tab controls when their callbacks are absent', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={tabs}
        active="one"
        onSelect={vi.fn()}
        label="Workspace tabs"
      />,
    );

    expect(markup).toContain('aria-label="Workspace tabs"');
    expect(markup).not.toContain('Close First document');
    expect(markup).not.toContain('data-testid="tab-new"');
  });

  it('renders close and new-tab controls when their callbacks are supplied', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[
          ...tabs,
          { id: 'two', title: 'Second document' },
        ]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onNew={vi.fn()}
        newLabel="Create workspace tab"
      />,
    );

    expect(markup).toContain('aria-label="Close First document"');
    expect(markup).toContain('aria-label="Create workspace tab"');
    expect(markup).toContain(`id="${getTabTriggerId('test-documents', 'one')}"`);
    expect(markup).toContain(
      `aria-controls="${getTabPanelId('test-documents', 'one')}"`,
    );
    expect(markup).not.toContain('role="tabpanel"');
    expect(markup).not.toMatch(/role="tab"[^>]*>.*role="button"/s);
  });

  it('names a panel only for the tab whose panel the caller renders', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[...tabs, { id: 'two', title: 'Second document' }]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain(
      `aria-controls="${getTabPanelId('test-documents', 'one')}"`,
    );
    expect(markup).not.toContain(getTabPanelId('test-documents', 'two'));
  });

  it('announces the shortcut that closes a tab, and only when one can close', () => {
    const closable = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[...tabs, { id: 'two', title: 'Second document' }]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const last = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={tabs}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(closable).toContain('aria-keyshortcuts="Delete"');
    expect(last).not.toContain('aria-keyshortcuts');
  });

  it('keeps the create and close controls out of the tablist', () => {
    const markup = renderToStaticMarkup(
      <TabBar
        tabIdBase="test-documents"
        tabs={[...tabs, { id: 'two', title: 'Second document' }]}
        active="one"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onNew={vi.fn()}
      />,
    );

    // A tablist may own nothing but tabs. Only the triggers are elements, and
    // none of them is a `div`, so the first closing `div` ends the list.
    const listEnds = markup.indexOf('</div>', markup.indexOf('role="tablist"'));

    expect(listEnds).toBeGreaterThan(0);
    expect(markup.indexOf('data-testid="tab-new"')).toBeGreaterThan(listEnds);
    expect(markup.indexOf('aria-label="Close First document"')).toBeGreaterThan(
      listEnds,
    );
  });
});
