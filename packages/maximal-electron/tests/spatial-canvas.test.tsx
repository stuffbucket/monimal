// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SpatialCanvas,
  SpatialCanvasConnectorLayer,
  SpatialCanvasItem,
  SpatialCanvasMarquee,
  SpatialCanvasPages,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasToolButton,
  SpatialCanvasViewport,
  SpatialCanvasZoomControls,
} from '../src/renderer/index.js';
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
              onPageChange={onPageChange}
              onAddPage={onAddPage}
            />
            <SpatialCanvasZoomControls
              zoom={1.25}
              onZoomOut={vi.fn()}
              onReset={vi.fn()}
              onZoomIn={vi.fn()}
            />
            <SpatialCanvasViewport tool="sticky" aria-label="Board">
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
                  onPointerDown={vi.fn()}
                />
                <SpatialCanvasMarquee x={0} y={0} width={20} height={30} />
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
    expect(container.querySelector('.spatial-canvas__project-icon svg')).not.toBeNull();
    expect(container.querySelector('[aria-label="Zoom controls"]')?.textContent)
      .toContain('125%');

    act(() => {
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Add page"]')?.click();
    });
    expect(onPageChange).toHaveBeenCalledWith('planning');
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
});
