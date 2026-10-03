import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pixi = vi.hoisted(() => {
  const add = vi.fn()
  const destroy = vi.fn()
  const render = vi.fn()
  const resize = vi.fn()
  const start = vi.fn()
  const stop = vi.fn()
  const tickerAdd = vi.fn()
  const shaderDestroy = vi.fn()
  const shaderFrom = vi.fn<(options: unknown) => { destroy: typeof shaderDestroy }>(
    () => ({ destroy: shaderDestroy }),
  )
  const canvas = document.createElement('canvas')
  const application = {
    canvas,
    destroy,
    init: vi.fn(async () => {}),
    render,
    resize,
    screen: { width: 1200, height: 800 },
    stage: { addChild: add, eventMode: 'auto' },
    start,
    stop,
    ticker: {
      add: tickerAdd,
      maxFPS: 0,
      minFPS: 0,
    },
  }
  class Application {
    constructor() {
      return application
    }
  }
  class Color {
    constructor(private readonly value: string) {}

    toRgbArray(output: Float32Array): Float32Array {
      const hex = this.value.replace('#', '')
      output[0] = Number.parseInt(hex.slice(0, 2), 16) / 255
      output[1] = Number.parseInt(hex.slice(2, 4), 16) / 255
      output[2] = Number.parseInt(hex.slice(4, 6), 16) / 255
      return output
    }
  }
  class Mesh {
    constructor(readonly options: unknown) {}
  }
  class MeshGeometry {
    batchMode = 'auto'

    constructor(readonly options: unknown) {}
  }
  class UniformGroup {
    uniforms: Record<string, unknown>

    constructor(values: Record<string, { value: unknown }>) {
      this.uniforms = Object.fromEntries(
        Object.entries(values).map(([key, uniform]) => [key, uniform.value]),
      )
    }
  }
  return {
    Application,
    Color,
    Mesh,
    MeshGeometry,
    Shader: { from: shaderFrom },
    UniformGroup,
    application,
    destroy,
    render,
    shaderDestroy,
    shaderFrom,
    start,
    stop,
    tickerAdd,
  }
})

vi.mock('pixi.js', () => ({
  Application: pixi.Application,
  Color: pixi.Color,
  Mesh: pixi.Mesh,
  MeshGeometry: pixi.MeshGeometry,
  Shader: pixi.Shader,
  UniformGroup: pixi.UniformGroup,
}))
vi.mock('pixi.js/unsafe-eval', () => ({}))

