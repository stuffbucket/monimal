import { useEffect, useRef, type ReactElement } from 'react'
import type {
  Application,
  Shader,
  Ticker,
  UniformGroup,
} from 'pixi.js'

import {
  materialPresetIndex,
  solarLightDirection,
  type MaterialPreference,
} from '@maximal/maximal-client/renderer/material-preference'
import { MAXIMAL_PAINT_CANDY } from '@maximal/maximal-assets/brand'

interface CozyBackgroundProps {
  enabled: boolean
  reducedMotion: boolean
  material: MaterialPreference
}

type CozyUniforms = {
  uColor1: { value: Float32Array; type: 'vec3<f32>' }
  uColor2: { value: Float32Array; type: 'vec3<f32>' }
  uColor3: { value: Float32Array; type: 'vec3<f32>' }
  uTime: { value: number; type: 'f32' }
  uViewport: { value: Float32Array; type: 'vec2<f32>' }
  uMaterial: { value: number; type: 'f32' }
  uStrength: { value: number; type: 'f32' }
  uMotion: { value: number; type: 'f32' }
  uLight: { value: Float32Array; type: 'vec2<f32>' }
  uSolarStrength: { value: number; type: 'f32' }
  uSolarMode: { value: number; type: 'f32' }
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
uniform float uMaterial;
uniform float uStrength;
uniform float uMotion;
uniform vec2 uLight;
uniform float uSolarStrength;
uniform float uSolarMode;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 point) {
  return fract(sin(vec2(
    dot(point, vec2(127.1, 311.7)),
    dot(point, vec2(269.5, 183.3))
  )) * 43758.5);
}

