import type {
  AnalyzedHandler,
  AnalyzedReactState,
  AnalyzedStateWrite,
  PulseEventBinding,
  PulseEventMatrix,
  PulseResponseCell,
  PulseStateTransition,
} from './react-state-types.ts';

const REACT_BROWSER_EVENTS = {
  onAnimationEnd: 'animationend',
  onAnimationIteration: 'animationiteration',
  onAnimationStart: 'animationstart',
  onBeforeInput: 'beforeinput',
  onBlur: 'blur',
  onCancel: 'cancel',
  onChange: 'change',
  onClick: 'click',
  onClose: 'close',
  onCompositionEnd: 'compositionend',
  onCompositionStart: 'compositionstart',
  onCompositionUpdate: 'compositionupdate',
  onContextMenu: 'contextmenu',
  onCopy: 'copy',
  onCut: 'cut',
  onDoubleClick: 'dblclick',
  onDrag: 'drag',
  onDragEnd: 'dragend',
  onDragEnter: 'dragenter',
  onDragExit: 'dragexit',
  onDragLeave: 'dragleave',
  onDragOver: 'dragover',
  onDragStart: 'dragstart',
  onDrop: 'drop',
  onError: 'error',
  onFocus: 'focus',
  onGotPointerCapture: 'gotpointercapture',
  onInput: 'input',
  onInvalid: 'invalid',
  onKeyDown: 'keydown',
  onKeyUp: 'keyup',
  onLoad: 'load',
  onLostPointerCapture: 'lostpointercapture',
  onMouseDown: 'mousedown',
  onMouseEnter: 'mouseenter',
  onMouseLeave: 'mouseleave',
  onMouseMove: 'mousemove',
  onMouseOut: 'mouseout',
  onMouseOver: 'mouseover',
  onMouseUp: 'mouseup',
  onPaste: 'paste',
  onPointerCancel: 'pointercancel',
  onPointerDown: 'pointerdown',
  onPointerEnter: 'pointerenter',
  onPointerLeave: 'pointerleave',
  onPointerMove: 'pointermove',
  onPointerOut: 'pointerout',
  onPointerOver: 'pointerover',
  onPointerUp: 'pointerup',
  onReset: 'reset',
  onScroll: 'scroll',
  onScrollEnd: 'scrollend',
  onSelect: 'select',
  onSubmit: 'submit',
  onToggle: 'toggle',
  onTouchCancel: 'touchcancel',
  onTouchEnd: 'touchend',
  onTouchMove: 'touchmove',
  onTouchStart: 'touchstart',
  onTransitionCancel: 'transitioncancel',
  onTransitionEnd: 'transitionend',
  onTransitionRun: 'transitionrun',
  onTransitionStart: 'transitionstart',
  onWheel: 'wheel',
} as const;

const MAX_CELLS_PER_BINDING = 16;
const MAX_MATRIX_CELLS = 256;

export function browserEventForReactProp(reactProp: string): string | undefined {
  const base = reactProp.endsWith('Capture')
    ? reactProp.slice(0, -'Capture'.length)
    : reactProp;
  return REACT_BROWSER_EVENTS[base as keyof typeof REACT_BROWSER_EVENTS];
}

function vectors(
  dimensions: readonly AnalyzedReactState[],
  limit: number,
): { values: Array<Record<string, string>>; total: number } {
  const total = dimensions.reduce(
    (cardinality, state) => cardinality * (state.domain?.length ?? 1),
    1,
  );
  if (limit === 0) return { values: [], total };
  let values: Array<Record<string, string>> = [{}];
  if (total > limit) {
    const sampled: Array<Record<string, string>> = [];
    const seen = new Set<string>();
    const add = (vector: Record<string, string>): void => {
      const key = JSON.stringify(vector);
      if (sampled.length < limit && !seen.has(key)) {
        seen.add(key);
        sampled.push(vector);
      }
    };
    const base = Object.fromEntries(dimensions.map((state) =>
      [state.name, state.domain?.[0] ?? 'open']));
    add(base);
    const widestDomain = Math.max(
      1,
      ...dimensions.map((state) => state.domain?.length ?? 1),
    );
    for (let index = 1; index < widestDomain; index += 1) {
      add(Object.fromEntries(dimensions.map((state) => {
        const domain = state.domain ?? ['open'];
        return [state.name, domain[index % domain.length] ?? 'open'];
      })));
    }
    for (const state of dimensions) {
      for (const member of state.domain?.slice(1) ?? []) {
        add({ ...base, [state.name]: member });
      }
    }
    for (let left = 0; left < dimensions.length; left += 1) {
      for (let right = left + 1; right < dimensions.length; right += 1) {
        const first = dimensions[left];
        const second = dimensions[right];
        if (!first || !second) continue;
        const firstAlternative = first.domain?.[1];
        const secondAlternative = second.domain?.[1];
        if (firstAlternative !== undefined && secondAlternative !== undefined) {
          add({
            ...base,
            [first.name]: firstAlternative,
            [second.name]: secondAlternative,
          });
        }
      }
    }
    return { values: sampled, total };
  }
  for (const state of dimensions) {
    const domain = state.domain ?? ['open'];
    const expanded: Array<Record<string, string>> = [];
    for (const value of values) {
      for (const member of domain) {
        if (expanded.length === limit) break;
        expanded.push({ ...value, [state.name]: member });
      }
      if (expanded.length === limit) break;
    }
    values = expanded;
  }
  return { values, total };
}

