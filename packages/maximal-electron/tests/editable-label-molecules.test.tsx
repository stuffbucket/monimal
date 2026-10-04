// @vitest-environment jsdom

import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EditableHeading,
  EditableListItem,
  EditableMenubarItem,
  EditableTab,
} from '../src/renderer/components/controls/EditableLabelMolecules';
import { TabBar, type Tab } from '../src/renderer/components/TabBar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

let container: HTMLDivElement;
let root: Root;

function key(element: Element, value: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
}

function render(element: ReactElement): void {
  act(() => root.render(element));
}

function editor(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('.editable-label__input');
  if (input === null) throw new Error('editor did not render');
  return input;
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
  document.querySelector('[data-sb-shell-portal-root]')?.remove();
});

describe('editable label molecules', () => {
  it('edits a heading through an external editor', () => {
    render(<EditableHeading value="Roadmap" onCommit={vi.fn()} testId="heading" />);
    const heading = container.querySelector('[data-testid="heading"]');
    const label = heading?.querySelector<HTMLElement>('.editable-label');
    if (label === null || label === undefined) throw new Error('heading label did not render');

    act(() => label.click());
    expect(document.querySelector('.editable-label__input')).toBeNull();
    act(() => {
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });

    expect(heading?.querySelector('input')).toBeNull();
    expect(editor().value).toBe('Roadmap');
    expect(editor().selectionStart).toBe(0);
    expect(editor().selectionEnd).toBe('Roadmap'.length);
  });

  it.each([
    {
      name: 'list item',
      host: 'button',
      render: (active: boolean, activate: () => void) => (
        <ol>
          <EditableListItem
            value="First draft"
            active={active}
            onActivate={activate}
            onCommit={vi.fn()}
            testId="owner"
          />
        </ol>
      ),
    },
    {
      name: 'tab',
      host: '[role="tab"]',
      render: (active: boolean, activate: () => void) => (
        <div role="tablist">
          <EditableTab
            value="report.md"
            active={active}
            onActivate={activate}
            onCommit={vi.fn()}
            testId="owner"
          />
        </div>
      ),
    },
    {
      name: 'menubar item',
      host: '[role="menuitem"]',
      render: (active: boolean, activate: () => void) => (
        <div role="menubar">
          <EditableMenubarItem
            value="Workspace"
            active={active}
            onActivate={activate}
            onCommit={vi.fn()}
            testId="owner"
          />
        </div>
      ),
    },
  ])('keeps the $name editor outside its interactive owner', ({ host, render: renderHost }) => {
    function Harness() {
      const [active, setActive] = useState(false);
      return renderHost(active, () => setActive(true));
    }

    render(<Harness />);
    const owner = container.querySelector<HTMLElement>('[data-testid="owner"]');
    if (owner === null) throw new Error('owner did not render');

    act(() => owner.querySelector<HTMLElement>('.editable-label')?.click());
    act(() => key(owner, 'Enter'));

    expect(owner.matches(host)).toBe(true);
    expect(owner.querySelector('input')).toBeNull();
    expect(editor()).not.toBeNull();
  });

  it.each([
    {
      name: 'list item',
      render: (active: boolean, activate: () => void) => (
        <ol>
          <EditableListItem
            value="First draft"
            active={active}
            onActivate={activate}
            onCommit={vi.fn()}
            testId="owner"
          />
        </ol>
      ),
    },
    {
      name: 'tab',
      render: (active: boolean, activate: () => void) => (
        <div role="tablist">
          <EditableTab
            value="report.md"
            active={active}
            onActivate={activate}
            onCommit={vi.fn()}
            testId="owner"
          />
        </div>
      ),
    },
    {
      name: 'menubar item',
      render: (active: boolean, activate: () => void) => (
        <div role="menubar">
          <EditableMenubarItem
            value="Workspace"
            active={active}
            onActivate={activate}
            onCommit={vi.fn()}
            testId="owner"
          />
        </div>
      ),
    },
  ])('requires a double-click to edit the $name', ({ render: renderHost }) => {
    function Harness() {
      const [active, setActive] = useState(false);
      return renderHost(active, () => setActive(true));
    }

    render(<Harness />);
    const owner = container.querySelector<HTMLElement>('[data-testid="owner"]');
    const label = owner?.querySelector<HTMLElement>('.editable-label');
    if (label === null || label === undefined) throw new Error('owner label did not render');

    act(() => label.click());
    act(() => label.click());
    act(() => label.click());
    expect(document.querySelector('.editable-label__input')).toBeNull();

    act(() => {
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    expect(editor()).not.toBeNull();
    expect(document.activeElement).toBe(editor());
  });

  it('cancels from a tab editor without activating the tab twice', () => {
    const onActivate = vi.fn();
    render(
      <div role="tablist">
        <EditableTab
          value="report.md"
          active
          onActivate={onActivate}
          onCommit={vi.fn()}
          testId="tab"
        />
      </div>,
    );
    const tab = container.querySelector('[data-testid="tab"]');
    if (tab === null) throw new Error('tab did not render');

    act(() => key(tab, 'F2'));
    act(() => key(editor(), 'Escape'));

    expect(onActivate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(tab);
    expect(document.querySelector('.editable-label__input')).toBeNull();
  });

  it('activates and edits a shared tab from one double-click', () => {
    const onRename = vi.fn();
    const tabs: Tab[] = [
      { id: 'lorem', title: 'Lorem ipsum dolor sit amet' },
      { id: 'notes', title: 'notes.md' },
    ];

    function Harness() {
      const [active, setActive] = useState('notes');
      return (
        <TabBar
          tabIdBase="editable"
          tabs={tabs}
          active={active}
          onSelect={setActive}
          onRename={onRename}
        />
      );
    }

    render(<Harness />);
    const label = container.querySelector<HTMLElement>(
      '#editable-tab-lorem .editable-label',
    );
    if (label === null) throw new Error('editable tab label did not render');

    act(() => {
      label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('#editable-tab-lorem')?.getAttribute('data-state'))
      .toBe('active');
    expect(editor().value).toBe('Lorem ipsum dolor sit amet');
    expect(editor().selectionStart).toBe(0);
    expect(editor().selectionEnd).toBe('Lorem ipsum dolor sit amet'.length);
  });
});
