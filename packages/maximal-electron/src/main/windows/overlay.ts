import path from 'node:path';

import { BrowserWindow, screen } from 'electron';

import { isE2EQuiet, quietBounds } from '../native/preferences.js';

/**
 * The floating command overlay, in the model `stuffbucket/wiggle` uses: a small
 * native surface, everything visual in CSS.
 *
 * Two constraints, both easy to get wrong:
 *
 * - **Do not steal focus from the application underneath.** On macOS `type:
 *   'panel'` is an `NSPanel`, which takes key input without activating this
 *   application. `showInactive` then `focus` is what gives a card the user can
 *   type into while the app behind keeps its activation state.
 * - **Follow the cursor, not the primary display.**
 *
 * Windows and Linux have no `NSPanel` and get an always-on-top tool window.
 * `docs/roadmap.md` has the second phase.
 *
 * Under `STUFFBUCKET_E2E` this window stays out of the user's way without
 * changing how it lays out. See `docs/testing.md`.
 */

/** Quiet the overlay under test. See the note above. */
function applyStacking(window: BrowserWindow): void {
  if (isE2EQuiet()) {
    // Deliberately no always-on-top and no all-workspaces. Those are what put
    // a test run above the user's full-screen editor.
    return;
  }

  // Above full-screen applications and other always-on-top windows.
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

let overlay: BrowserWindow | undefined;

function displayUnderCursor(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function createOverlayWindow(): BrowserWindow {
  const { bounds } = displayUnderCursor();

  const window = new BrowserWindow({
    ...quietBounds(bounds),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // macOS: an NSPanel, so it can be key without activating the application.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A quiet run parks this window off screen, where macOS reports it
      // occluded. Without this, Chromium throttles the renderer and every
      // screenshot comes back blank.
      backgroundThrottling: false,
    },
  });

  // Above full-screen applications and other always-on-top windows.
  applyStacking(window);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/overlay.html`);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/overlay.html`),
    );
  }

  // Hiding rather than closing keeps the renderer warm, so the next summon is
  // instant. The overlay is summoned often and briefly.
  //
  // Deliberately no hide-on-blur. The window covers the whole display, so a
  // click outside the card already lands on the scrim, which dismisses. Adding
  // a blur handler on top of that means any notification or background window
  // stealing focus makes the card vanish mid-sentence.
  window.on('closed', () => {
    overlay = undefined;
  });

  return window;
}

export function showOverlay(): void {
  overlay ??= createOverlayWindow();

  // The cursor may be on a different monitor than last time.
  overlay.setBounds(quietBounds(displayUnderCursor().bounds));
  if (!isE2EQuiet()) {
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // `showInactive` puts it on screen without activating this application.
  // `focus` then gives the panel key input. On macOS the panel type is what
  // makes that combination not raise the whole app.
  overlay.showInactive();

  // Under test, taking key input would pull focus out of whatever the user is
  // working in, once per scenario. Playwright dispatches keys through the
  // debugger, so the card receives them either way.
  if (!isE2EQuiet()) overlay.focus();
}

export function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.hide();
}

export function toggleOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) hideOverlay();
  else showOverlay();
}

export function destroyOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = undefined;
}
