import { describe, expect, it } from 'vitest';

import { SHELL_PANEL_SIZES, type PanelSize } from '../src/renderer/lib/panel-sizes.js';

const SIZE = /^(\d+(?:\.\d+)?)(px)?$/;

function measure(value: string): { amount: number; unit: string } {
  const match = SIZE.exec(value);
  if (match === null) throw new Error(`${value} is not a px or percentage size`);
  return { amount: Number(match[1]), unit: match[2] ?? '%' };
}

describe('SHELL_PANEL_SIZES', () => {
  const panels: [string, PanelSize][] = [
    ['sidebar', SHELL_PANEL_SIZES.sidebar],
    ['inspector', SHELL_PANEL_SIZES.inspector],
    ['drawer', SHELL_PANEL_SIZES.drawer],
  ];

  it.each(panels)('keeps the %s default within its bounds', (_, size) => {
    const min = measure(size.min);
    const value = measure(size.default);
    const max = measure(size.max);
    expect(new Set([min.unit, value.unit, max.unit]).size).toBe(1);
    expect(min.amount).toBeGreaterThan(0);
    expect(min.amount).toBeLessThanOrEqual(value.amount);
    expect(value.amount).toBeLessThanOrEqual(max.amount);
  });

  it.each(panels)('collapses the %s below its minimum', (_, size) => {
    expect(measure(size.collapsed).amount).toBeLessThan(measure(size.min).amount);
  });

  it('sizes the sidebar in pixels and the group-relative panels in percent', () => {
    expect(measure(SHELL_PANEL_SIZES.sidebar.default).unit).toBe('px');
    expect(measure(SHELL_PANEL_SIZES.sidebar.collapsed)).toEqual({ amount: 48, unit: 'px' });
    expect(measure(SHELL_PANEL_SIZES.inspector.default).unit).toBe('%');
    expect(measure(SHELL_PANEL_SIZES.drawer.default).unit).toBe('%');
  });

  it('leaves the canvas room beside the inspector and above the drawer', () => {
    const width = measure(SHELL_PANEL_SIZES.canvas.minWidth);
    const height = measure(SHELL_PANEL_SIZES.canvas.minHeight);
    expect(width.unit).toBe('%');
    expect(height.unit).toBe('%');
    expect(width.amount).toBeGreaterThan(0);
    expect(height.amount).toBeGreaterThan(0);
    expect(width.amount + measure(SHELL_PANEL_SIZES.inspector.max).amount).toBeLessThanOrEqual(100);
    expect(height.amount + measure(SHELL_PANEL_SIZES.drawer.max).amount).toBeLessThanOrEqual(100);
  });
});
