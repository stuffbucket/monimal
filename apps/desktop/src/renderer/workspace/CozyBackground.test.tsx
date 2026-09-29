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
  class Graphics {
    clear = vi.fn(() => this)
    ellipse = vi.fn(() => this)
    fill = vi.fn(() => this)
    circle = vi.fn(() => this)
    scale = { set: vi.fn() }
    position = { set: vi.fn() }
  }
  return {
    Application,
    Graphics,
    application,
    destroy,
    render,
    start,
    stop,
  }
})

vi.mock('pixi.js', () => ({
  Application: pixi.Application,
  Graphics: pixi.Graphics,
}))
vi.mock('pixi.js/unsafe-eval', () => ({}))

import { CozyBackground } from './CozyBackground'

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
  pixi.start.mockClear()
  pixi.stop.mockClear()
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
      root.render(<CozyBackground enabled={false} reducedMotion={false} />)
      await Promise.resolve()
    })

    expect(container.firstChild).toBeNull()
    expect(pixi.application.init).not.toHaveBeenCalled()
  })

  it('renders a static frame and releases GPU resources for reduced motion', async () => {
    await act(async () => {
      root.render(<CozyBackground enabled reducedMotion />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pixi.application.init).toHaveBeenCalledWith(
      expect.objectContaining({
        autoStart: false,
        powerPreference: 'low-power',
        preference: ['webgl'],
      }),
    )
    expect(pixi.stop).toHaveBeenCalled()
    expect(pixi.start).not.toHaveBeenCalled()
    expect(pixi.render).toHaveBeenCalled()

    act(() => root.unmount())

    expect(pixi.destroy).toHaveBeenCalledWith(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    )
    root = createRoot(container)
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
      root.render(<CozyBackground enabled reducedMotion={false} />)
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
