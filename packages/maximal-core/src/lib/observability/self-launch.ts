import { TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT } from "~/lib/observability/process-protocol"
import {
  isRuntimeExecPath,
  resolveMainScript,
} from "~/lib/platform/self-invocation"

export interface TrafficChildInvocation {
  readonly command: string
  readonly args: ReadonlyArray<string>
}

export function trafficChildInvocation(
  execPath: string = process.execPath,
  mainScript: string | undefined = resolveMainScript(),
): TrafficChildInvocation {
  const args =
    isRuntimeExecPath(execPath) && mainScript ?
      [mainScript, TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT]
    : [TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT]
  return { command: execPath, args }
}
