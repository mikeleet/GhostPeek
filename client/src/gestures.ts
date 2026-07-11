export type Gesture = 'press' | 'double_press' | 'swipe_up' | 'swipe_down'

export interface GestureAction {
  gesture: Gesture
  label: string
}

export function decodeG2Event(eventType: number): Gesture {
  switch (eventType) {
    case 0: // CLICK_EVENT
    case undefined:
      return 'press'
    case 3: // DOUBLE_CLICK_EVENT
      return 'double_press'
    case 1: // SCROLL_TOP_EVENT (swipe up)
      return 'swipe_up'
    case 2: // SCROLL_BOTTOM_EVENT (swipe down)
      return 'swipe_down'
    default:
      return 'press'
  }
}

export class GestureMapper {
  private sliderMode = false
  private sliderValue = 0
  private mode: 'build' | 'plan' = 'build'
  private listeners: Array<(action: string, payload?: unknown) => void> = []

  getSliderValue() {
    return this.sliderValue
  }

  getMode() {
    return this.mode
  }

  isSliderMode() {
    return this.sliderMode
  }

  toggleSliderMode() {
    this.sliderMode = !this.sliderMode
  }

  onChange(listener: (action: string, payload?: unknown) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  handleGesture(gesture: Gesture) {
    switch (gesture) {
      case 'press':
        this.dispatch('enter')
        break
      case 'double_press':
        this.mode = this.mode === 'build' ? 'plan' : 'build'
        this.dispatch('mode_toggle', this.mode)
        break
      case 'swipe_up':
        if (this.sliderMode) {
          this.sliderValue = Math.min(10, this.sliderValue + 1)
          this.dispatch('slider_change', this.sliderValue)
        } else {
          this.dispatch('scroll_up')
        }
        break
      case 'swipe_down':
        if (this.sliderMode) {
          this.sliderValue = Math.max(0, this.sliderValue - 1)
          this.dispatch('slider_change', this.sliderValue)
        } else {
          this.dispatch('scroll_down')
        }
        break
      default:
        break
    }
  }

  private dispatch(action: string, payload?: unknown) {
    this.listeners.forEach((l) => l(action, payload))
  }
}
