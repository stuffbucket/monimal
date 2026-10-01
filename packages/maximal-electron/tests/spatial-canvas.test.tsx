// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SpatialCanvas,
  SpatialCanvasAvatar,
  SpatialCanvasCommentComposer,
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
import { SPATIAL_CANVAS_STYLES } from '../src/renderer/components/SpatialCanvasStyles.js';
import { TooltipProvider } from '../src/renderer/components/controls/Overlays.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe('SpatialCanvas', () => {
  it('owns board geometry, control semantics, and shell class names', () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onPageChange = vi.fn();
    const onAddPage = vi.fn();

    act(() => {
      root?.render(
        <TooltipProvider>
          <SpatialCanvas testId="board">
            <SpatialCanvasPages
              pages={[
                { id: 'projects', name: 'Projects' },
                { id: 'planning', name: 'Planning' },
              ]}
              activePageId="projects"
              panelId="board-panel"
              onPageChange={onPageChange}
              onAddPage={onAddPage}
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
                <SpatialCanvasCursor x={40} y={50} color="magenta">
                  Yav
                </SpatialCanvasCursor>
              </SpatialCanvasScene>
            </SpatialCanvasViewport>
          </SpatialCanvas>
        </TooltipProvider>,
      );
    });

    expect(container.querySelector('[data-testid="board"]')?.className)
      .toBe('spatial-canvas');
    expect(container.querySelector('[aria-label="Board"]')?.getAttribute('data-tool'))
      .toBe('sticky');
    expect(container.querySelector('.spatial-canvas__scene')?.getAttribute('style'))
      .toContain('translate3d(40px, 60px, 0) scale(1.25)');
    expect(container.querySelector('.spatial-canvas__project')?.getAttribute('style'))
      .toContain('width: 280px');
    expect(container.querySelector('.spatial-canvas__item')?.getAttribute('data-kind'))
      .toBe('sticky');
    expect(container.querySelector('.spatial-canvas__connectors line')).not.toBeNull();
    expect(container.querySelectorAll('.spatial-canvas__connectors circle')).toHaveLength(2);
    expect(container.querySelector('.spatial-canvas__cursor > svg')).not.toBeNull();
    expect(container.querySelector('.spatial-canvas__cursor-label')?.textContent)
      .toBe('Yav');
    expect(container.querySelector('.spatial-canvas__cursor')?.getAttribute('aria-hidden'))
      .toBe('true');
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
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Pages"]')?.click();
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

  it('provides compact comment composer and thread semantics', () => {
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
            initials="MA"
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

    expect(container.querySelector('[aria-label="Add a comment"]')).not.toBeNull();
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
});
