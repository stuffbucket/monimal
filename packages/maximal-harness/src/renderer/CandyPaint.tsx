import { useEffect, useRef } from 'react';

import {
  MAXIMAL_PAINT_FRAGMENT_SHADER,
  MAXIMAL_PAINT_VERTEX_SHADER,
} from '@maximal/maximal-assets/brand';

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

export function CandyPaint() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
    });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, MAXIMAL_PAINT_VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, MAXIMAL_PAINT_FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    if (!buffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'uRes');
    const time = gl.getUniformLocation(program, 'uTime');
    const startedAt = performance.now();
    let frameId = 0;
    const draw = (now: number) => {
      const density = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(element.clientWidth * density));
      const height = Math.max(1, Math.round(element.clientHeight * density));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
        gl.viewport(0, 0, width, height);
        gl.uniform2f(resolution, width, height);
      }
      gl.uniform1f(time, (now - startedAt) / 1_000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas className="mh-card__paint" aria-hidden="true" ref={canvas} />;
}
