import type {
  ObservabilityRead,
  ObservabilitySource,
} from '@stuffbucket/maximal-observability'

import type {
  ControlResult,
  ObservabilityControlBridge,
} from '../../shared/bridge-types'
import { ControlCallError } from '../shared/control-error'

function readResult<T>(result: ControlResult<T>): ObservabilityRead<T> {
  if (result.ok) return { status: 'ready', data: result.value }
  if (result.error.reason === 'unsupported') {
    return { status: 'unsupported', message: result.error.message }
  }
  throw new ControlCallError(result.error)
}

export function createObservabilitySource(
  bridge: ObservabilityControlBridge = window.maximal.control,
): ObservabilitySource {
  return {
    async readOverview(query) {
      return readResult(await bridge.observabilityOverview(query))
    },
    async readRequests(query) {
      return readResult(await bridge.observabilityRequests(query))
    },
    async readRequestDetail(query) {
      const result = await bridge.observabilityRequest(query)
      if (!result.ok) return readResult(result)
      if (result.value === null) {
        throw new Error('The selected request is no longer available.')
      }
      return { status: 'ready', data: result.value }
    },
    subscribeTrafficInvalidation(listener) {
      return bridge.onTrafficInvalidation(listener)
    },
  }
}
