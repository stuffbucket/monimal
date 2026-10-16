import type {
  AnalyzedStateMachine,
  ReactImplementationAnalysis,
} from './react-state-types.ts';

export function stateMachinesToDot(machines: readonly AnalyzedStateMachine[]): string {
  const quote = (value: string) =>
    value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return machines.map((machine) => {
    const edges = Object.entries(machine.states).flatMap(([from, state]) =>
      Object.entries(state.on).map(([event, to]) =>
        `  "${quote(from)}" -> "${quote(to)}" [label="${quote(event)}"];`))
      .join('\n');
    return `digraph "${quote(machine.id)}" {\n  rankdir=LR;\n`
      + `  "${quote(machine.initial)}" [shape=doublecircle];\n${edges}\n}\n`;
  }).join('\n');
}

function tableValue(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function implementationAnalysisToMarkdown(
  analysis: ReactImplementationAnalysis,
): string {
  const finiteStates = analysis.states.filter((state) => state.domain !== undefined);
  const asynchronous = analysis.handlers.filter((handler) =>
    handler.asynchronous
    && (
      handler.transportCalls.length > 0
      || handler.writes.length > 0
      || handler.dispatches.length > 0
    ));
  const stateRows = analysis.states.map((state) =>
    `| ${tableValue(state.name)} | ${state.hook} | ${state.line.toString()} | `
    + `${tableValue(state.initial)} | ${state.domain?.join(' · ') ?? 'open'} |`);
  const handlerRows = analysis.handlers
    .filter((handler) =>
      handler.writes.length > 0
      || handler.dispatches.length > 0
      || handler.transportCalls.length > 0)
    .map((handler) => {
      const writes = handler.writes.map((write) =>
        `${write.state}=${write.value}`).join('<br>');
      return `| ${tableValue(handler.name)} | ${handler.line.toString()} | `
        + `${tableValue(handler.reads.join(', '))} | ${tableValue(writes)} | `
        + `${tableValue(handler.dispatches.join(', '))} | `
        + `${tableValue(handler.transportCalls.join(', '))} | `
        + `${tableValue(handler.ownershipGuards.join('<br>'))} | `
        + `${handler.asynchronous ? 'yes' : 'no'} |`;
    });
  const asyncRows = asynchronous.map((handler) =>
    `| ${tableValue(handler.name)} | ${handler.line.toString()} | `
    + `${tableValue(handler.transportCalls.join(', '))} | `
    + `${tableValue([...new Set(handler.writes.map((write) => write.state))].join(', '))} | `
    + `${tableValue(handler.guards.join('<br>'))} |`);
  const productRows = analysis.crossProducts.map((product, index) =>
    `| ${(index + 1).toString()} | ${tableValue(product.states.join(', '))} | `
    + `${product.finiteCardinality?.toString() ?? 'open'} | `
    + `${product.finiteLowerBound.toString()} | `
    + `${tableValue(product.openDomains.join(', '))} |`);
  const riskRows = analysis.risks.map((risk, index) =>
    `| ${(index + 1).toString()} | ${risk.kind} | `
    + `${tableValue(risk.handlers.join(', '))} | ${tableValue(risk.states.join(', '))} | `
    + `${tableValue(risk.detail)} |`);
  const eventRows = analysis.eventMatrix.cells.map((cell, index) => {
    const start = Object.entries(cell.start)
      .map(([state, value]) => `${state}=${value}`)
      .join('<br>');
    const transitions = cell.transitions
      .map((transition) =>
        `${transition.state}: ${transition.from} → ${transition.to} `
        + `(${transition.resolution}, ${transition.applicability})${transition.guards.length === 0
          ? ''
          : ` if ${transition.guards.join(' && ')}`}`)
      .join('<br>');
    const effects = [
      ...cell.dispatches.map((event) => `dispatch:${event}`),
      ...cell.transportCalls,
    ].join('<br>');
    return `| ${(index + 1).toString()} | ${tableValue(cell.event)} | `
      + `${tableValue(cell.target)} | ${cell.line.toString()} | `
      + `${tableValue(cell.handler)} | ${tableValue(start || '—')} | `
      + `${tableValue(transitions || '—')} | ${tableValue(effects || '—')} | `
      + `${tableValue(cell.guards.join('<br>') || '—')} | `
      + `${cell.asynchronous ? 'yes' : 'no'} |`;
  });
  const unresolvedRows = analysis.eventMatrix.unresolvedBindings.map((binding) =>
    `| ${tableValue(binding.event)} | ${tableValue(binding.target)} | `
    + `${binding.line.toString()} | ${tableValue(binding.handler)} |`);
  const opaqueRows = analysis.eventMatrix.opaqueBindings.map((binding) =>
    `| ${tableValue(binding.event)} | ${tableValue(binding.target)} | `
    + `${binding.line.toString()} | ${tableValue(binding.handler)} |`);
  return `# React Pulse analysis

- Implementation: \`${analysis.entry}\`
- Explicit machines: ${analysis.machines.length.toString()}
- React state hooks: ${analysis.states.length.toString()}
- Finite state domains: ${finiteStates.length.toString()}
- Derived handlers: ${analysis.handlers.length.toString()}
- Browser event bindings: ${analysis.eventMatrix.bindings.length.toString()}
- Emitted event-response cells: ${analysis.eventMatrix.cells.length.toString()}
- Omitted event-response cells: ${analysis.eventMatrix.omittedCellCount.toString()}
- Unresolved event bindings: ${analysis.eventMatrix.unresolvedBindings.length.toString()}
- Opaque event bindings: ${analysis.eventMatrix.opaqueBindings.length.toString()}
- Asynchronous effect paths: ${asynchronous.length.toString()}
- Coupled cross-product components: ${analysis.crossProducts.length.toString()}
- Conservative risk candidates: ${analysis.risks.length.toString()}
- Ownership-guarded handlers: ${analysis.handlers.filter(
    (handler) => handler.ownershipGuards.length > 0,
  ).length.toString()}

## Interpretation limits

- Explicit reducer transitions are exact for discovered \`defineStateMachine\` declarations.
- React domains are finite abstractions: strings and arrays become empty/nonempty,
  optional values become absent/present, and discriminated unions use their
  literal discriminants.
- Cross-products describe structurally coupled state, not a proof that every
  combination is reachable.
- Event-response rows enumerate at most 16 vectors per binding and 256 vectors
  per implementation. Omitted rows are reported rather than silently dropped.
- Guards are reported as evidence but are not interpreted, so a matrix row is a
  possible stimulus-response path rather than a reachability proof.
- Handler effects include statically resolvable local callback calls. Dynamic
  dispatch, runtime reflection, and behavior inside external packages remain
  outside the report.
- Risk rows are conservative review candidates and require behavioral tests
  before being classified as defects.

## Explicit machines

\`\`\`dot
${stateMachinesToDot(analysis.machines).trimEnd()}
\`\`\`

## React state inventory

| State | Hook | Line | Initial value | Abstract domain |
|---|---|---:|---|---|
${stateRows.join('\n')}

## Event and effect handlers

Effects include transitively called local handlers.

| Handler | Line | State reads | State writes | Reducer events | Transport calls | Ownership guards | Async |
|---|---:|---|---|---|---|---|---|
${handlerRows.join('\n')}

## Browser event-response matrix

Each row applies one discovered browser event to one bounded abstract starting
state vector. Exact and toggle transitions are inferred; derived and open
results remain explicit rather than being guessed.

| # | Event | Target | Line | Handler | Starting state | State response | Other effects | Guards | Async |
|---:|---|---|---:|---|---|---|---|---|---|
${eventRows.join('\n')}

### Unresolved event bindings

These JSX event props could not be connected to a locally analyzed handler.

| Event | Target | Line | Handler expression |
|---|---|---:|---|
${unresolvedRows.join('\n')}

### Opaque event bindings

These resolved handlers have no statically visible state write, reducer event,
or transport call. DOM APIs and effects hidden behind external packages may
still respond at runtime, so these bindings are browser-probe candidates.

| Event | Target | Line | Handler |
|---|---|---:|---|
${opaqueRows.join('\n')}

## Asynchronous transport paths

| Handler | Line | Transport calls | Completion writes | State guards |
|---|---:|---|---|---|
${asyncRows.join('\n')}

## Coupled cross-products

Exact cardinality is reported only when every state in a connected component
has a finite inferred domain. The finite lower bound multiplies known abstract
domains while assigning one representative to each open domain.

| # | Coupled states | Exact cardinality | Finite lower bound | Open domains |
|---:|---|---:|---:|---|
${productRows.join('\n')}

## Conservative cross-product risks

These are mechanically derived candidates, not proofs of UX defects. They
identify external events without operation guards, control transports invoked
without consulting the operation machine, asynchronous writers that can
complete out of order, and coupled state that can change independently.

| # | Kind | Handlers | States | Evidence |
|---:|---|---|---|---|
${riskRows.join('\n')}
`;
}