float candyFlakes(vec2 point, float scale, float seed) {
  vec2 grid = point * scale + seed;
  vec2 cellId = floor(grid);
  vec2 local = fract(grid);
  float result = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));
      vec2 candidate = cellId + cell;
      vec2 random = hash2(candidate);
      float distanceToFlake = length(local - (cell + random));
      float present = step(0.55, hash(candidate + 7.0));
      float size = 0.18 + 0.22 * hash(candidate + 3.0);
      result += present
        * smoothstep(size, 0.0, distanceToFlake)
        * pow(0.5 + 0.5 * sin(random.x * 6.28 + uTime * 1.6), 8.0);
    }
  }
  return result;
}

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
    sin(uTime * 0.16 * uMotion + phase) * 0.028,
    cos(uTime * 0.11 * uMotion + phase) * 0.014
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
    sin(point.y * 8.0 + uTime * 0.12 * uMotion),
    cos(point.x * 7.0 - uTime * 0.1 * uMotion)
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
    + sin(point.y * 9.0 - uTime * 0.18 * uMotion)
  ) * 0.5 + 0.5;
  float fineWisp = sin(
    point.x * 19.0
    - point.y * 8.0
    + cos(point.x * 7.0 + uTime * 0.14 * uMotion)
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
  ) * uStrength;

  if (uMaterial > 0.5 && uMaterial < 1.5) {
    float grain = hash(floor(point * uViewport / 3.0)) - 0.5;
    float glow = clamp(dot(normalize(point - 0.5), normalize(uLight)), 0.0, 1.0);
    color = mix(uColor1, uColor2, point.x + grain * 0.08);
    color += vec3(glow * 0.16 + grain * 0.035);
    alpha = (0.42 + glow * 0.18) * uStrength;
  } else if (uMaterial > 1.5 && uMaterial < 2.5) {
    float fiber = sin(point.x * 720.0) * sin(point.y * 430.0);
    float grain = hash(floor(point * uViewport / 2.0));
    color = mix(vec3(0.78, 0.72, 0.62), uColor3, 0.28 + grain * 0.1);
    color += fiber * 0.025;
    alpha = (0.5 + grain * 0.08) * uStrength;
  } else if (uMaterial > 2.5 && uMaterial < 3.5) {
    float warp = sin(point.x * 380.0 + sin(point.y * 11.0));
    float weft = sin(point.y * 310.0);
    float weave = warp * weft;
    color = mix(uColor1, uColor2, 0.42 + weave * 0.16);
    alpha = (0.48 + abs(weave) * 0.12) * uStrength;
  } else if (uMaterial > 3.5 && uMaterial < 4.5) {
    float vein = sin(
      point.x * 13.0 + point.y * 8.0
      + sin(point.y * 21.0 + uTime * 0.025 * uMotion) * 1.8
    );
    float fissure = smoothstep(0.7, 0.98, abs(vein));
    color = mix(uColor2, uColor3, 0.25 + fissure * 0.65);
    color = mix(color, vec3(0.92), (1.0 - fissure) * 0.18);
    alpha = (0.48 + fissure * 0.25) * uStrength;
  } else if (uMaterial > 4.5 && uMaterial < 5.5) {
    float wave = sin(point.x * 22.0 + uTime * 0.32 * uMotion);
    wave += sin(point.y * 17.0 - uTime * 0.24 * uMotion);
    float caustic = pow(abs(sin(wave + point.x * point.y * 18.0)), 7.0);
    float light = clamp(dot(normalize(vec2(wave, 1.0)), normalize(uLight)), 0.0, 1.0);
    color = mix(uColor1, uColor2, 0.38 + wave * 0.1);
    color += vec3(caustic * 0.24 + light * 0.08);
    alpha = (0.46 + caustic * 0.28) * uStrength;
  } else if (uMaterial > 5.5 && uMaterial < 6.5) {
    float horizon = floor((point.y + sin(point.x * 4.0) * 0.03) * 5.0) / 5.0;
    float celCloud = step(0.42, max(first, max(second, third)));
    float celShade = step(0.68, max(first, max(second, third)));
    color = mix(uColor1, uColor2, horizon);
    color = mix(color, uColor3, celCloud * 0.72);
    color = mix(color, vec3(0.96), celShade * 0.42);
    alpha = (0.48 + celCloud * 0.28) * uStrength;
  } else if (uMaterial > 6.5 && uMaterial < 7.5) {
    vec2 grid = fract(point * vec2(110.0, 82.0)) - 0.5;
    float tone = 0.18 + broadWisp * 0.25;
    float dot = 1.0 - step(tone, length(grid));
    float panel = step(0.5, fract(point.x * 3.0 + point.y * 2.0));
    color = mix(uColor1, uColor2, panel);
    color = mix(color, uColor3, dot * 0.72);
    alpha = (0.38 + dot * 0.32) * uStrength;
  } else if (uMaterial > 7.5 && uMaterial < 8.5) {
    float stroke = sin(
      point.x * 9.0 + sin(point.y * 14.0 + uTime * 0.05 * uMotion) * 2.2
    );
    float wash = smoothstep(-0.7, 0.8, stroke + broadWisp * 0.55);
    float dryBrush = step(0.64, hash(floor(point * uViewport / 4.0)));
    color = mix(vec3(0.1, 0.11, 0.13), uColor2, wash);
    color = mix(color, uColor3, dryBrush * (1.0 - wash) * 0.34);
    alpha = (0.3 + wash * 0.42 + dryBrush * 0.08) * uStrength;
  } else if (uMaterial > 8.5 && uMaterial < 9.5) {
    vec2 cells = point * vec2(34.0, 22.0);
    vec2 cell = floor(cells);
    vec2 local = fract(cells) - 0.5;
    float seed = hash(cell);
    vec2 drift = vec2(
      sin(uTime * 0.18 * uMotion + seed * 6.28),
      cos(uTime * 0.14 * uMotion + seed * 9.42)
    ) * 0.18;
    float star = pow(max(0.0, 1.0 - length(local + drift) * 4.2), 8.0);
    star *= step(0.86, seed);
    float aura = pow(max(0.0, 1.0 - length(local + drift) * 2.2), 3.0);
    color = mix(uColor1, uColor2, point.y);
    color += uColor3 * star * 1.4 + vec3(aura * 0.18);
    alpha = (0.28 + aura * 0.28 + star * 0.42) * uStrength;
  } else if (uMaterial > 9.5) {
    vec2 candyPoint = vec2(point.x * aspect, point.y);
    float drift = sin(uTime * 0.12 * uMotion) * 0.5;
    float candyLight = pow(
      smoothstep(-0.15, 1.05, point.y + drift * (point.x - 0.5) * 0.12),
      1.5
    );
    vec3 candyBase = vec3(${MAXIMAL_PAINT_CANDY.baseRgb.join(',')});
    float flake =
      candyFlakes(candyPoint, ${String(MAXIMAL_PAINT_CANDY.flakeScales[0])}.0, 0.0) * 0.6
      + candyFlakes(candyPoint, ${String(MAXIMAL_PAINT_CANDY.flakeScales[1])}.0, 17.3) * 0.4;
    color = mix(candyBase * 0.45, candyBase, smoothstep(-1.1, 1.3, point.y));
    color += vec3(1.0, 0.96, 0.92) * flake * (0.3 + candyLight * 0.8);
    color += vec3(1.0, 0.95, 0.9)
      * candyLight
      * ${String(MAXIMAL_PAINT_CANDY.sheen)};
    alpha = (0.58 + candyLight * 0.24) * uStrength;
  }

  vec2 lightDirection = normalize(uLight + vec2(0.0001));
  vec2 centered = point - 0.5;
  float sunward = max(0.0, dot(normalize(centered + vec2(0.0001)), lightDirection));
  float atmospheric = pow(sunward, 2.2) * (0.12 + broadWisp * 0.08);
  vec2 rayDirection = -lightDirection;
  vec2 rayNormal = vec2(-rayDirection.y, rayDirection.x);
  float rayDistance = dot(centered, rayDirection);
  float rayCross = dot(centered, rayNormal);
  float rayBands = pow(
    max(0.0, sin(rayCross * 31.0 + broadWisp * 2.8)),
    7.0
  );
  float brokenClouds = smoothstep(
    0.24,
    0.78,
    broadWisp * 0.55 + fineWisp * 0.32 + hash(floor(point * 11.0)) * 0.2
  );
  float rays = rayBands
    * brokenClouds
    * smoothstep(-0.32, 0.48, rayDistance)
    * (1.0 - smoothstep(0.34, 0.78, length(centered)));
  float solarLight = mix(atmospheric, rays * 0.2, step(0.5, uSolarMode));
  color += vec3(1.0, 0.91, 0.72) * solarLight * uSolarStrength;
  alpha = min(0.92, alpha + solarLight * uSolarStrength * 0.38);

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

