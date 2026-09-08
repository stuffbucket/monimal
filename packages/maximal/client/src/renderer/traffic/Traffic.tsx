import {
  TrafficExplorerInspector,
  TrafficExplorerMain,
  TrafficExplorerRail,
  TrafficExplorerStatus,
} from '@stuffbucket/maximal-observability'

import {
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
} from '../frame/AppFrame'

export function Traffic() {
  return (
    <>
      <SurfaceRail>{() => <TrafficExplorerRail />}</SurfaceRail>
      <SurfaceRight>
        <TrafficExplorerInspector />
      </SurfaceRight>
      <SurfaceStatus>
        <TrafficExplorerStatus />
      </SurfaceStatus>
      <TrafficExplorerMain />
    </>
  )
}
