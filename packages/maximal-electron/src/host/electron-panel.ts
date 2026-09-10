import { BrowserWindow, screen, type Rectangle } from 'electron';

export interface ElectronPanelOptions {
  preloadPath: string;
  loadRenderer: (window: BrowserWindow) => void;
  bounds?: (displayBounds: Rectangle) => Rectangle;
  stackAboveFullscreen?: boolean;
  focusWhenShown?: boolean;
}

export interface ElectronPanel {
  window(): BrowserWindow | undefined;
  show(): BrowserWindow;
  hide(): void;
  toggle(): void;
  destroy(): void;
}

export function createElectronPanel(options: ElectronPanelOptions): ElectronPanel {
  let panel: BrowserWindow | undefined;

  const displayBounds = (): Rectangle => {
    const bounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
    return options.bounds?.(bounds) ?? bounds;
  };

  const applyStacking = (window: BrowserWindow): void => {
    if (options.stackAboveFullscreen === false) return;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  };

  const create = (): BrowserWindow => {
    const window = new BrowserWindow({
      ...displayBounds(),
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
      ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    applyStacking(window);
    options.loadRenderer(window);
    window.on('closed', () => {
      if (panel === window) panel = undefined;
    });
    return window;
  };

  const show = (): BrowserWindow => {
    if (!panel || panel.isDestroyed()) panel = create();
    panel.setBounds(displayBounds());
    if (options.stackAboveFullscreen !== false) {
      panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    panel.showInactive();
    if (options.focusWhenShown !== false) panel.focus();
    return panel;
  };

  const hide = (): void => {
    if (panel && !panel.isDestroyed() && panel.isVisible()) panel.hide();
  };

  return {
    window: () => panel,
    show,
    hide,
    toggle: () => {
      if (panel && !panel.isDestroyed() && panel.isVisible()) hide();
      else show();
    },
    destroy: () => {
      if (panel && !panel.isDestroyed()) panel.destroy();
      panel = undefined;
    },
  };
}