const QUALITY = {
  battery: { resolution: 0.5, maximumFps: 8, minimumFps: 2 },
  balanced: { resolution: 0.75, maximumFps: 12, minimumFps: 4 },
  high: { resolution: 1, maximumFps: 20, minimumFps: 6 },
} as const

export function CozyBackground({
  enabled,
  reducedMotion,
  material,
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
        const quality = QUALITY[material.quality]
        await app.init({
          resizeTo: host,
          autoStart: false,
          sharedTicker: false,
          preference: ['webgl'],
          powerPreference: 'low-power',
          antialias: false,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, quality.resolution),
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
        app.ticker.maxFPS = quality.maximumFps
        app.ticker.minFPS = quality.minimumFps

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
          uMaterial: {
            value: materialPresetIndex(material.preset),
            type: 'f32',
          },
          uStrength: { value: material.strength, type: 'f32' },
          uMotion: { value: material.motion, type: 'f32' },
          uLight: {
            value: solarLightDirection(material),
            type: 'vec2<f32>',
          },
          uSolarStrength: {
            value: material.lighting === 'timezone'
              ? material.solarFollowStrength
              : 0,
            type: 'f32',
          },
          uSolarMode: {
            value: material.solarEffect === 'rays' ? 1 : 0,
            type: 'f32',
          },
        })
        shader = Shader.from({
          gl: {
            name: 'maximal-procedural-material',
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
          uniforms.uniforms.uLight = solarLightDirection(material)
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
        const lightTimer = material.lighting === 'timezone'
          ? window.setInterval(redraw, 60_000)
          : null

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
          if (lightTimer !== null) window.clearInterval(lightTimer)
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
  }, [enabled, material, reducedMotion])

  return enabled ? (
    <div
      ref={hostRef}
      className="cozy-background"
      aria-hidden="true"
      data-material={material.preset}
      data-renderer-available="false"
    />
  ) : null
}
