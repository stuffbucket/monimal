/** A side panel's geometry. Sizes are strings in v4, not numbers. */
export interface PanelSize {
  default: string;
  min: string;
  max: string;
  collapsed: string;
}

/** Geometry for each semantic shell region. */
export interface ShellPanelSizes {
  readonly sidebar: Readonly<PanelSize>;
  readonly inspector: Readonly<PanelSize>;
  readonly drawer: Readonly<PanelSize>;
  readonly canvas: { readonly minWidth: string; readonly minHeight: string };
}

/**
 * Default shell panel geometry. react-resizable-panels reads these on mount and
 * accepts only unit strings, so they cannot be CSS custom properties. Unitless
 * values are percentages of the enclosing group; the sidebar holds fixed-size
 * icons, so it is in pixels.
 */
export const SHELL_PANEL_SIZES: ShellPanelSizes = {
  sidebar: { default: '228px', min: '168px', max: '320px', collapsed: '48px' },
  inspector: { default: '22', min: '16', max: '36', collapsed: '0' },
  drawer: { default: '30', min: '10', max: '70', collapsed: '0' },
  canvas: { minWidth: '30', minHeight: '20' },
};
