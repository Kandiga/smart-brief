import type { SmartBriefApi } from '@shared/contracts/ipc'

declare global {
  interface Window {
    smartBrief: SmartBriefApi
  }
}

export {}
