// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { CandyPaint } from '../src/renderer/CandyPaint.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('redraws the splash shader with advancing time', () => {
  const drawArrays = vi.fn();
  const uniform1f = vi.fn();
  const gl = Object.assign({} as WebGLRenderingContext, {
    ARRAY_BUFFER: 0x8892,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    VERTEX_SHADER: 0x8b31,
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    drawArrays,
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getProgramParameter: vi.fn(() => true),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    linkProgram: vi.fn(),
    shaderSource: vi.fn(),
    uniform1f,
    uniform2f: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => gl);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(100);

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CandyPaint />));

  expect(frames).toHaveLength(1);
  frames.shift()?.(600);
  frames.shift()?.(1_100);

  expect(drawArrays).toHaveBeenCalledTimes(2);
  expect(uniform1f).toHaveBeenNthCalledWith(1, expect.anything(), 0.5);
  expect(uniform1f).toHaveBeenNthCalledWith(2, expect.anything(), 1);

  act(() => root.unmount());
});
