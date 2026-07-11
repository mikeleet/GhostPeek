import type {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
} from '@evenrealities/even_hub_sdk'

type EvenBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>

let evenBridge: EvenBridge | null = null
let sdk: typeof import('@evenrealities/even_hub_sdk') | null = null

async function getSdk() {
  if (sdk) return sdk
  sdk = await import('@evenrealities/even_hub_sdk')
  return sdk
}

export async function initGlasses(): Promise<boolean> {
  try {
    const mod = await getSdk()
    evenBridge = await mod.waitForEvenAppBridge()
    return true
  } catch {
    evenBridge = null
    return false
  }
}

export function isOnGlasses(): boolean {
  return evenBridge !== null
}

export async function renderTerminal(text: string): Promise<void> {
  if (!evenBridge) return

  const mod = await getSdk()
  const mainText = new mod.TextContainerProperty({
    xPosition: 0,
    yPosition: 20,
    width: 576,
    height: 248,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'terminal',
    content: text.slice(0, 1000),
    isEventCapture: 1,
  })

  await evenBridge.createStartUpPageContainer(
    new mod.CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [mainText],
    })
  )
}

export async function updateTerminal(text: string): Promise<void> {
  if (!evenBridge) return

  const mod = await getSdk()
  await evenBridge.textContainerUpgrade(
    new mod.TextContainerUpgrade({
      containerID: 1,
      containerName: 'terminal',
      content: text.slice(0, 2000),
    })
  )
}

export async function renderStatusBar(status: string): Promise<void> {
  if (!evenBridge) return

  const mod = await getSdk()
  // re-render both containers as a page for simplicity
  // In production you'd use rebuildPageContainer, but for quick iteration:
  try {
    const mainText = new mod.TextContainerProperty({
      xPosition: 0,
      yPosition: 20,
      width: 576,
      height: 248,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 4,
      containerID: 1,
      containerName: 'terminal',
      content: '...',
      isEventCapture: 1,
    })

    const statusText = new mod.TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 20,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 2,
      containerID: 2,
      containerName: 'status',
      content: status.slice(0, 64),
      isEventCapture: 0,
    })

    await evenBridge.createStartUpPageContainer(
      new mod.CreateStartUpPageContainer({
        containerTotalNum: 2,
        textObject: [statusText, mainText],
      })
    )
  } catch {
    // ignore rebuild errors during rapid updates
  }
}

export function onG2Event(handler: (type: number, containerID: number) => void): (() => void) | null {
  if (!evenBridge) return null

  try {
    const modLoad = import('@evenrealities/even_hub_sdk')
    modLoad.then((mod) => {
      evenBridge!.onEvenHubEvent((event) => {
        const te = event.textEvent
        if (!te) return
        const eventType: number = te.eventType ?? mod.OsEventTypeList.CLICK_EVENT
        handler(eventType, te.containerID ?? 0)
      })
    })
    return () => {} // cleanup stub
  } catch {
    return null
  }
}
