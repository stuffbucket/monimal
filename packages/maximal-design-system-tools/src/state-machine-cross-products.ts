import type {
  AnalysisRisk,
  AnalyzedHandler,
  AnalyzedReactState,
  CrossProductComponent,
} from './react-state-types.ts';

export function crossProductComponents(
  states: readonly AnalyzedReactState[],
  handlers: readonly AnalyzedHandler[],
): CrossProductComponent[] {
  const adjacent = new Map(states.map((state) => [state.name, new Set<string>()]));
  for (const handler of handlers) {
    const touched = new Set([
      ...handler.reads,
      ...handler.writes.map((write) => write.state),
    ]);
    for (const from of touched) {
      for (const to of touched) {
        if (from !== to) adjacent.get(from)?.add(to);
      }
    }
  }
  const byName = new Map(states.map((state) => [state.name, state]));
  const visited = new Set<string>();
  return states.flatMap((state) => {
    if (visited.has(state.name)) return [];
    const component: string[] = [];
    const pending = [state.name];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      pending.push(...(adjacent.get(current) ?? []));
    }
    const openDomains = component.filter((name) => byName.get(name)?.domain === undefined);
    const finiteLowerBound = component.reduce(
      (total, name) => total * (byName.get(name)?.domain?.length ?? 1),
      1,
    );
    return [{
      states: component.sort(),
      ...(openDomains.length === 0 ? { finiteCardinality: finiteLowerBound } : {}),
      finiteLowerBound,
      openDomains: openDomains.sort(),
    }];
  });
}

export function analysisRisks(
  states: readonly AnalyzedReactState[],
  handlers: readonly AnalyzedHandler[],
  directHandlers: readonly AnalyzedHandler[],
): AnalysisRisk[] {
  const risks: AnalysisRisk[] = [];
  const stateNames = new Set(states.map((state) => state.name));
  const add = (risk: AnalysisRisk): void => {
    const key = `${risk.kind}:${risk.handlers.join(',')}:${risk.states.join(',')}`;
    if (!risks.some((current) =>
      `${current.kind}:${current.handlers.join(',')}:${current.states.join(',')}` === key
    )) risks.push(risk);
  };
  for (const external of handlers.filter((handler) =>
    handler.name.startsWith('transport.on'))) {
    const writes = [...new Set(external.writes.map((write) => write.state))];
    if (
      writes.length > 0
      && !external.reads.includes('operation')
      && external.dispatches.length === 0
      && external.ownershipGuards.length === 0
    ) {
      add({
        kind: 'external-event-without-operation-guard',
        handlers: [external.name],
        states: writes,
        detail: `${external.name} updates ${writes.join(', ')} without reading or transitioning operation.`,
      });
    }
  }
  const controlledTransport = /\.(?:hide|abort|ask|steer|approve|terminal)$/u;
  if (stateNames.has('operation')) {
    for (const handler of handlers) {
      const calls = handler.transportCalls.filter((call) => controlledTransport.test(call));
      if (
        calls.length > 0
        && !handler.reads.includes('operation')
        && handler.dispatches.length === 0
        && handler.ownershipGuards.length === 0
      ) {
        add({
          kind: 'operation-blind-transport',
          handlers: [handler.name],
          states: [],
          detail: `${handler.name} invokes ${calls.join(', ')} without consulting operation.`,
        });
      }
    }
  }
  const writers = new Map<string, AnalyzedHandler[]>();
  for (const handler of directHandlers) {
    for (const state of new Set(handler.writes.map((write) => write.state))) {
      const current = writers.get(state) ?? [];
      current.push(handler);
      writers.set(state, current);
    }
  }
  for (const [state, stateWriters] of writers) {
    if (!stateWriters.some((handler) => handler.asynchronous) || stateWriters.length < 2) {
      continue;
    }
    add({
      kind: 'async-write-collision',
      handlers: stateWriters.map((handler) => handler.name).sort(),
      states: [state],
      detail: `${state} has ${String(stateWriters.length)} writers and at least one asynchronous completion path.`,
    });
  }
  const coupled = new Set<string>();
  for (const handler of directHandlers) {
    const written = new Set(handler.writes.map((write) => write.state));
    for (const read of handler.reads) {
      for (const write of written) {
        if (read !== write) {
          const [first, second] = [read, write].sort();
          if (first && second) coupled.add(`${first}\u0000${second}`);
        }
      }
    }
  }
  for (const pair of coupled) {
    const [first, second] = pair.split('\u0000');
    if (!first || !second) continue;
    const firstIndependent = (writers.get(first) ?? []).filter((handler) =>
      !handler.reads.includes(second)
      && !handler.writes.some((write) => write.state === second));
    const secondIndependent = (writers.get(second) ?? []).filter((handler) =>
      !handler.reads.includes(first)
      && !handler.writes.some((write) => write.state === first));
    if (firstIndependent.length > 0 && secondIndependent.length > 0) {
      add({
        kind: 'independently-writable-coupling',
        handlers: [
          firstIndependent[0]?.name ?? '',
          secondIndependent[0]?.name ?? '',
        ].filter(Boolean),
        states: [first, second],
        detail: `${first} and ${second} are consumed together but can be changed independently.`,
      });
    }
  }
  const criticalStates = new Set([
    'operation',
    'approval',
    'approvalResolving',
    'activeChatId',
    'terminalConfirmation',
    'outputExpanded',
    'backgrounded',
  ]);
  const score = (risk: AnalysisRisk): number => {
    const base = {
      'external-event-without-operation-guard': 400,
      'operation-blind-transport': 300,
      'async-write-collision': 200,
      'independently-writable-coupling': 100,
    }[risk.kind];
    return base + risk.states.filter((state) => criticalStates.has(state)).length * 10;
  };
  return risks
    .sort((left, right) => score(right) - score(left) || left.detail.localeCompare(right.detail))
    .slice(0, 40);
}
