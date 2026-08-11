import type { Meta, StoryObj } from '@storybook/react-vite';

import { SAMPLE_MODELS } from '../../lib/sample-settings.js';

import { ModelCards } from './ModelCards.js';

/**
 * The catalogue, hosted in a tab.
 *
 * A fixed clock, so the freshness label is the same every time this renders.
 */
const NOW = 1_700_000_000_000;

const meta = {
  title: 'Settings/ModelCards',
  component: ModelCards,
  args: {
    models: SAMPLE_MODELS,
    loadedAtMs: NOW - 8 * 60 * 1000,
    nowMs: NOW,
    onRefresh: () => undefined,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ModelCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

/** The catalogue has never been pulled, so there is no age to state. */
export const NeverLoaded: Story = {
  name: 'Never loaded',
  args: { loadedAtMs: undefined },
};

export const Refreshing: Story = {
  args: { refreshing: true },
};

export const Empty: Story = {
  args: { models: [] },
};

/** Nothing to refresh with, so no button rather than a dead one. */
export const ReadOnly: Story = {
  name: 'No refresh offered',
  args: { onRefresh: undefined },
};
