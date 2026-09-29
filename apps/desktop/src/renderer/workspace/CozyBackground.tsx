import { useEffect, useRef, type ReactElement } from 'react'
import type {
  Application,
  Shader,
  Ticker,
  UniformGroup,
} from 'pixi.js'

interface CozyBackgroundProps {
  enabled: boolean
  reducedMotion: boolean
}

type CozyUniforms = {
  uColor1: { value: Float32Array; type: 'vec3<f32>' }
  uColor2: { value: Float32Array; type: 'vec3<f32>' }
  uColor3: { value: Float32Array; type: 'vec3<f32>' }
  uTime: { value: number; type: 'f32' }
  uViewport: { value: Float32Array; type: 'vec2<f32>' }
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aUV;
varying vec2 vUV;

void main(void) {
  vUV = aUV;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
varying vec2 vUV;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uTime;
uniform vec2 uViewport;

float cloudBlob(vec2 point, vec2 center, vec2 radius, float aspect) {
  vec2 offset = (point - center) / radius;
  offset.x *= aspect;
  return smoothstep(1.0, 0.05, dot(offset, offset));
}

float cloudBank(
  vec2 point,
  vec2 center,
  vec2 radius,
  float aspect,
  float phase
) {
  vec2 motion = vec2(
    sin(uTime * 0.16 + phase) * 0.028,
    cos(uTime * 0.11 + phase) * 0.014
  );
  vec2 origin = center + motion;
  float body = cloudBlob(point, origin, radius, aspect);
  float crown = cloudBlob(
    point,
    origin + vec2(radius.x * 0.42, -radius.y * 0.42),
    radius * vec2(0.72, 0.9),
    aspect
  );
  float edge = cloudBlob(
    point,
    origin - vec2(radius.x * 0.55, -radius.y * 0.08),
    radius * vec2(0.68, 0.76),
    aspect
  );
  return max(body, max(crown, edge));
}

void main(void) {
  float aspect = uViewport.x / max(uViewport.y, 1.0);
  vec2 point = vUV;
  point += vec2(
    sin(point.y * 8.0 + uTime * 0.12),
    cos(point.x * 7.0 - uTime * 0.1)
  ) * 0.018;

  float first = cloudBank(
    point,
    vec2(0.1, 0.2),
    vec2(0.34, 0.2),
    aspect,
    0.3
  );
  float second = cloudBank(
    point,
    vec2(0.82, 0.3),
    vec2(0.32, 0.22),
    aspect,
    2.4
  );
  float third = cloudBank(
    point,
    vec2(0.5, 0.8),
    vec2(0.4, 0.23),
    aspect,
    4.7
  );

  float total = first + second + third;
  float broadWisp = sin(
    (point.x * aspect + point.y) * 12.0
    + sin(point.y * 9.0 - uTime * 0.18)
  ) * 0.5 + 0.5;
  float fineWisp = sin(
    point.x * 19.0
    - point.y * 8.0
    + cos(point.x * 7.0 + uTime * 0.14)
  ) * 0.5 + 0.5;
  float cloudDetail = 0.48 + broadWisp * fineWisp * 0.52;
  vec3 color = (
    uColor1 * first
    + uColor2 * second
    + uColor3 * third
  ) / max(total, 0.001);
  color = mix(color, vec3(0.88, 0.9, 0.92), broadWisp * 0.24);
  float alpha = clamp(
    (max(first, max(second, third)) * 0.75 + min(total, 1.0) * 0.14)
    * cloudDetail,
    0.0,
    0.86
  );

  gl_FragColor = vec4(color * alpha, alpha);
}
`

function cloudColorValues(Color: typeof import('pixi.js').Color): Float32Array[] {
  const styles = getComputedStyle(document.documentElement)
  return [1, 2, 3].map((index) =>
    new Color(
      styles.getPropertyValue(`--maximal-cloud-${String(index)}`).trim(),
    ).toRgbArray(new Float32Array(3)),
  )
}

function updateColors(
  uniforms: UniformGroup<CozyUniforms>,
  Color: typeof import('pixi.js').Color,
): void {
  const colors = cloudColorValues(Color)
  uniforms.uniforms.uColor1 = colors[0] ?? new Float32Array([1, 1, 1])
  uniforms.uniforms.uColor2 = colors[1] ?? new Float32Array([1, 1, 1])
  uniforms.uniforms.uColor3 = colors[2] ?? new Float32Array([1, 1, 1])
}

function updateViewport(
  app: Application,
  uniforms: UniformGroup<CozyUniforms>,
): void {
  uniforms.uniforms.uViewport[0] = app.screen.width
  uniforms.uniforms.uViewport[1] = app.screen.height
}

function motionReduced(setting: boolean, media: MediaQueryList): boolean {
  return setting || media.matches
}

export function CozyBackground({
  enabled,
  reducedMotion,
}: CozyBackgroundProps): ReactElement | null {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!enabled || host === null) return

    let disposed = false
    let application: Application | null = null
    let shader: Shader | null = null
    let cleanupApplication: (() => void) | null = null

    void import('pixi.js/unsafe-eval')
      .then(() => import('pixi.js'))
      .then(async ({
        Application,
        Color,
        Mesh,
        MeshGeometry,
        Shader,
        UniformGroup,
      }) => {
        if (disposed) return
        const app = new Application()
        await app.init({
          resizeTo: host,
          autoStart: false,
          sharedTicker: false,
          preference: ['webgl'],
          powerPreference: 'low-power',
          antialias: false,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 0.75),
          backgroundAlpha: 0,
          eventFeatures: {
            click: false,
            globalMove: false,
            move: false,
            wheel: false,
          },
        })
        if (disposed) {
          app.destroy({ releaseGlobalResources: true })
          return
        }
        application = app

        app.canvas.setAttribute('aria-hidden', 'true')
        host.appendChild(app.canvas)
        app.stage.eventMode = 'none'
        app.ticker.maxFPS = 12
        app.ticker.minFPS = 4

        const colors = cloudColorValues(Color)
        const uniforms = new UniformGroup<CozyUniforms>({
          uColor1: {
            value: colors[0] ?? new Float32Array([1, 1, 1]),
            type: 'vec3<f32>',
          },
          uColor2: {
            value: colors[1] ?? new Float32Array([1, 1, 1]),
            type: 'vec3<f32>',
          },
          uColor3: {
            value: colors[2] ?? new Float32Array([1, 1, 1]),
            type: 'vec3<f32>',
          },
          uTime: { value: 0, type: 'f32' },
          uViewport: {
            value: new Float32Array([app.screen.width, app.screen.height]),
            type: 'vec2<f32>',
          },
        })
        shader = Shader.from({
          gl: {
            name: 'cozy-cloud-material',
            vertex: VERTEX_SHADER,
            fragment: FRAGMENT_SHADER,
          },
          resources: { cozyUniforms: uniforms },
        })
        const geometry = new MeshGeometry({
          positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
          uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        })
        geometry.batchMode = 'no-batch'
        app.stage.addChild(new Mesh({ geometry, shader }))

        const update = (ticker: Ticker): void => {
          uniforms.uniforms.uTime += Math.min(ticker.deltaMS, 250) / 1_000
        }
        app.ticker.add(update)

        const media = matchMedia('(prefers-reduced-motion: reduce)')
        const updateMotion = (): void => {
          const shouldAnimate =
            !motionReduced(reducedMotion, media)
            && document.visibilityState === 'visible'
            && document.hasFocus()
          if (shouldAnimate) {
            app.start()
          } else {
            app.stop()
            uniforms.uniforms.uTime = 0
            app.render()
          }
        }
        const redraw = (): void => {
          updateColors(uniforms, Color)
          app.resize()
          updateViewport(app, uniforms)
          app.render()
        }
        const contextLost = (event: Event): void => {
          event.preventDefault()
          app.stop()
          host.dataset.rendererAvailable = 'false'
        }
        const contextRestored = (): void => {
          host.dataset.rendererAvailable = 'true'
          redraw()
          updateMotion()
        }
        const themeObserver = new MutationObserver(redraw)

        app.canvas.addEventListener('webglcontextlost', contextLost)
        app.canvas.addEventListener('webglcontextrestored', contextRestored)
        document.addEventListener('visibilitychange', updateMotion)
        window.addEventListener('blur', updateMotion)
        window.addEventListener('focus', updateMotion)
        window.addEventListener('resize', redraw)
        media.addEventListener('change', updateMotion)
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        })

        cleanupApplication = () => {
          themeObserver.disconnect()
          app.canvas.removeEventListener('webglcontextlost', contextLost)
          app.canvas.removeEventListener('webglcontextrestored', contextRestored)
          document.removeEventListener('visibilitychange', updateMotion)
          window.removeEventListener('blur', updateMotion)
          window.removeEventListener('focus', updateMotion)
          window.removeEventListener('resize', redraw)
          media.removeEventListener('change', updateMotion)
        }

        host.dataset.rendererAvailable = 'true'
        redraw()
        updateMotion()
      })
      .catch((error: unknown) => {
        if (disposed) return
        console.error('[maximal-client] cozy background renderer failed', error)
        host.dataset.rendererAvailable = 'false'
        host.dataset.rendererState = 'failed'
      })

    return () => {
      disposed = true
      cleanupApplication?.()
      shader?.destroy()
      application?.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      )
    }
  }, [enabled, reducedMotion])

  return enabled ? (
    <div
      ref={hostRef}
      className="cozy-background"
      aria-hidden="true"
      data-renderer-available="false"
    />
  ) : null
}
