import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { ScrollArea } from './ScrollArea.js';

const meta = {
  title: 'Controls/ScrollArea',
  component: ScrollArea,
  decorators: [
    (Story) => (
      <div style={{ colorScheme: 'dark', width: 360 }}>
        <Story />
      </div>
    ),
  ],
  render: (args) => (
    <ScrollArea
      {...args}
      role="region"
      aria-label="Scrollable settings"
      style={{ maxHeight: 'calc(var(--shell-control-lg) * 5)' }}
    >
      <div style={{ minHeight: 'calc(var(--shell-control-lg) * 12)' }}>
        Scroll to inspect the native overlay scrollbar.
      </div>
    </ScrollArea>
  ),
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Native: Story = {
  play: async ({ canvasElement }) => {
    const area = within(canvasElement).getByRole('region', { name: 'Scrollable settings' });
    const style = getComputedStyle(area);
    const thumb = getComputedStyle(area, '::-webkit-scrollbar-thumb');
    const track = getComputedStyle(area, '::-webkit-scrollbar-track');

    await expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);
    await expect(style.colorScheme).toBe('dark');
    await expect(style.scrollbarColor).toBe('auto');
    await expect(thumb.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(track.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  },
};

export const CanvasSurface: Story = {
  args: { surface: 'canvas' },
  play: async ({ canvasElement }) => {
    const area = within(canvasElement).getByRole('region', { name: 'Scrollable settings' });
    const style = getComputedStyle(area);
    const thumb = getComputedStyle(area, '::-webkit-scrollbar-thumb');
    const track = getComputedStyle(area, '::-webkit-scrollbar-track');
    const reference = canvasElement.ownerDocument.createElement('div');
    reference.style.background = 'var(--shell-canvas)';
    canvasElement.append(reference);
    const canvasBackground = getComputedStyle(reference).backgroundColor;
    reference.remove();

    await expect(style.backgroundColor).toBe(canvasBackground);
    await expect(style.scrollbarColor).toBe('auto');
    await expect(thumb.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(track.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  },
};