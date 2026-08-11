import {
  Canvas,
  Card,
  EmptyState,
  Row,
  StatusChip,
  type ViewMode,
} from '@stuffbucket/maximal-electron/renderer';
import { Bot, GitBranch } from 'lucide-react';

import { STATUS_LABELS, type AgentRun } from './runs.js';

/**
 * The fleet canvas.
 *
 * This used to be a copy of `Canvas`: the same empty branch, the same scroll
 * container, the same grid-or-list switch, with different tiles inside. Now it
 * is the tiles, which is all it ever was.
 */

function RunCard({
  run,
  selected,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      modifier="run-card"
      status={run.status}
      selected={selected}
      onSelect={onSelect}
      testId={`run-${run.id}`}
    >
      <span className="run-card__head">
        <StatusChip status={run.status} label={STATUS_LABELS[run.status]} />
        <span className="run-card__elapsed">{run.elapsed}</span>
      </span>
      <span className="card__meta run-card__meta">
        <span className="card__name run-card__task">{run.task}</span>
        <span className="card__sub">
          <GitBranch size={11} /> {run.project} · {run.branch}
        </span>
        <span className="run-card__step">{run.step}</span>
      </span>
      <span className="run-card__foot">
        <span className="mono-chip">
          <Bot size={11} /> {run.model}
        </span>
        <span className="run-card__diff">{run.diff}</span>
      </span>
    </Card>
  );
}

function RunRow({
  run,
  selected,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Row
      modifier="run-row"
      selected={selected}
      onSelect={onSelect}
      testId={`run-${run.id}`}
    >
      <span className="dot" data-status={run.status} />
      <span className="row__name">{run.task}</span>
      <span className="row__sub run-row__project">{run.project}</span>
      <span className="row__sub run-row__model">{run.model}</span>
      <span className="row__sub run-row__tokens">{run.tokens}</span>
      <span className="row__sub run-row__elapsed">{run.elapsed}</span>
    </Row>
  );
}

export function RunCanvas({
  runs,
  mode,
  selectedId,
  onSelect,
}: {
  runs: AgentRun[];
  mode: ViewMode;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <Canvas
      items={runs}
      mode={mode}
      selectedId={selectedId}
      gridModifier="grid--runs"
      empty={<EmptyState icon={Bot} message="No agent runs in this view." />}
      renderCard={(run, selected) => (
        <RunCard run={run} selected={selected} onSelect={() => onSelect(run.id)} />
      )}
      renderRow={(run, selected) => (
        <RunRow run={run} selected={selected} onSelect={() => onSelect(run.id)} />
      )}
    />
  );
}
