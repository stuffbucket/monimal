export { Workbar } from './components/Workbar.js';
export {
  AppFrame,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  SurfaceTop,
  useTabPanelId,
  useTabTriggerId,
} from './components/AppFrame.js';
export { Status } from './components/Status.js';
export {
  PartitionedSortableList,
  type PartitionedSortableItem,
} from './components/PartitionedSortableList.js';
export { SHELL_PANEL_SIZES } from './lib/panel-sizes.js';
export {
  TAB_COLORS,
  type Tab,
  type TabColor,
  type TabGroup,
  type TabTransferOptions,
} from './components/TabBar.js';
export {
  decodeTabTransfer,
  moveTabBefore,
  TAB_TRANSFER_MIME,
  type TabDetachPosition,
  type TabTransfer,
} from './lib/tab-transfer.js';
export { shellIcon, type ShellIconName } from './lib/shell-icons.js';
export { TerminalTabs } from './components/TerminalTabs.js';
export {
  type TerminalDiscovery,
  type TerminalLaunchRequest,
  type TerminalLaunchResult,
  type TerminalProfileSummary,
} from './components/TerminalLauncher.js';
export { type Account } from './lib/account.js';
export {
  SpatialCanvas,
  SpatialCanvasCommentAnchor,
  SpatialCanvasCommentCursor,
  SpatialCanvasCommentPin,
  SpatialCanvasConnectorLayer,
  SpatialCanvasCursor,
  SpatialCanvasItem,
  SpatialCanvasMarquee,
  SpatialCanvasProjectCard,
  SpatialCanvasScene,
  SpatialCanvasViewport,
  type SpatialCanvasCursorState,
} from './components/spatialcanvas/SpatialCanvas.js';
export {
  SpatialCanvasCommentComposer,
  SpatialCanvasCommentThreadCard,
  SpatialCanvasCommentThread,
  SpatialCanvasPanelHeader,
  type SpatialCanvasCommentEntry,
} from './components/spatialcanvas/SpatialCanvasDiscussion.js';
export { SpatialCanvasSurface } from './components/spatialcanvas/SpatialCanvasSurface.js';
export {
  SpatialCanvasSearchResult,
  SpatialCanvasSearchResults,
} from './components/spatialcanvas/SpatialCanvasSearch.js';
export {
  SpatialCanvasAvatar,
  SpatialCanvasControlGroup,
  SpatialCanvasCorner,
  SpatialCanvasFloatingPanel,
  SpatialCanvasHeaderAction,
  SpatialCanvasPages,
  SpatialCanvasPresence,
  SpatialCanvasSidePanel,
  SpatialCanvasToolButton,
  SpatialCanvasTopBar,
  SpatialCanvasZoomControls,
} from './components/spatialcanvas/SpatialCanvasChrome.js';
export {
  Banner,
  Note,
  StatusChip,
  TooltipProvider,
  TypefaceControls,
  type MeasurementUnit,
  type TypefaceMetric,
} from './components/controls/index.js';
export {
  type ApiClient,
  type ModelCard,
  type SettingsSurface,
} from './lib/settings.js';
export {
  ApiKeysDialog,
  ModelCardGrid,
  SettingsActions,
  SettingsDisclosure,
  SettingsDisclosureList,
  SettingsPage,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from './components/settings/index.js';
export { CopyButton } from './components/CopyButton.js';