import { CozyBackground } from './CozyBackground'
import { DEFAULT_MATERIAL_PREFERENCE } from '@maximal/maximal-client/renderer/material-preference'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  pixi.application.init.mockClear()
  pixi.destroy.mockClear()
  pixi.render.mockClear()
  pixi.shaderDestroy.mockClear()
  pixi.shaderFrom.mockClear()
  pixi.start.mockClear()
  pixi.stop.mockClear()
  pixi.tickerAdd.mockClear()
  document.documentElement.style.setProperty('--maximal-cloud-1', '#6f9aa5')
  document.documentElement.style.setProperty('--maximal-cloud-2', '#9a7fa0')
  document.documentElement.style.setProperty('--maximal-cloud-3', '#aa876a')
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CozyBackground', () => {
  it('does not allocate Pixi while the effect is disabled', async () => {
    await act(async () => {
      root.render(
        <CozyBackground
          enabled={false}
          reducedMotion={false}
          material={DEFAULT_MATERIAL_PREFERENCE}
        />,
      )
      await Promise.resolve()
    })

    expect(container.firstChild).toBeNull()
    expect(pixi.application.init).not.toHaveBeenCalled()
  })

  it('renders a static frame and releases GPU resources for reduced motion', async () => {
    await act(async () => {
      root.render(
        <CozyBackground
          enabled
          reducedMotion
          material={DEFAULT_MATERIAL_PREFERENCE}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pixi.application.init).toHaveBeenCalledWith(
      expect.objectContaining({
        autoStart: false,
        powerPreference: 'low-power',
        preference: ['webgl'],
        resolution: 0.75,
      }),
    )
    expect(pixi.shaderFrom).toHaveBeenCalledOnce()
    const shaderOptions = pixi.shaderFrom.mock.calls[0]?.[0] as {
      gl: { name: string }
      resources: { cozyUniforms: unknown }
    }
    expect(shaderOptions.gl.name).toBe('maximal-procedural-material')
    expect(shaderOptions.resources.cozyUniforms).toBeInstanceOf(pixi.UniformGroup)
    expect(pixi.stop).toHaveBeenCalled()
    expect(pixi.start).not.toHaveBeenCalled()
    expect(pixi.render).toHaveBeenCalled()

    act(() => root.unmount())

    expect(pixi.destroy).toHaveBeenCalledWith(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    )
    expect(pixi.shaderDestroy).toHaveBeenCalledOnce()
    root = createRoot(container)
  })

  it('advances only the time uniform while animated', async () => {
    await act(async () => {
      root.render(
        <CozyBackground
          enabled
          reducedMotion={false}
          material={DEFAULT_MATERIAL_PREFERENCE}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pixi.start).toHaveBeenCalled()
    const update = pixi.tickerAdd.mock.calls[0]?.[0] as
      | ((ticker: { deltaMS: number }) => void)
      | undefined
    expect(update).toBeTypeOf('function')
    const shaderOptions = pixi.shaderFrom.mock.calls[0]?.[0] as {
      resources: {
        cozyUniforms: { uniforms: { uTime: number } }
      }
    }
    expect(shaderOptions.resources.cozyUniforms.uniforms.uTime).toBe(0)

    update?.({ deltaMS: 100 })

    expect(shaderOptions.resources.cozyUniforms.uniforms.uTime).toBeCloseTo(0.1)
  })

  it('selects material and battery quality without adding another draw', async () => {
    await act(async () => {
      root.render(
        <CozyBackground
          enabled
          reducedMotion={false}
          material={{
            ...DEFAULT_MATERIAL_PREFERENCE,
            preset: 'water',
            quality: 'battery',
          }}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pixi.application.init).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: 0.5 }),
    )
    expect(pixi.application.ticker.maxFPS).toBe(8)
    expect(pixi.application.stage.addChild).toHaveBeenCalledTimes(1)
    const shaderOptions = pixi.shaderFrom.mock.calls[0]?.[0] as {
      resources: {
        cozyUniforms: {
          uniforms: {
            uMaterial: number
            uStrength: number
            uMotion: number
            uSolarStrength: number
            uSolarMode: number
          }
        }
      }
    }
    expect(shaderOptions.resources.cozyUniforms.uniforms).toMatchObject({
      uMaterial: 5,
      uStrength: 0.75,
      uMotion: 0.5,
      uSolarStrength: 0,
      uSolarMode: 0,
    })
  })

  it('configures broken-cloud rays with the chosen follow strength', async () => {
    await act(async () => {
      root.render(
        <CozyBackground
          enabled
          reducedMotion={false}
          material={{
            ...DEFAULT_MATERIAL_PREFERENCE,
            lighting: 'timezone',
            solarFacingOffset: 40,
            solarFollowStrength: 0.75,
            solarEffect: 'rays',
          }}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const shaderOptions = pixi.shaderFrom.mock.calls[0]?.[0] as {
      gl: { fragment: string }
      resources: {
        cozyUniforms: {
          uniforms: {
            uLight: Float32Array
            uSolarStrength: number
            uSolarMode: number
          }
        }
      }
    }
    expect(shaderOptions.gl.fragment).toContain('brokenClouds')
    expect(shaderOptions.gl.fragment).toContain('rayBands')
    expect(shaderOptions.resources.cozyUniforms.uniforms).toMatchObject({
      uSolarStrength: 0.75,
      uSolarMode: 1,
    })
    expect(
      [...shaderOptions.resources.cozyUniforms.uniforms.uLight]
        .every(Number.isFinite),
    ).toBe(true)
  })

  it('renders the splash-screen candy-paint material', async () => {
    await act(async () => {
      root.render(
        <CozyBackground
          enabled
          reducedMotion={false}
          material={{
            ...DEFAULT_MATERIAL_PREFERENCE,
            preset: 'candy-paint',
          }}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const shaderOptions = pixi.shaderFrom.mock.calls[0]?.[0] as {
      gl: { fragment: string }
      resources: {
        cozyUniforms: {
          uniforms: { uMaterial: number }
        }
      }
    }
    expect(shaderOptions.resources.cozyUniforms.uniforms.uMaterial).toBe(10)
    expect(shaderOptions.gl.fragment).toContain('candyFlakes')
    expect(shaderOptions.gl.fragment).toContain('vec3(0.784,0.2,0.29)')
  })

  it('destroys once when disabled during asynchronous initialization', async () => {
    let finishInitialization: (() => void) | undefined
    pixi.application.init.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInitialization = resolve
        }),
    )

    await act(async () => {
      root.render(
        <CozyBackground
          enabled
          reducedMotion={false}
          material={DEFAULT_MATERIAL_PREFERENCE}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => root.unmount())
    expect(pixi.destroy).not.toHaveBeenCalled()

    await act(async () => {
      finishInitialization?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pixi.destroy).toHaveBeenCalledTimes(1)
    expect(pixi.destroy).toHaveBeenCalledWith({
      releaseGlobalResources: true,
    })
    root = createRoot(container)
  })
})
