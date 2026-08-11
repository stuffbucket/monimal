import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { app, nativeTheme } from 'electron';

import { DEFAULT_PREFERENCES, type Preferences } from '../../shared/ipc.js';

/**
 * Preferences live in one JSON file under `userData`. This is deliberately
 * small: no schema migrations, no external store. Swap it for a real store if
 * a fork needs one.
 */
function prefsPath(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

let cached: Preferences | undefined;
const listeners = new Set<(prefs: Preferences) => void>();

function coerce(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFERENCES };
  const input = raw as Partial<Preferences>;
  return {
    menuBarIcon:
      typeof input.menuBarIcon === 'boolean'
        ? input.menuBarIcon
        : DEFAULT_PREFERENCES.menuBarIcon,
    dockBadge:
      typeof input.dockBadge === 'boolean'
        ? input.dockBadge
        : DEFAULT_PREFERENCES.dockBadge,
    splash:
      typeof input.splash === 'boolean' ? input.splash : DEFAULT_PREFERENCES.splash,
    overlayHotkey:
      typeof input.overlayHotkey === 'string' && input.overlayHotkey.length > 0
        ? input.overlayHotkey
        : DEFAULT_PREFERENCES.overlayHotkey,
    agentTools:
      typeof input.agentTools === 'boolean'
        ? input.agentTools
        : DEFAULT_PREFERENCES.agentTools,
    // An allow-list, not a cast. A corrupt or hand-edited file must not be
    // able to land on `none` and silently turn the approval gate off.
    agentApproval:
      input.agentApproval === 'all' ||
      input.agentApproval === 'writes' ||
      input.agentApproval === 'none'
        ? input.agentApproval
        : DEFAULT_PREFERENCES.agentApproval,
    agentCwd:
      typeof input.agentCwd === 'string'
        ? input.agentCwd
        : DEFAULT_PREFERENCES.agentCwd,
    // Ids only, and strings only. A malformed entry here would reach the
    // toolset registry, which skips what it does not recognise.
    agentToolsets: Array.isArray(input.agentToolsets)
      ? input.agentToolsets.filter((id): id is string => typeof id === 'string')
      : [...DEFAULT_PREFERENCES.agentToolsets],
    theme:
      input.theme === 'light' || input.theme === 'dark' || input.theme === 'system'
        ? input.theme
        : DEFAULT_PREFERENCES.theme,
    terminalDetach:
      typeof input.terminalDetach === 'boolean'
        ? input.terminalDetach
        : DEFAULT_PREFERENCES.terminalDetach,
  };
}

/**
 * True when Playwright is driving the application.
 *
 * Under test the splash is forced off: it is a second window that closes on its
 * own, which makes `firstWindow()` racy and the run flaky.
 */
export function isE2E(): boolean {
  return process.env['STUFFBUCKET_E2E'] === '1';
}

/**
 * True when the window should mount the demo shell.
 *
 * `STUFFBUCKET_DEMO=1` makes `createMainWindow` load the capture fixture's own
 * renderer bundle instead of the product's. The renderer knows nothing about
 * it: there is no flag to read and no branch to take, because the two shells
 * are two entry points.
 *
 * The fixture bundle is excluded from the package, so this is reachable from a
 * checkout and not from an installed application.
 *
 * It also earns a profile of its own. See `src/main/index.ts`.
 */
export function isDemo(): boolean {
  return process.env['STUFFBUCKET_DEMO'] === '1';
}

/**
 * True when the suite should stay off the user's screen.
 *
 * A test run drives a real application on a real desktop. Left alone it paints
 * over whatever the user is doing and takes their keyboard, once per scenario.
 * Nothing about the suite needs that: Playwright dispatches input through the
 * debugger, and screenshots read the renderer rather than the screen.
 *
 * Quiet is the default, because a suite that hijacks the machine stops getting
 * run. Set `STUFFBUCKET_E2E_VISIBLE=1` to watch a run.
 */
export function isE2EQuiet(): boolean {
  return isE2E() && process.env['STUFFBUCKET_E2E_VISIBLE'] !== '1';
}

/**
 * Push a window off the side of its display, for a quiet test run.
 *
 * Off screen rather than transparent. `setOpacity(0)` also works, in the sense
 * that the suite passes and nothing appears: it stops the compositor producing
 * content, so every reference screenshot came out blank white while the tests
 * stayed green. Moving the window keeps it rendering at full size, so layout
 * and screenshots are identical to a visible run.
 *
 * Windows also need `backgroundThrottling: false`, or macOS marks them
 * occluded and Chromium throttles the renderer to the same blank result.
 */
export function quietBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  if (!isE2EQuiet()) return bounds;
  return { ...bounds, x: bounds.x + bounds.width + 200 };
}

export function getPreferences(): Preferences {
  if (cached) return cached;
  try {
    cached = coerce(JSON.parse(readFileSync(prefsPath(), 'utf8')));
  } catch {
    // Missing or corrupt file is normal on first run. Fall back to defaults
    // rather than failing the launch.
    cached = { ...DEFAULT_PREFERENCES };
  }
  if (isE2E()) cached.splash = false;
  applyTheme(cached);
  return cached;
}

export function setPreferences(patch: Partial<Preferences>): Preferences {
  const next = coerce({ ...getPreferences(), ...patch });
  cached = next;
  try {
    writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to persist preferences:', error);
  }
  applyTheme(next);
  for (const listener of listeners) listener(next);
  return next;
}

export function onPreferencesChanged(
  listener: (prefs: Preferences) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyTheme(prefs: Preferences): void {
  nativeTheme.themeSource = prefs.theme;
}
