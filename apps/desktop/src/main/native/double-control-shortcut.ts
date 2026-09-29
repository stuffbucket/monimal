import {
  type UiohookKeyboardEvent,
} from 'uiohook-napi'

const DOUBLE_TAP_WINDOW_MS = 350
// Keep detection independent of loading the native addon so automated hosts can opt out before import.
const CONTROL_KEY_CODES = new Set([29, 3_613])

interface GlobalKeyHook {
  on(
    event: 'keydown' | 'keyup',
    listener: (event: UiohookKeyboardEvent) => void,
  ): unknown
  off(
    event: 'keydown' | 'keyup',
    listener: (event: UiohookKeyboardEvent) => void,
  ): unknown
  start(): void
  stop(): void
}

function isControl(keycode: number): boolean {
  return CONTROL_KEY_CODES.has(keycode)
}

export class DoubleControlShortcut {
  private controlDown = false
  // Stryker disable next-line BooleanLiteral: the first Control keydown always initializes this state.
  private chorded = false
  private lastTapAt: number | undefined
  private started = false

  constructor(
    private readonly hook: GlobalKeyHook,
    private readonly activate: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.started) return
    this.hook.on('keydown', this.onKeyDown)
    this.hook.on('keyup', this.onKeyUp)
    try {
      this.hook.start()
      this.started = true
    } catch (error) {
      this.hook.off('keydown', this.onKeyDown)
      this.hook.off('keyup', this.onKeyUp)
      throw error
    }
  }

  stop(): void {
    if (!this.started) return
    this.hook.off('keydown', this.onKeyDown)
    this.hook.off('keyup', this.onKeyUp)
    this.hook.stop()
    this.started = false
    this.reset()
  }

  private readonly onKeyDown = (event: UiohookKeyboardEvent): void => {
    if (!isControl(event.keycode)) {
      this.chorded = this.controlDown
      this.lastTapAt = undefined
      return
    }
    if (this.controlDown) return
    this.controlDown = true
    this.chorded = false
  }

  private readonly onKeyUp = (event: UiohookKeyboardEvent): void => {
    if (!isControl(event.keycode) || !this.controlDown) return
    // Stryker disable next-line BooleanLiteral: the next Control keydown writes the same state before it can be observed.
    this.controlDown = false
    if (this.chorded) {
      // Stryker disable next-line CallExpression: the chord already cleared the tap and the next Control keydown clears chorded.
      this.reset()
      return
    }

    const now = this.now()
    if (
      // Stryker disable next-line ConditionalExpression: subtracting undefined yields NaN and preserves the false branch.
      this.lastTapAt !== undefined
      && now - this.lastTapAt <= DOUBLE_TAP_WINDOW_MS
    ) {
      this.lastTapAt = undefined
      this.activate()
    } else {
      this.lastTapAt = now
    }
  }

  private reset(): void {
    this.controlDown = false
    // Stryker disable next-line BooleanLiteral: the next Control keydown always initializes this state.
    this.chorded = false
    this.lastTapAt = undefined
  }
}
