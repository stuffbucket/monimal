import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { sampleUsage } from '../../lib/sample-settings.js';
import type { UsagePeriod, UsageReport } from '../../lib/settings.js';

import { Usage } from './Usage.js';

/** A fixed clock, so the "when" column reads the same on every render. */
const NOW = 1_700_000_000_000;
const REPORT = sampleUsage(NOW);

const EMPTY: UsageReport = {
  totals: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    requests: 0,
    total: 0,
    nanoCost: 0,
  },
  byProvider: [],
  byModel: [],
  events: [],
};

/** The period switch is real, so the tab is worth driving by hand. */
function UsageStory({ report, nowMs }: { report: UsageReport; nowMs: number }) {
  const [period, setPeriod] = useState<UsagePeriod>('day');
  return (
    <Usage report={report} period={period} onPeriodChange={setPeriod} nowMs={nowMs} />
  );
}

const meta = {
  title: 'Settings/Usage',
  component: UsageStory,
  args: { report: REPORT, nowMs: NOW },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof UsageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {};

/** A period with nothing in it says so, rather than drawing empty bars. */
export const NoTraffic: Story = {
  name: 'No traffic',
  args: { report: EMPTY },
};

/** One provider, so the by-provider breakdown would compare a bar to itself. */
export const SingleProvider: Story = {
  name: 'One provider',
  args: {
    report: {
      ...REPORT,
      byProvider: REPORT.byProvider.slice(0, 1),
    },
  },
};

/** A period that cost nothing states no cost rather than a zero. */
export const NoCost: Story = {
  name: 'No cost recorded',
  args: {
    report: { ...REPORT, totals: { ...REPORT.totals, nanoCost: 0 } },
  },
};
