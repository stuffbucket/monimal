import { ChartColumn } from 'lucide-react';

import {
  formatCompact,
  formatCost,
  NO_VALUE,
  relativeTime,
  share,
  USAGE_PERIODS,
  type UsageBreakdown,
  type UsagePeriod,
  type UsageReport,
  type UsageTotals,
} from '../../lib/settings.js';
import { EmptyState } from '../controls/Layout.js';

import { SettingsPage, SettingsSection } from './SettingsPage.js';

/**
 * The usage dashboard.
 *
 * A tab, and the repository owner said so. It earns it on its own terms too:
 * it is the widest surface here, it is read rather than operated, and it is
 * the one a person leaves open while something else runs.
 *
 * What is ported from the parked shell is the reading: four token classes
 * counted separately, a proportion of the period, a breakdown by provider and
 * by model, per-model detail, and a ledger of recent requests. Cost is stated
 * in the same billing units and omitted when a period cost nothing.
 *
 * What is not ported is the time-series chart. It was drawn with visx, which
 * is a dependency this shell does not have, and a chart is not the part a
 * consumer cannot write. Everything it needs is in `UsageReport`.
 */

const BANDS: { id: string; label: string; of: (totals: UsageTotals) => number }[] = [
  { id: 'input', label: 'Input', of: (totals) => totals.input },
  { id: 'output', label: 'Output', of: (totals) => totals.output },
  {
    id: 'cache',
    label: 'Cache',
    of: (totals) => totals.cacheRead + totals.cacheCreation,
  },
];

/** One bar, split by band. Used for the period and for each breakdown row. */
function Bands({ totals }: { totals: UsageTotals }) {
  return (
    <span className="bands">
      {BANDS.map((band) => (
        <span
          key={band.id}
          className="bands__band"
          data-band={band.id}
          style={{ width: `${String(share(band.of(totals), totals.total))}%` }}
        />
      ))}
    </span>
  );
}

function Breakdown({
  title,
  rows,
  testId,
}: {
  title: string;
  rows: UsageBreakdown[];
  testId: string;
}) {
  // A floor of 1, so an empty or all-zero breakdown divides by something.
  const widest = Math.max(1, ...rows.map((row) => row.totals.total));

  return (
    <SettingsSection title={title} testId={testId}>
      <ul className="breakdown">
        {rows.map((row) => (
          <li className="breakdown__row" key={row.id}>
            <span className="breakdown__label">
              {row.label}
              {row.premium === true && <span className="tag">premium</span>}
            </span>
            <span
              className="breakdown__bar"
              style={{ width: `${String(share(row.totals.total, widest))}%` }}
            >
              <Bands totals={row.totals} />
            </span>
            <span className="breakdown__meta">{row.totals.requests} req</span>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

export function Usage({
  report,
  period,
  onPeriodChange,
  nowMs = Date.now(),
}: {
  report: UsageReport;
  period: UsagePeriod;
  onPeriodChange: (period: UsagePeriod) => void;
  /** An argument so a story and a test can pin the "3m ago" column. */
  nowMs?: number;
}) {
  const { totals, byModel, byProvider, events } = report;
  const noun = USAGE_PERIODS.find((entry) => entry.id === period)?.noun ?? '';

  const counters: { label: string; band: string; value: number }[] = [
    { label: 'Input', band: 'input', value: totals.input },
    { label: 'Output', band: 'output', value: totals.output },
    { label: 'Cached input', band: 'cache', value: totals.cacheRead },
    { label: 'Cached output', band: 'cache', value: totals.cacheCreation },
    { label: 'Total', band: 'total', value: totals.total },
  ];

  return (
    <SettingsPage
      testId="settings-usage"
      title="Usage"
      description="Token traffic across the models and providers this shell talks to."
      actions={
        <div className="segmented segmented--text" role="group" aria-label="Period">
          {USAGE_PERIODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === period}
              onClick={() => {
                onPeriodChange(entry.id);
              }}
              data-testid={`usage-period-${entry.id}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      }
    >
      <ul className="counters">
        {counters.map((counter) => (
          <li className="counter" key={counter.label} data-band={counter.band}>
            <span className="counter__value">{formatCompact(counter.value)}</span>
            <span className="counter__label">{counter.label}</span>
          </li>
        ))}
      </ul>

      {totals.total === 0 ? (
        <EmptyState icon={ChartColumn} message={`No traffic ${noun}.`} />
      ) : (
        <>
          <p className="settings__summary" data-testid="usage-summary">
            {noun.charAt(0).toUpperCase() + noun.slice(1)}:{' '}
            <strong>{formatCompact(totals.total)}</strong> tokens across{' '}
            <strong>{totals.requests}</strong> requests to{' '}
            <strong>{byModel.length}</strong> models via{' '}
            <strong>{byProvider.length}</strong> providers
            {totals.nanoCost > 0 && <> · {formatCost(totals.nanoCost)}</>}.
          </p>

          <SettingsSection title="Where it went" testId="usage-proportion">
            <Bands totals={totals} />
            <ul className="legend">
              {BANDS.map((band) => (
                <li key={band.id} data-band={band.id}>
                  {band.label} {formatCompact(band.of(totals))}
                </li>
              ))}
            </ul>
          </SettingsSection>

          {byProvider.length > 1 && (
            <Breakdown title="By provider" rows={byProvider} testId="usage-by-provider" />
          )}

          <Breakdown title="By model" rows={byModel} testId="usage-by-model" />

          <SettingsSection title="Per-model detail" testId="usage-model-table">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Input</th>
                  <th scope="col">Output</th>
                  <th scope="col">Requests</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td>{formatCompact(row.totals.total)}</td>
                    <td>{formatCompact(row.totals.input)}</td>
                    <td>{formatCompact(row.totals.output)}</td>
                    <td>{row.totals.requests}</td>
                    <td>{formatCost(row.totals.nanoCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SettingsSection>

          <SettingsSection title="Recent requests" testId="usage-events">
            {events.length === 0 ? (
              <p className="settings__description">{NO_VALUE}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Provider</th>
                    <th scope="col">Model</th>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Input</th>
                    <th scope="col">Output</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{relativeTime(event.atMs, nowMs)}</td>
                      <td>{event.provider}</td>
                      <td>{event.model}</td>
                      <td>{event.endpoint}</td>
                      <td>{formatCompact(event.input)}</td>
                      <td>{formatCompact(event.output)}</td>
                      <td>{formatCompact(event.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  );
}
