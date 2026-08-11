import {
  Button,
  Field,
  InspectorPanel,
  StatusChip,
} from '@stuffbucket/maximal-electron/renderer';
import { Check, X } from 'lucide-react';

import { RUNS, STATUS_LABELS, type AgentRun } from './runs.js';

/**
 * What the inspector shows when nothing is selected.
 *
 * This used to repeat the four status counts, which the left rail already
 * carries and the status bar summarised again. Three renderings of one fact on
 * one screen, and the only reason this one existed was to stop the panel
 * looking empty.
 *
 * A count is not worth repeating. Which runs are blocked is worth knowing, and
 * it is the one thing on this screen a rail of numbers cannot tell you, so the
 * empty state names them and offers a way in.
 */
function WaitingOnYou({ onSelect }: { onSelect: (id: string) => void }) {
  const blocked = RUNS.filter((run) => run.status === 'blocked');
  if (blocked.length === 0) return undefined;

  return (
    <section className="inspector__section">
      <h3 className="inspector__title">Waiting on you</h3>
      {blocked.map((run) => (
        <button
          key={run.id}
          type="button"
          className="waiting__item"
          onClick={() => onSelect(run.id)}
          data-testid={`waiting-${run.id}`}
        >
          <span className="waiting__title">{run.task}</span>
          <span className="waiting__meta">{run.pendingSummary ?? run.step}</span>
        </button>
      ))}
    </section>
  );
}

/**
 * The demo right panel.
 *
 * Same shape as the production `Inspector`: properties of the selection, and a
 * fallback when there is none. Here the selection is an agent run, so the
 * properties are the ones an operator watches — model, step, tool calls, tokens
 * — and a blocked run offers the approval pair the real gate would show.
 */
export function RunInspector({
  run,
  onSelect,
}: {
  run: AgentRun | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <InspectorPanel title={run ? 'Agent run' : 'Fleet'}>
      {run ? (
          <>
            <section className="inspector__section">
              <StatusChip status={run.status} label={STATUS_LABELS[run.status]} />
              <p className="run-detail__task">{run.task}</p>
              <p className="card__sub card__sub--wrap">{run.step}</p>
            </section>

            {run.status === 'blocked' && (
              <section className="approval" data-testid="approval">
                <h3 className="inspector__title">Waiting on you</h3>
                <p className="approval__summary">
                  <span className="mono-chip">{run.pendingTool ?? 'tool'}</span>
                  {run.pendingSummary ?? run.step}
                </p>
                <div className="approval__actions">
                  <Button variant="primary" size="sm">
                    <Check size={13} /> Allow
                  </Button>
                  <Button size="sm">
                    <X size={13} /> Deny
                  </Button>
                </div>
              </section>
            )}

            <section className="inspector__section">
              <h3 className="inspector__title">Details</h3>
              <Field label="Project" value={run.project} />
              <Field label="Branch" value={run.branch} />
              <Field label="Model" value={run.model} />
              <Field label="Elapsed" value={run.elapsed} />
              <Field label="Tokens" value={run.tokens} />
              <Field label="Diff" value={run.diff} />
            </section>

            <section className="inspector__section">
              <h3 className="inspector__title">Tool calls</h3>
              {run.tools.map((tool) => (
                <div key={tool.name} className="tool-use">
                  <span className="mono-chip">{tool.name}</span>
                  <span className="tool-use__bar">
                    <span
                      className="tool-use__fill"
                      style={{ width: `${String(Math.min(100, tool.calls * 2))}%` }}
                    />
                  </span>
                  <span className="row__sub">{tool.calls}</span>
                </div>
              ))}
            </section>
          </>
        ) : (
          <>
            <p className="card__sub card__sub--wrap">Select a run to inspect it.</p>
            <WaitingOnYou onSelect={onSelect} />
          </>
        )}
    </InspectorPanel>
  );
}
