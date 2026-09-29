import { useEffect, useRef, type ReactElement } from 'react'
import type {
  Application,
  ColorSource,
  Graphics,
  Ticker,
} from 'pixi.js'

interface CozyBackgroundProps {
  enabled: boolean
  reducedMotion: boolean
}

interface Cloud {
  graphic: Graphics
  x: number
  y: number
  driftX: number
  driftY: number
  phase: number
  speed: number
}

const CLOUD_LAYOUT = [
  { x: 0.14, y: 0.2, driftX: 0.025, driftY: 0.018, phase: 0.4, speed: 0.035 },
  { x: 0.7, y: 0.16, driftX: 0.02, driftY: 0.025, phase: 2.1, speed: 0.028 },
  { x: 0.48, y: 0.58, driftX: 0.035, driftY: 0.018, phase: 4.2, speed: 0.022 },
  { x: 0.84, y: 0.76, driftX: 0.018, driftY: 0.02, phase: 5.4, speed: 0.03 },
] as const

function cloudColors(): ColorSource[] {
  const styles = getComputedStyle(document.documentElement)
  return [1, 2, 3].map((index) =>
    styles.getPropertyValue(`--maximal-cloud-${String(index)}`).trim(),
  )
}

function drawCloud(graphic: Graphics, color: ColorSource): void {
  graphic
    .clear()
    .ellipse(-120, 10, 150, 64)
    .fill({ color, alpha: 0.22 })
    .circle(-48, -24, 76)
    .fill({ color, alpha: 0.2 })
    .circle(54, -12, 92)
    .fill({ color, alpha: 0.18 })
    .circle(132, 18, 58)
    .fill({ color, alpha: 0.16 })
}

function positionClouds(
  clouds: readonly Cloud[],
  width: number,
  height: number,
  elapsed: number,
): void {
  const scale = Math.max(0.75, Math.min(1.5, Math.min(width, height) / 720))
  for (const cloud of clouds) {
    cloud.graphic.scale.set(scale)
    cloud.graphic.position.set(
      width * (cloud.x + Math.sin(elapsed * cloud.speed + cloud.phase) * cloud.driftX),
      height * (cloud.y + Math.cos(elapsed * cloud.speed * 0.8 + cloud.phase) * cloud.driftY),
    )
  }
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
    let cleanupApplication: (() => void) | null = null

    void import('pixi.js/unsafe-eval')
      .then(() => import('pixi.js'))
      .then(async ({ Application, Graphics }) => {
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
          resolution: Math.min(window.devicePixelRatio || 1, 1.25),
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

        const colors = cloudColors()
        const clouds = CLOUD_LAYOUT.map((layout, index): Cloud => {
          const graphic = new Graphics()
          drawCloud(graphic, colors[index % colors.length] ?? '#ffffff')
          app.stage.addChild(graphic)
          return { graphic, ...layout }
        })
        let elapsed = 0

        const update = (ticker: Ticker): void => {
          elapsed += Math.min(ticker.deltaMS, 250) / 1_000
          positionClouds(clouds, app.screen.width, app.screen.height, elapsed)
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
            positionClouds(clouds, app.screen.width, app.screen.height, 0)
            app.render()
          }
        }
        const redraw = (): void => {
          const nextColors = cloudColors()
          clouds.forEach((cloud, index) =>
            drawCloud(cloud.graphic, nextColors[index % nextColors.length] ?? '#ffffff'),
          )
          app.resize()
          positionClouds(clouds, app.screen.width, app.screen.height, elapsed)
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