function unquote(value: string): string {
  if (
    value.length >= 2
    && (
      (value.startsWith("'") && value.endsWith("'"))
      || (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('`') && value.endsWith('`'))
    )
  ) return value.slice(1, -1);
  return value;
}

function abstractTarget(
  write: AnalyzedStateWrite,
  state: AnalyzedReactState | undefined,
  from: string,
): Pick<PulseStateTransition, 'to' | 'resolution'> {
  if (write.updater === 'toggle' && ['false', 'true'].includes(from)) {
    return { to: from === 'true' ? 'false' : 'true', resolution: 'toggle' };
  }
  if (state?.domain === undefined) {
    return { to: unquote(write.value), resolution: 'open' };
  }
  const literal = unquote(write.value);
  if (state.domain.includes(literal)) return { to: literal, resolution: 'exact' };
  if (state.domain.includes('absent') && ['null', 'undefined'].includes(literal)) {
    return { to: 'absent', resolution: 'exact' };
  }
  if (state.domain.includes('empty') && state.domain.includes('nonempty')) {
    if (literal === '' || literal === '[]') {
      return { to: 'empty', resolution: 'exact' };
    }
    if (
      write.value.startsWith("'")
      || write.value.startsWith('"')
      || write.value.startsWith('`')
      || write.value.startsWith('[')
    ) return { to: 'nonempty', resolution: 'exact' };
  }
  return { to: '?', resolution: 'derived' };
}

function transitions(
  handler: AnalyzedHandler,
  start: Readonly<Record<string, string>>,
  states: ReadonlyMap<string, AnalyzedReactState>,
): PulseStateTransition[] {
  return handler.writes.map((write) => {
    const from = start[write.state] ?? 'open';
    return {
      state: write.state,
      from,
      ...abstractTarget(write, states.get(write.state), from),
      guards: write.guards ?? [],
      applicability: guardApplicability(write.guards ?? [], start),
    };
  });
}

function literalState(value: string): string {
  const literal = unquote(value.trim());
  if (literal === 'null' || literal === 'undefined') return 'absent';
  if (literal === '') return 'empty';
  return literal;
}

function atomicGuard(
  guard: string,
  start: Readonly<Record<string, string>>,
): boolean | undefined {
  const expression = guard.trim().replace(/^\((.*)\)$/u, '$1').trim();
  const comparison = /^([A-Za-z_$][\w$]*)\s*(===|!==)\s*(.+)$/u.exec(expression);
  if (comparison) {
    const [, state, operator, sourceValue] = comparison;
    const current = state === undefined ? undefined : start[state];
    if (current === undefined || sourceValue === undefined) return undefined;
    const equal = current === literalState(sourceValue);
    return operator === '===' ? equal : !equal;
  }
  const negated = /^!([A-Za-z_$][\w$]*)$/u.exec(expression);
  if (negated?.[1] !== undefined && start[negated[1]] !== undefined) {
    return ['false', 'absent', 'empty'].includes(start[negated[1]] ?? '');
  }
  const direct = /^([A-Za-z_$][\w$]*)$/u.exec(expression);
  if (direct?.[1] !== undefined && start[direct[1]] !== undefined) {
    return !['false', 'absent', 'empty'].includes(start[direct[1]] ?? '');
  }
  return undefined;
}

function guardApplicability(
  guards: readonly string[],
  start: Readonly<Record<string, string>>,
): PulseStateTransition['applicability'] {
  let unknown = false;
  for (const guard of guards) {
    for (const term of guard.split(/\s*&&\s*/u)) {
      const result = atomicGuard(term, start);
      if (result === false) return 'blocked';
      if (result === undefined) unknown = true;
    }
  }
  return unknown ? 'conditional' : 'reachable';
}

export function buildPulseEventMatrix(
  states: readonly AnalyzedReactState[],
  handlers: readonly AnalyzedHandler[],
  bindings: readonly PulseEventBinding[],
): PulseEventMatrix {
  const statesByName = new Map(states.map((state) => [state.name, state]));
  const handlersByName = new Map(handlers.map((handler) => [handler.name, handler]));
  const unresolvedBindings: PulseEventBinding[] = [];
  const opaqueBindings: PulseEventBinding[] = [];
  const cells: PulseResponseCell[] = [];
  let theoreticalCellCount = 0;

  for (const binding of bindings) {
    const handler = handlersByName.get(binding.handler);
    if (handler === undefined) {
      unresolvedBindings.push(binding);
      continue;
    }
    if (
      handler.writes.length === 0
      && handler.dispatches.length === 0
      && handler.transportCalls.length === 0
    ) opaqueBindings.push(binding);
    const relevantNames = new Set([
      ...handler.reads,
      ...handler.writes.map((write) => write.state),
    ]);
    const dimensions = states.filter((state) => relevantNames.has(state.name));
    const remaining = Math.max(0, MAX_MATRIX_CELLS - cells.length);
    const responseVectors = vectors(
      dimensions,
      Math.min(MAX_CELLS_PER_BINDING, remaining),
    );
    theoreticalCellCount += responseVectors.total;
    for (const start of responseVectors.values) {
      cells.push({
        ...binding,
        start,
        transitions: transitions(handler, start, statesByName),
        dispatches: handler.dispatches,
        transportCalls: handler.transportCalls,
        guards: handler.guards,
        asynchronous: handler.asynchronous,
      });
    }
  }

  return {
    bindings: [...bindings],
    cells,
    theoreticalCellCount,
    omittedCellCount: Math.max(0, theoreticalCellCount - cells.length),
    unresolvedBindings,
    opaqueBindings,
  };
}
