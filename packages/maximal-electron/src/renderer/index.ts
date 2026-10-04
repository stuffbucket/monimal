export { Canvas, type CanvasViewMode } from './components/Canvas.js';
export {
  NavRail,
  type NavRailEntry,
  type NavRailSection,
} from './components/NavRail.js';
export {
  Workbar,
  type WorkbarItem,
} from './components/Workbar.js';
export {
  AppFrame,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  SurfaceTop,
  useTabPanelId,
  useTabTriggerId,
  type AppFrameProps,
} from './components/AppFrame.js';
export {
  Status,
  StatusProvider,
  StatusViewport,
  type StatusProps,
} from './components/Status.js';
export {
  PartitionedSortableList,
  type PartitionedSortableItem,
  type PartitionedSortableListProps,
} from './components/PartitionedSortableList.js';
export {
  ShellLayout,
  type PanelSize,
  type PanelToggleSubscription,
  type ShellPanel,
  type ShellLayoutProps,
} from './components/ShellLayout.js';
export { SHELL_PANEL_SIZES } from './lib/panel-sizes.js';
export {
  getTabPanelId,
  getTabTriggerId,
  TAB_COLORS,
  TabBar,
  type Tab,
  type TabColor,
  type TabGroup,
  type TabStripProps,
  type TabTransferOptions,
} from './components/TabBar.js';
export {
  decodeTabTransfer,
  encodeTabTransfer,
  moveTabBefore,
  TAB_TRANSFER_MIME,
  type TabDetachPosition,
  type TabTransfer,
} from './lib/tab-transfer.js';
export {
  adornmentLabel,
  EMPHASIS_LABELS,
  STATUS_LABELS,
  TAB_EMPHASIS,
  TAB_ICON_NAMES,
  tabSlot,
  type TabAdornment,
  type TabEmphasis,
  type TabIconName,
  type TabSlot,
} from './lib/tab-adornment.js';
export {
  SHELL_ICON_NAMES,
  shellIcon,
  type ShellIconName,
} from './lib/shell-icons.js';
export {
  TerminalTabs,
  type TerminalTabsProps,
} from './components/TerminalTabs.js';
export {
  TerminalLauncher,
  type TerminalDiscovery,
  type TerminalLaunchRequest,
  type TerminalLaunchResult,
  type TerminalLauncherProps,
  type TerminalProfileSummary,
  type TerminalTargetSummary,
} from './components/TerminalLauncher.js';
export { TitleBar } from './components/TitleBar.js';
export { Avatar, Profile } from './components/Profile.js';
export { type Account } from './lib/account.js';
export {
  WindowChrome,
  type WindowChromeProps,
} from './components/WindowChrome.js';
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
  type SpatialCanvasLine,
} from './components/SpatialCanvas.js';
export {
  SpatialCanvasCommentComposer,
  SpatialCanvasCommentThreadCard,
  SpatialCanvasCommentThread,
  SpatialCanvasPanelHeader,
  type SpatialCanvasCommentEntry,
} from './components/SpatialCanvasDiscussion.js';
export { SpatialCanvasSurface } from './components/SpatialCanvasSurface.js';
export {
  SpatialCanvasSearchResult,
  SpatialCanvasSearchResults,
} from './components/SpatialCanvasSearch.js';
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
  type SpatialCanvasHeaderActionKind,
  type SpatialCanvasPage,
  type SpatialCanvasToolKind,
} from './components/SpatialCanvasChrome.js';
export {
  fill,
  SHELL_CONTENT,
  ShellContentContext,
  ShellContentProvider,
  useShellContent,
  type ShellApiKeysContent,
  type ShellChromeContent,
  type ShellContent,
  type ShellModelsContent,
} from './lib/content.js';
export { LOREM_CONTENT } from './lib/content-lorem.js';
export {
  Banner,
  Button,
  Callout,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  EditableLabel,
  EditableHeading,
  EditableListItem,
  EditableMenubarItem,
  EditableTab,
  Field,
  FieldList,
  FormField,
  IconButton,
  InspectorPanel,
  Menu,
  Note,
  NumberInput,
  RadioGroup,
  Row,
  ScrollArea,
  Select,
  Slider,
  StatusChip,
  Switch,
  Tag,
  TextInput,
  Textarea,
  TooltipProvider,
  TypefaceControls,
  Toolbar,
  UnitValueInput,
  UnsavedChangesDialog,
  ViewModeSwitch,
  type ButtonSize,
  type ButtonVariant,
  type EditableLabelProps,
  type EditableLabelState,
  type EditableMoleculeProps,
  type FieldControl,
  type MenuItem,
  type Option,
  type SliderOption,
  type TileProps,
  type MeasurementUnit,
  type TypefaceMetric,
  type TypefaceSelectField,
  type TypefaceWeightField,
  type UnitValueInputProps,
  type ViewMode,
} from './components/controls/index.js';
export {
  type ApiClient,
  type Endpoint,
  type ModelCapabilities,
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
export { CopyButton, copyText } from './components/CopyButton.js';
export { useShellTabs } from './lib/useShellTabs.js';
export {
  useThemePreference,
  type ThemePreference,
} from './lib/useThemePreference.js';
