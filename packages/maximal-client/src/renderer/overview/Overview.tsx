import {
  OverviewInspector,
  OverviewMain,
  OverviewRail,
  OverviewStatus,
} from '@maximal/maximal-observability'

import {
  SurfaceRail,
  SurfaceRight,
  Status,
} from '../frame/AppFrame'

export function Overview() {
  return (
    <>
      <SurfaceRail>{(collapsed) => (collapsed ? null : <OverviewRail />)}</SurfaceRail>
      <SurfaceRight>
        <OverviewInspector />
      </SurfaceRight>
      <Status id="overview" order={100}>
        <OverviewStatus />
      </Status>
      <OverviewMain />
    </>
  )
}
