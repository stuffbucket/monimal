import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'
import { UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi'

import { DoubleControlShortcut } from './double-control-shortcut'

class FakeHook extends EventEmitter {
  start = vi.fn()
  stop = vi.fn()
}

class FailingHook extends FakeHook {
  override start = vi.fn(() => {
    throw new Error('Input monitoring denied')
  })
}

function key(keycode: number): UiohookKeyboardEvent {
  return {
    type: 4,
    time: 0,
    altKey: false,
    ctrlKey: isControl(keycode),
    metaKey: false,
    shiftKey: false,
    keycode,
  }
}

function isControl(keycode: number): boolean {
  return keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight
}

function tap(hook: FakeHook, keycode: number = UiohookKey.Ctrl): void {
  hook.emit('keydown', key(keycode))
  hook.emit('keyup', key(keycode))
}

describe('DoubleControlShortcut', () => {
  it('activates when either Control key is tapped twice in time', () => {
    const hook = new FakeHook()
    const activate = vi.fn()
    let now = 1_000
    const shortcut = new DoubleControlShortcut(hook, activate, () => now)
    shortcut.start()

    tap(hook)
    expect(activate).not.toHaveBeenCalled()
    now += 300
    tap(hook, UiohookKey.CtrlRight)

    expect(activate).toHaveBeenCalledOnce()
    expect(hook.start).toHaveBeenCalledOnce()
  })

  it('accepts taps at the exact boundary and ignores held-key repeats', () => {
    const hook = new FakeHook()
    const activate = vi.fn()
    let now = 1_000
    const shortcut = new DoubleControlShortcut(hook, activate, () => now)
    shortcut.start()

    hook.emit('keydown', key(UiohookKey.Ctrl))
    hook.emit('keydown', key(UiohookKey.Ctrl))
    hook.emit('keyup', key(UiohookKey.Ctrl))
    expect(activate).not.toHaveBeenCalled()

    now += 350
    tap(hook)

    expect(activate).toHaveBeenCalledOnce()
  })

  it('does not activate for slow taps or Control chords', () => {
    const hook = new FakeHook()
    const activate = vi.fn()
    let now = 1_000
    const shortcut = new DoubleControlShortcut(hook, activate, () => now)
    shortcut.start()

    tap(hook)
    now += 351
    tap(hook)
    hook.emit('keydown', key(UiohookKey.Ctrl))
    hook.emit('keydown', key(UiohookKey.C))
    hook.emit('keyup', key(UiohookKey.Ctrl))
    now += 100
    tap(hook)

    expect(activate).not.toHaveBeenCalled()
  })

  it('ignores unrelated key releases and resets completely after a chord', () => {
    const hook = new FakeHook()
    const activate = vi.fn()
    let now = 1_000
    const shortcut = new DoubleControlShortcut(hook, activate, () => now)
    shortcut.start()

    hook.emit('keyup', key(UiohookKey.Ctrl))
    tap(hook)
    expect(activate).not.toHaveBeenCalled()
    now += 100

    hook.emit('keydown', key(UiohookKey.Ctrl))
    hook.emit('keyup', key(UiohookKey.C))
    expect(activate).not.toHaveBeenCalled()
    hook.emit('keydown', key(UiohookKey.C))
    hook.emit('keydown', key(UiohookKey.Ctrl))
    hook.emit('keyup', key(UiohookKey.Ctrl))

    now += 100
    tap(hook)
    expect(activate).not.toHaveBeenCalled()
    now += 100
    tap(hook)

    expect(activate).toHaveBeenCalledOnce()
  })

  it('starts and stops idempotently and can be restarted', () => {
    const hook = new FakeHook()
    const activate = vi.fn()
    const shortcut = new DoubleControlShortcut(hook, activate)

    shortcut.stop()
    expect(hook.stop).not.toHaveBeenCalled()

    shortcut.start()
    shortcut.start()
    expect(hook.start).toHaveBeenCalledOnce()

    tap(hook)
    expect(activate).not.toHaveBeenCalled()
    shortcut.stop()
    shortcut.stop()
    expect(hook.stop).toHaveBeenCalledOnce()

    shortcut.start()
    expect(hook.start).toHaveBeenCalledTimes(2)
    hook.emit('keyup', key(UiohookKey.Ctrl))
    tap(hook)
    expect(activate).not.toHaveBeenCalled()
    tap(hook)
    expect(activate).toHaveBeenCalledOnce()
  })

  it('removes listeners and stops the native hook', () => {
    const hook = new FakeHook()
    const activate = vi.fn()
    const shortcut = new DoubleControlShortcut(hook, activate)
    shortcut.start()

    shortcut.stop()
    expect(hook.listenerCount('keydown')).toBe(0)
    expect(hook.listenerCount('keyup')).toBe(0)
    tap(hook)
    tap(hook)

    expect(activate).not.toHaveBeenCalled()
    expect(hook.stop).toHaveBeenCalledOnce()
  })

  it('removes listeners and reports a native hook startup failure', () => {
    const hook = new FailingHook()
    const shortcut = new DoubleControlShortcut(hook, vi.fn())

    expect(() => shortcut.start()).toThrow('Input monitoring denied')
    expect(hook.listenerCount('keydown')).toBe(0)
    expect(hook.listenerCount('keyup')).toBe(0)
    expect(hook.stop).not.toHaveBeenCalled()
  })
})
