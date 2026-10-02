// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SpatialCanvas,
  SpatialCanvasAvatar,
  SpatialCanvasCommentAnchor,
  SpatialCanvasCommentComposer,
  SpatialCanvasCommentCursor,
  SpatialCanvasCommentThread,
  SpatialCanvasCommentThreadCard,
  SpatialCanvasConnectorLayer,
  SpatialCanvasCursor,
  SpatialCanvasItem,
  SpatialCanvasMarquee,
  SpatialCanvasPages,
  SpatialCanvasPresence,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasSearchResult,
  SpatialCanvasSearchResults,
  SpatialCanvasToolButton,
  SpatialCanvasViewport,
  SpatialCanvasZoomControls,
} from '../src/renderer/index.js';
import {
  SPATIAL_CANVAS_CURSORS,
  SPATIAL_CANVAS_STYLES,
} from '../src/renderer/components/SpatialCanvasStyles.js';
import { SpatialCanvasCursorGlyph } from '../src/renderer/components/SpatialCanvasCursorGlyph.js';
import { TooltipProvider } from '../src/renderer/components/controls/Overlays.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe('SpatialCanvas', () => {
  it('keeps the participant caret independent from remote interaction state', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <>
          <SpatialCanvasCursor x={0} y={0} color="blue" state="select" />
          <SpatialCanvasCursor x={20} y={0} color="blue" state="unavailable" />
        </>,
      );
    });

    const select = container.querySelector('[data-state="select"]');
    const unavailable = container.querySelector('[data-state="unavailable"]');
    expect(select?.querySelector('[data-cursor-part="caret"]')).not.toBeNull();
    expect(unavailable?.querySelector('[data-cursor-part="caret"]')).not.toBeNull();
    expect(unavailable?.querySelectorAll('svg')).toHaveLength(1);
    expect(
      unavailable?.querySelector('.spatial-canvas__cursor-unavailable-badge'),
    ).toBeNull();
  });

  it('composes the standalone unavailable glyph from the selection caret', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<SpatialCanvasCursorGlyph state="unavailable" />);
    });

    expect(container.querySelector('[data-cursor-part="caret"]')).not.toBeNull();
    expect(
      container.querySelector('.spatial-canvas__cursor-unavailable-badge'),
    ).not.toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('owns board geometry, control semantics, and shell class names', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onPageChange = vi.fn();
    const onAddPage = vi.fn();
    const onProjectRename = vi.fn();
    const onPageRename = vi.fn();
    const onPageMove = vi.fn();

    act(() => {
      root?.render(
        <TooltipProvider>
          <SpatialCanvas testId="board">
            <SpatialCanvasPages
              projectName="Repository"
              pages={[
                { id: 'projects', name: 'Projects' },
                { id: 'planning', name: 'Planning' },
              ]}
              activePageId="projects"
              panelId="board-panel"
              onPageChange={onPageChange}
              onAddPage={onAddPage}
              onProjectRename={onProjectRename}
              onPageRename={onPageRename}
              onPageMove={onPageMove}
            />
            <SpatialCanvasPresence>
              <SpatialCanvasAvatar
                initials="MA"
                color="purple"
                title="Map agent · agent"
              />
            </SpatialCanvasPresence>
            <SpatialCanvasZoomControls
              zoom={1.25}
              onZoomOut={vi.fn()}
              onReset={vi.fn()}
              onZoomIn={vi.fn()}
            />
            <SpatialCanvasViewport
              id="board-panel"
              tool="sticky"
              role="tabpanel"
              aria-label="Board"
              gridCamera={{ x: 40, y: 60, zoom: 1.25 }}
            >
              <SpatialCanvasScene x={40} y={60} zoom={1.25}>
                <SpatialCanvasConnectorLayer
                  lines={[{ id: 'link', x1: 1, y1: 2, x2: 3, y2: 4 }]}
                />
                <SpatialCanvasProjectCard
                  x={10}
                  y={20}
                  width={280}
                  height={120}
                  selected
                  kind="repository"
                  title="Project"
                  description="/project"
                  meta="repository"
                  onPointerDown={vi.fn()}
                  onDoubleClick={vi.fn()}
                />
                <SpatialCanvasItem
                  kind="sticky"
                  label="Idea"
                  x={320}
                  y={200}
                  width={200}
                  height={160}
                  selected={false}
                  connectionMode
                  onPointerDown={vi.fn()}
                />
                <SpatialCanvasMarquee x={0} y={0} width={20} height={30} />
                <SpatialCanvasCursor
                  x={80}
                  y={90}
                  color="var(--shell-accent)"
                  state="text"
                >
                  Editor
                </SpatialCanvasCursor>
              </SpatialCanvasScene>
              <SpatialCanvasCommentCursor x={80} y={90} color="magenta" />
              <SpatialCanvasCommentAnchor x={120} y={90} color="magenta" />
            </SpatialCanvasViewport>
          </SpatialCanvas>
        </TooltipProvider>,
      );
    });

    expect(container.querySelector('[data-testid="board"]')?.className)
      .toBe('spatial-canvas');
    expect(container.querySelector('[aria-label="Board"]')?.getAttribute('data-tool'))
      .toBe('sticky');
    expect(container.querySelector('.spatial-canvas__grid')?.getAttribute('style'))
      .toContain('background-size:');
    expect(container.querySelector('.spatial-canvas__scene')?.getAttribute('style'))
      .toContain('translate3d(40px, 60px, 0) scale(1.25)');
    expect(container.querySelector('.spatial-canvas__project')?.getAttribute('style'))
      .toContain('width: 280px');
    expect(container.querySelector('.spatial-canvas__item')?.getAttribute('data-kind'))
      .toBe('sticky');
    expect(container.querySelector('.spatial-canvas__connectors line')).not.toBeNull();
    expect(container.querySelectorAll('.spatial-canvas__connectors circle')).toHaveLength(2);
    expect(container.querySelector('.spatial-canvas__cursor')?.getAttribute('data-state'))
      .toBe('text');
    expect(container.querySelector(
      '.spatial-canvas__cursor-glyph [data-cursor-part="caret"]',
    )).not.toBeNull();
    expect(container.querySelector('.spatial-canvas__cursor-label')?.textContent)
      .toBe('Editor');
    expect(container.querySelector('.spatial-canvas__cursor')?.getAttribute('aria-hidden'))
      .toBe('true');
    expect(container.querySelector('.spatial-canvas__comment-cursor')
      ?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.spatial-canvas__comment-cursor')
      ?.getAttribute('data-state')).toBe('tool');
    expect(container.querySelector('.spatial-canvas__comment-anchor')
      ?.getAttribute('data-state')).toBe('anchored');
    expect(container.querySelector('.spatial-canvas__project-icon svg')).not.toBeNull();
    expect(container.querySelector('.spatial-canvas__project-copy')?.children)
      .toHaveLength(3);
    expect(container.querySelector('.spatial-canvas__project > strong')).toBeNull();
    expect(container.querySelector('.spatial-canvas__project > small')).toBeNull();
    expect(container.querySelector('.spatial-canvas__item-label')?.tagName).toBe('SPAN');
    expect(container.querySelectorAll(
      '.spatial-canvas__item .spatial-canvas__connection-handles > span',
    )).toHaveLength(4);
    expect(container.querySelector('[aria-label="Zoom controls"]')?.textContent)
      .toContain('125%');
    expect(container.querySelector('[aria-label="People in this project map"]')
      ?.getAttribute('role')).toBe('group');
    expect(container.querySelector('[aria-label="Map agent · agent"]')).not.toBeNull();
    expect(container.querySelector('.spatial-canvas__project-title')?.textContent)
      .toBe('Repository');
    expect(container.querySelector('[aria-label="2 pages"]')?.textContent).toContain('2');
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Pages: Projects"]')?.click();
    });
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs[0]?.getAttribute('aria-controls')).toBe('board-panel');
    expect(tabs[1]?.tabIndex).toBe(-1);

    act(() => {
      tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }));
      container.querySelector<HTMLButtonElement>('[aria-label="Add page"]')?.click();
    });
    expect(onPageChange).toHaveBeenCalledWith('planning');
    expect(document.activeElement).toBe(tabs[1]);
    expect(onAddPage).toHaveBeenCalledOnce();

    const transfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      value: '',
      setData(_type: string, value: string) {
        this.value = value;
      },
      getData() {
        return this.value;
      },
    };
    act(() => {
      const start = new Event('dragstart', { bubbles: true });
      Object.defineProperty(start, 'dataTransfer', { value: transfer });
      tabs[1]?.dispatchEvent(start);
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfer });
      tabs[0]?.dispatchEvent(drop);
    });
    expect(onPageMove).toHaveBeenCalledWith('planning', 'projects');

    act(() => {
      tabs[1]?.focus();
      tabs[1]?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      tabs[1]?.click();
    });
    const pageName = container.querySelector<HTMLInputElement>(
      '[aria-label="Rename Planning"]',
    );
    expect(pageName).not.toBeNull();
    act(() => {
      if (!pageName) return;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set?.call(pageName, 'Roadmap');
      pageName.dispatchEvent(new Event('input', { bubbles: true }));
      pageName.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }));
    });
    expect(onPageRename).toHaveBeenCalledWith('planning', 'Roadmap');

    const projectTrigger = container.querySelector<HTMLButtonElement>(
      '.spatial-canvas__project-trigger',
    );
    act(() => {
      projectTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
      projectTrigger?.click();
    });
    expect(projectTrigger?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[aria-label="Project name"]')).toBeNull();
    act(() => {
      projectTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
      projectTrigger?.click();
    });
    const projectName = container.querySelector<HTMLInputElement>(
      '[aria-label="Project name"]',
    );
    expect(projectName).not.toBeNull();
    act(() => {
      if (!projectName) return;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set?.call(projectName, 'Repository planning');
      projectName.dispatchEvent(new Event('input', { bubbles: true }));
      projectName.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }));
    });
    expect(onProjectRename).toHaveBeenCalledWith('Repository planning');
  });

  it('changes dot spacing continuously through low zoom levels', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const renderAt = (zoom: number) => {
      act(() => {
        root?.render(
          <SpatialCanvas>
            <SpatialCanvasViewport
              tool="select"
              gridCamera={{ x: 10, y: 20, zoom }}
            />
          </SpatialCanvas>,
        );
      });

      const size = container.querySelector<HTMLElement>(
        '.spatial-canvas__grid',
      )?.style.backgroundSize;
      return Number.parseFloat(size ?? '');
    };

    const below = renderAt(0.129);
    const above = renderAt(0.131);

    expect(below).toBeGreaterThan(12);
    expect(above).toBeLessThan(20);
    expect(above).toBeGreaterThan(below);
    expect(above - below).toBeLessThan(0.1);
  });

  it('focuses before editing the active page and compacts large page counts', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const pages = Array.from({ length: 10 }, (_, index) => ({
      id: `page-${String(index + 1)}`,
      name: `Page ${String(index + 1)}`,
    }));

    act(() => {
      root?.render(
        <TooltipProvider>
          <SpatialCanvasPages
            projectName="Repository"
            pages={pages}
            activePageId="page-1"
            panelId="page-count-panel"
            onPageChange={vi.fn()}
            onAddPage={vi.fn()}
            onPageRename={vi.fn()}
          />
        </TooltipProvider>,
      );
    });

    const count = container.querySelector('[aria-label="10 pages"]');
    const countValue = count?.querySelector('text');
    const pageTrigger = container.querySelector<HTMLButtonElement>(
      '.spatial-canvas__page-trigger',
    );
    expect(countValue?.textContent).toBe('…');

    act(() => {
      pageTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
      pageTrigger?.click();
    });
    expect(pageTrigger?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[aria-label="Rename Page 1"]')).toBeNull();

    act(() => {
      pageTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
      pageTrigger?.click();
    });
    expect(container.querySelector('[aria-label="Rename Page 1"]')).not.toBeNull();
  });

  it('keeps project and page controls separate while opening pages from the title', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onPageChange = vi.fn();
    act(() => {
      root?.render(
        <TooltipProvider>
          <SpatialCanvasPages
            pages={[{ id: 'projects', name: 'Projects' }]}
            activePageId="projects"
            panelId="board-panel"
            onPageChange={onPageChange}
            onAddPage={vi.fn()}
          />
        </TooltipProvider>,
      );
    });
    const title = container.querySelector<HTMLElement>('.spatial-canvas__page-title');
    const project = container.querySelector<HTMLButtonElement>('.spatial-canvas__project-trigger');
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Pages: Projects"]');
    const icon = trigger?.querySelector('svg');
    if (!title || !project || !trigger || !icon) {
      throw new Error('The project and current page controls must render');
    }
    expect(title.closest('button')).toBe(trigger);
    expect(container.querySelectorAll('.spatial-canvas__pages > button')).toHaveLength(2);
    expect(project.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(trigger.type).toBe('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => title.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[aria-label="Map pages"]')).not.toBeNull();
    expect(onPageChange).not.toHaveBeenCalled();
    expect(icon.closest('button')).toBe(trigger);
  });

  it('uses shared iconography for spatial tools', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <TooltipProvider>
          <SpatialCanvasToolButton
            tool="sticky"
            label="Sticky note"
            shortcut="S"
            active
            onClick={vi.fn()}
          />
        </TooltipProvider>,
      );
    });

    expect(container.querySelector('[aria-label="Sticky note (S)"] svg')).not.toBeNull();
    expect(container.textContent).not.toContain('S');
  });

  it('provides adaptive comment composer and thread semantics', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onCancelComment = vi.fn();
    const onSubmitComment = vi.fn();
    const onSubmitReply = vi.fn();

    act(() => {
      root?.render(
        <TooltipProvider>
          <SpatialCanvasCommentComposer
            x={40}
            y={60}
            value="Review this"
            onChange={vi.fn()}
            onInsertEmoji={vi.fn()}
            onInsertMention={vi.fn()}
            onSubmit={onSubmitComment}
            onCancel={onCancelComment}
            color="magenta"
          />
          <SpatialCanvasCommentThread
            initials="MA"
            author="Map agent"
            body="Review this"
            timestamp="Just now"
            resolved={false}
            selected
            onSelect={vi.fn()}
            onToggleResolved={vi.fn()}
            onDelete={vi.fn()}
          />
          <SpatialCanvasCommentThreadCard
            x={360}
            y={60}
            side="right"
            vertical="below"
            comment={{
              id: 'comment-1',
              initials: 'MA',
              author: 'Map agent',
              body: 'Review @Taylor',
              timestamp: 'Just now',
            }}
            replies={[]}
            resolved={false}
            reply=""
            replyInitials="MA"
            onReplyChange={vi.fn()}
            onSubmitReply={onSubmitReply}
            onToggleResolved={vi.fn()}
            onDelete={vi.fn()}
            onClose={vi.fn()}
          />
        </TooltipProvider>,
      );
    });

    expect(container.querySelector('[aria-label="Add a comment"]')
      ?.getAttribute('data-state')).toBe('typing');
    expect(container.querySelector('[aria-label="Add a comment"]')
      ?.getAttribute('style')).toContain('border-color: magenta');
    expect(container.querySelector('[aria-label="Post comment"]')
      ?.getAttribute('style')).toContain('background-color: magenta');
    expect(container.querySelector('[aria-label="Comment tools"]')
      ?.querySelectorAll('button')).toHaveLength(3);
    expect(container.querySelector('[aria-label="Attach image"]')
      ?.hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('.spatial-canvas__comment-thread')
      ?.getAttribute('data-selected')).toBe('true');
    expect(container.querySelector('.spatial-canvas__comment-author')?.textContent)
      .toBe('MA');
    expect(container.querySelector('[aria-label="Comment by Map agent"]'))
      .not.toBeNull();
    expect(container.querySelector('.spatial-canvas__comment-body mark')?.textContent)
      .toBe('@Taylor');
    act(() => {
      container.querySelector('[aria-label="Comment"]')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );
      container.querySelector('[aria-label="Comment"]')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      container.querySelector('[aria-label="Reply to comment"]')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
      );
    });
    expect(onSubmitComment).toHaveBeenCalledOnce();
    expect(onCancelComment).toHaveBeenCalledOnce();
    expect(onSubmitReply).toHaveBeenCalledOnce();
  });

  it('provides compact spatial search result semantics', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onSelect = vi.fn();

    act(() => {
      root?.render(
        <SpatialCanvasSearchResults emptyMessage="No projects match">
          <SpatialCanvasSearchResult
            title="maximal-electron"
            description="/workspace/packages/maximal-electron"
            onSelect={onSelect}
          />
        </SpatialCanvasSearchResults>,
      );
    });

    expect(container.querySelector('[role="list"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    expect(container.querySelector('.spatial-canvas__search-result strong')?.textContent)
      .toBe('maximal-electron');
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '.spatial-canvas__search-result',
      )?.click();
    });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('reads the thin stroke token instead of carrying stroke widths', () => {
    expect(SPATIAL_CANVAS_STYLES).toContain('stroke-width: var(--shell-icon-stroke)');
    expect(SPATIAL_CANVAS_STYLES).not.toMatch(/stroke-width:\s*\d/);
    expect(SPATIAL_CANVAS_STYLES).not.toMatch(/border(?:-\\w+)?:\s*\d+px/);
    expect(SPATIAL_CANVAS_STYLES).toContain('.spatial-canvas-surface');
    expect(SPATIAL_CANVAS_STYLES).toContain('inset: 0');
    expect(SPATIAL_CANVAS_STYLES).toContain(
      '.spatial-canvas__comment-thread-meta strong',
    );
    expect(SPATIAL_CANVAS_STYLES).toContain(
      'font-weight: var(--shell-weight-md)',
    );
  });

  it('antialiases the dot edge using dedicated grid geometry tokens', () => {
    expect(SPATIAL_CANVAS_STYLES).toContain(
      'calc(var(--shell-spatial-grid-radius) - var(--shell-spatial-grid-edge))',
    );
    expect(SPATIAL_CANVAS_STYLES).toContain(
      'calc(var(--shell-spatial-grid-radius) + var(--shell-spatial-grid-edge))',
    );
  });

  it.each([
    { x: 340, y: 100, zoom: 1 },
    { x: -50, y: 75, zoom: 2 },
    { x: 240, y: 140, zoom: 4 },
    { x: 10, y: -20, zoom: 0.1 },
  ])('anchors the grid to camera $x, $y at zoom $zoom', ({ x, y, zoom }) => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <SpatialCanvasViewport tool="hand" camera={{ x, y, zoom }} style={{ color: 'red' }} />,
    ));
    const viewport = container.querySelector<HTMLElement>('.spatial-canvas__viewport');
    const grid = viewport?.querySelector<HTMLElement>('.spatial-canvas__grid');
    const spacing = 16 + 4 * Math.tanh(
      Math.log(Math.max(zoom, Number.EPSILON)) * 0.35,
    );
    const offset = (translation: number) =>
      ((translation % spacing) + spacing) % spacing;
    expect(grid?.style.backgroundPosition).toBe(
      `${offset(x)}px ${offset(y)}px`,
    );
    expect(grid?.style.backgroundSize).toBe(
      `${spacing}px ${spacing}px`,
    );
    expect(grid?.style.backgroundImage).toBe('');
    expect(grid?.getAttribute('aria-hidden')).toBe('true');
    expect(viewport?.style.color).toBe('red');
    expect(viewport?.hasAttribute('camera')).toBe(false);
  });

  it('owns every project browser cursor state, including active panning', () => {
    expect(SPATIAL_CANVAS_CURSORS).toEqual({
      select: 'default',
      pan: 'grab',
      panning: 'grabbing',
      crosshair: 'crosshair',
      text: 'text',
      resizeColumn: 'col-resize',
      resizeRow: 'row-resize',
      resizeNorthwestSoutheast: 'nwse-resize',
      resizeNortheastSouthwest: 'nesw-resize',
      move: 'move',
      unavailable: 'not-allowed',
      action: 'pointer',
    });
    expect(SPATIAL_CANVAS_STYLES).toContain(
      '.spatial-canvas__viewport[data-tool="hand"]:active',
    );
    expect(SPATIAL_CANVAS_STYLES).toContain('cursor: grabbing');
    expect(SPATIAL_CANVAS_STYLES).toContain('cursor: text');
  });
});
