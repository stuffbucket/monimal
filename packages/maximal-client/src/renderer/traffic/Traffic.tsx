import {
  TrafficExplorerInspector,
  TrafficExplorerMain,
  TrafficExplorerRail,
  TrafficExplorerStatus,
} from '@maximal/maximal-observability'

import {
  SurfaceRail,
  SurfaceRight,
  Status,
} from '../frame/AppFrame'

export function Traffic() {
  return (
    <>
      <SurfaceRail>
        {(collapsed) => (collapsed ? null : <TrafficExplorerRail />)}
      </SurfaceRail>
      <SurfaceRight>
        <TrafficExplorerInspector />
      </SurfaceRight>
      <Status id="traffic" order={100}>
        <TrafficExplorerStatus />
      </Status>
      <TrafficExplorerMain />
    </>
  )
}
