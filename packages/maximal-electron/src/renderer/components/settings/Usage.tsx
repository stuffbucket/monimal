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
import { useComponentStyles } from '../../lib/component-styles.js';
import { EmptyState, Tag } from '../controls/Layout.js';

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
              {row.premium === true && <Tag>premium</Tag>}
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

/**
 * The rules the usage report draws itself with.
 *
 * They travel with the component so exporting one ships the other, and every
 * value is a token. `src/renderer/lib/component-styles.ts` says why.
 */
const USAGE_STYLES = `
/*
 * The report's own geometry.
 *
 * A bar's height and a legend swatch are not steps on the spacing ramp — a
 * consumer who changed --shell-space-2 would not mean to resize a chart — so
 * they are this component's tokens rather than the system's. Declared here
 * with values and overridable at the root, which is the third tier of the
 * usual primitive/semantic/component split.
 */
.sb-shell {
  --shell-usage-band-height: 10px;
  --shell-usage-swatch: 8px;
  --shell-usage-bar-min: 2px;
  --shell-usage-counter-rule: 2px;
}
/*
 * Text in a segmented control, rather than the icon it was sized for.
 *
 * 'flex: none' because the header lets its actions shrink, and a switch whose
 * labels are words folded "This month" onto two lines inside a 26px cell.
 */
.sb-shell .segmented--text {
  flex: none;
}

/*
 * Two classes on the block, because 'shell.css' imports this file and its own
 * '.segmented button' rule therefore comes later at equal specificity. The
 * fixed 26px width it sets folded "This month" into a stack of letters.
 */
.sb-shell .segmented.segmented--text button {
  width: auto;
  padding: 0 var(--shell-space-2);
  font-size: var(--shell-text-xs);
  white-space: nowrap;
}

/*
 * One colour per token class, used by the counters, the proportion bar, the
 * breakdown bars and the legend. Set as a custom property so a child reads it
 * without repeating the mapping, exactly as '--shell-status' works.
 */
.sb-shell [data-band='input'] {
  --shell-band: var(--shell-accent);
}
.sb-shell [data-band='output'] {
  --shell-band: var(--shell-text-muted);
}
.sb-shell [data-band='cache'] {
  --shell-band: var(--shell-warning);
}
.sb-shell [data-band='total'] {
  --shell-band: var(--shell-text);
}

.sb-shell .counters {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--shell-space-3);
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.sb-shell .counter {
  display: grid;
  gap: var(--shell-space-1);
  padding: var(--shell-space-3);
  border: 1px solid var(--shell-border);
  border-top: var(--shell-usage-counter-rule) solid var(--shell-band, var(--shell-border-strong));
  border-radius: var(--shell-radius-large);
  background: var(--shell-raised);
}

.sb-shell .counter__value {
  font-size: var(--shell-text-md);
  font-weight: var(--shell-weight-lg);
  color: var(--shell-text);
  font-variant-numeric: tabular-nums;
}

.sb-shell .counter__label {
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
}

.sb-shell .bands {
  display: flex;
  height: var(--shell-usage-band-height);
  width: 100%;
  border-radius: var(--shell-radius-pill);
  overflow: hidden;
  background: var(--shell-active);
}

.sb-shell .bands__band {
  background: var(--shell-band, var(--shell-border-strong));
}

.sb-shell .legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-3);
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
}

.sb-shell .legend li {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
}

.sb-shell .legend li::before {
  content: '';
  width: var(--shell-usage-swatch);
  height: var(--shell-usage-swatch);
  border-radius: var(--shell-radius-pill);
  background: var(--shell-band, var(--shell-border-strong));
}

.sb-shell .breakdown {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--shell-space-2);
}

.sb-shell .breakdown__row {
  display: grid;
  grid-template-columns: minmax(0, 12rem) 1fr auto;
  align-items: center;
  gap: var(--shell-space-3);
}

.sb-shell .breakdown__label {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
  min-width: 0;
  font-size: var(--shell-text-sm);
  color: var(--shell-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The width is the row's share of the widest row, so the bar itself is the
   comparison and the numbers beside it are the detail. */
.sb-shell .breakdown__bar {
  display: block;
  min-width: var(--shell-usage-bar-min);
}

.sb-shell .breakdown__meta {
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
`;

/**
 * The rules the usage tables draw themselves with.
 *
 * A second string rather than more of `USAGE_STYLES`, because a table is a
 * shape a surface other than this one will want and these are the rules it
 * would take.
 */
const USAGE_TABLE_STYLES = `
.sb-shell .table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--shell-text-sm);
}

.sb-shell .table th {
  text-align: left;
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-lg);
  letter-spacing: var(--shell-tracking-caps);
  text-transform: uppercase;
  color: var(--shell-text-subtle);
  padding: var(--shell-space-1) var(--shell-space-2);
  border-bottom: 1px solid var(--shell-border);
  white-space: nowrap;
}

.sb-shell .table td {
  padding: var(--shell-space-1) var(--shell-space-2);
  border-bottom: 1px solid var(--shell-border);
  color: var(--shell-text);
  font-variant-numeric: tabular-nums;
}

/* The first column names the row; the rest are numbers and read right. */
.sb-shell .table td:not(:first-child),
.sb-shell .table th:not(:first-child) {
  text-align: right;
}
`;

/**
 * What has been spent, over a period the caller chooses.
 *
 * Counters, a breakdown by model and by provider, and the recent events.
 * Every number arrives as a prop; this totals and formats, and measures
 * nothing itself.
 */
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
  useComponentStyles('usage', USAGE_STYLES);
  useComponentStyles('usage-table', USAGE_TABLE_STYLES);

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
