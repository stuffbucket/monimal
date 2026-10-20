export interface StateMachineEdge<State extends string, Event extends string> {
  from: State;
  event: Event;
  to: State;
}

type StateDefinitions<State extends string, Event extends string> = {
  readonly [Name in State]: {
    readonly on?: Partial<Record<Event, State>>;
  };
};

export interface StateMachineDefinition<State extends string, Event extends string> {
  readonly id: string;
  readonly initial: State;
  readonly events: readonly Event[];
  readonly states: StateDefinitions<State, Event>;
}

export interface StateMachine<State extends string, Event extends string> {
  readonly definition: StateMachineDefinition<State, Event>;
  transition: (state: State, event: Event) => State;
  edges: () => StateMachineEdge<State, Event>[];
  toDot: () => string;
}

function quoteDot(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function defineStateMachine<
  const State extends string,
  const Event extends string,
>(
  definition: StateMachineDefinition<State, Event>,
): StateMachine<State, Event> {
  const transition = (state: State, event: Event): State =>
    definition.states[state].on?.[event] ?? state;
  const edges = (): StateMachineEdge<State, Event>[] =>
    (Object.entries(definition.states) as [State, StateDefinitions<State, Event>[State]][])
      .flatMap(([from, state]) =>
        definition.events.flatMap((event) => {
          const to = state.on?.[event];
          return to === undefined ? [] : [{ from, event, to }];
        }));
  const toDot = (): string => {
    const transitions = edges()
      .map(({ from, event, to }) =>
        `  "${quoteDot(from)}" -> "${quoteDot(to)}" [label="${quoteDot(event)}"];`)
      .join('\n');
    return `digraph "${quoteDot(definition.id)}" {\n  rankdir=LR;\n`
      + `  "${quoteDot(definition.initial)}" [shape=doublecircle];\n`
      + `${transitions}\n}\n`;
  };
  return { definition, transition, edges, toDot };
}
