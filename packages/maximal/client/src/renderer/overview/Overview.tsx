import {
  OverviewInspector,
  OverviewMain,
  OverviewRail,
  OverviewStatus,
} from '@stuffbucket/maximal-observability'

import {
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
} from '../frame/AppFrame'

export function Overview() {
  return (
    <>
      <SurfaceRail>{(collapsed) => (collapsed ? null : <OverviewRail />)}</SurfaceRail>
      <SurfaceRight>
        <OverviewInspector />
      </SurfaceRight>
      <SurfaceStatus>
        <OverviewStatus />
      </SurfaceStatus>
      <OverviewMain />
    </>
  )
}
