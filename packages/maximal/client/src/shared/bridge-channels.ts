export const BRIDGE_CHANNELS = {
  lifecycleCurrent: 'maximal:lifecycle/current',
  proxyUrl: 'maximal:connection/proxy-url',
  openExternal: 'maximal:native/open-external',
  authStatus: 'maximal:control/auth-status',
  authStart: 'maximal:control/auth-start',
  authCancel: 'maximal:control/auth-cancel',
  authSignOut: 'maximal:control/auth-sign-out',
  accountsList: 'maximal:control/accounts-list',
  accountsSwitch: 'maximal:control/accounts-switch',
  observabilityOverview: 'maximal:control/observability-overview',
  observabilityRequests: 'maximal:control/observability-requests',
  observabilityRequest: 'maximal:control/observability-request',
  lifecycleChanged: 'maximal:lifecycle/changed',
  controlChanged: 'maximal:control/changed',
  menuOpenSettings: 'maximal:menu/open-settings',
  trafficInvalidated: 'maximal:control/traffic-invalidated',
} as const

export const INVOKE_CHANNELS = [
  BRIDGE_CHANNELS.lifecycleCurrent,
  BRIDGE_CHANNELS.proxyUrl,
  BRIDGE_CHANNELS.openExternal,
  BRIDGE_CHANNELS.authStatus,
  BRIDGE_CHANNELS.authStart,
  BRIDGE_CHANNELS.authCancel,
  BRIDGE_CHANNELS.authSignOut,
  BRIDGE_CHANNELS.accountsList,
  BRIDGE_CHANNELS.accountsSwitch,
  BRIDGE_CHANNELS.observabilityOverview,
  BRIDGE_CHANNELS.observabilityRequests,
  BRIDGE_CHANNELS.observabilityRequest,
] as const

export const EVENT_CHANNELS = [
  BRIDGE_CHANNELS.lifecycleChanged,
  BRIDGE_CHANNELS.controlChanged,
  BRIDGE_CHANNELS.menuOpenSettings,
  BRIDGE_CHANNELS.trafficInvalidated,
] as const
