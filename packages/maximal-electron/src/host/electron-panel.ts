import { BrowserWindow, screen, type Rectangle } from 'electron';

export interface ElectronPanelOptions {
  preloadPath: string;
  loadRenderer: (window: BrowserWindow) => void;
  bounds?: (displayWorkArea: Rectangle) => Rectangle;
  stackAboveFullscreen?: boolean;
  focusWhenShown?: boolean;
  movable?: boolean;
  onMoved?: (bounds: Rectangle) => void;
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
  let lastProgrammaticBounds: Rectangle | undefined;

  const panelBounds = (): Rectangle => {
    const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    return options.bounds?.(workArea) ?? workArea;
  };

  const applyStacking = (window: BrowserWindow): void => {
    if (options.stackAboveFullscreen === false) return;
    window.setAlwaysOnTop(true, 'floating');
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      // A native panel needs no app-wide process-type transform, which would
      // temporarily remove the macOS menu bar and dock presence.
      skipTransformProcessType: process.platform === 'darwin',
    });
  };

  const create = (bounds: Rectangle): BrowserWindow => {
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: options.movable ?? false,
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
    window.on('moved', () => {
      const bounds = window.getBounds();
      const wasProgrammatic =
        lastProgrammaticBounds !== undefined
        && bounds.x === lastProgrammaticBounds.x
        && bounds.y === lastProgrammaticBounds.y
        && bounds.width === lastProgrammaticBounds.width
        && bounds.height === lastProgrammaticBounds.height;
      if (!wasProgrammatic) options.onMoved?.(bounds);
    });
    window.on('closed', () => {
      if (panel === window) panel = undefined;
    });
    return window;
  };

  const show = (): BrowserWindow => {
    const bounds = panelBounds();
    if (!panel || panel.isDestroyed()) panel = create(bounds);
    else {
      lastProgrammaticBounds = bounds;
      panel.setBounds(bounds);
    }
    if (options.stackAboveFullscreen !== false) {
      panel.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: process.platform === 'darwin',
      });
    }
    panel.showInactive();
    // macOS may adjust a panel while ordering it on screen. Reassert the
    // requested work-area-relative bounds after it becomes visible.
    lastProgrammaticBounds = bounds;
    panel.setBounds(bounds);
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
