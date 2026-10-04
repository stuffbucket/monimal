// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EditableLabel,
  type EditableLabelState,
} from '../src/renderer/components/controls/EditableLabel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

function key(element: Element, value: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
}

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderLabel({
  initialState,
  onActivate = vi.fn(),
  onCommit = vi.fn(),
  focusable = true,
}: {
  initialState: EditableLabelState;
  onActivate?: () => void;
  onCommit?: (value: string) => void;
  focusable?: boolean;
}): void {
  function Harness() {
    const [value, setValue] = useState('report.md');
    const [state, setState] = useState(initialState);
    return (
      <EditableLabel
        value={value}
        state={state}
        onActivate={onActivate}
        onStateChange={setState}
        onCommit={(next) => {
          setValue(next);
          onCommit(next);
        }}
        ariaLabel="Filename"
        focusable={focusable}
        testId="filename"
      />
    );
  }

  act(() => root.render(<Harness />));
}

function label(): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-testid="filename"]');
  if (element === null) throw new Error('label did not render');
  return element;
}

function editor(): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(
    '.editable-label__input[data-testid="filename"]',
  );
  if (element === null) throw new Error('editor did not render');
  return element;
}

beforeEach(() => {
  container = document.createElement('div');
  container.className = 'sb-shell';
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('EditableLabel', () => {
  it('uses single-click for activation and double-click for editing', () => {
    const onActivate = vi.fn();
    renderLabel({ initialState: 'inactive', onActivate });

    act(() => label().click());
    expect(onActivate).toHaveBeenCalledOnce();
    expect(label().dataset.state).toBe('active');
    expect(document.getSelection()?.toString()).toBe('');

    act(() => label().click());
    expect(label().dataset.state).toBe('active');
    expect(document.getSelection()?.toString()).toBe('');
    expect(document.querySelector('.editable-label__input')).toBeNull();

    const displayMouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      label().dispatchEvent(displayMouseDown);
    });
    expect(displayMouseDown.defaultPrevented).toBe(true);

    act(() => {
      label().dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      );
    });
    const input = editor();
    expect(input.dataset.state).toBe('editing');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('report.md'.length);

    const editorMouseDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      input.dispatchEvent(editorMouseDown);
    });
    expect(editorMouseDown.defaultPrevented).toBe(false);
  });

  it('uses Enter to advance through the states and commit editing', () => {
    const onCommit = vi.fn();
    renderLabel({ initialState: 'inactive', onCommit });

    act(() => key(label(), 'Enter'));
    expect(label().dataset.state).toBe('active');
    act(() => key(label(), 'Enter'));

    const input = editor();
    act(() => {
      setValue(input, 'renamed.md ');
    });
    expect(label().textContent).toBe('renamed.md ');
    act(() => {
      key(input, 'Enter');
    });

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('renamed.md ');
    expect(label().dataset.state).toBe('active');
    expect(label().textContent).toBe('renamed.md ');
    expect(document.activeElement).toBe(label());
  });

  it('uses F2 as a direct edit path', () => {
    const onActivate = vi.fn();
    renderLabel({ initialState: 'inactive', onActivate });

    act(() => key(label(), 'F2'));

    expect(onActivate).toHaveBeenCalledOnce();
    expect(label().dataset.state).toBe('editing');
  });

  it('uses Escape to cancel an edit', () => {
    const onCommit = vi.fn();
    renderLabel({ initialState: 'active', onCommit });

    act(() => key(label(), 'F2'));
    const input = editor();
    act(() => {
      setValue(input, 'discarded.md');
      key(input, 'Escape');
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(label().dataset.state).toBe('active');
    expect(label().textContent).toBe('report.md');
  });

  it.each(['Enter', 'blur'])(
    'restores the original value when a whitespace-only edit commits by %s',
    (commitMethod) => {
      const onCommit = vi.fn();
      renderLabel({ initialState: 'active', onCommit });

      act(() => key(label(), 'F2'));
      const input = editor();
      act(() => setValue(input, '   '));
      act(() => {
        if (commitMethod === 'Enter') key(input, 'Enter');
        else input.blur();
      });

      expect(onCommit).toHaveBeenCalledWith('report.md');
      expect(label().textContent).toBe('report.md');
    },
  );

  it('renders a neutral label when its owner supplies interaction semantics', () => {
    renderLabel({ initialState: 'active', focusable: false });

    expect(label().tagName).toBe('SPAN');
    expect(label().getAttribute('role')).toBeNull();
    expect(label().getAttribute('tabindex')).toBeNull();
    expect(label().getAttribute('aria-pressed')).toBeNull();
  });
});
