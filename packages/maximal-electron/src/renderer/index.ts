export { Canvas, type CanvasViewMode } from "./components/Canvas.js";
export {
  NavRail,
  type NavRailEntry,
  type NavRailSection,
} from "./components/NavRail.js";
export {
  AppFrame,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
  SurfaceTop,
  useTabPanelId,
  useTabTriggerId,
  type AppFrameProps,
} from "./components/AppFrame.js";
export {
  PartitionedSortableList,
  type PartitionedSortableItem,
  type PartitionedSortableListProps,
} from "./components/PartitionedSortableList.js";
export {
  ShellLayout,
  type PanelSize,
  type PanelToggleSubscription,
  type ShellPanel,
  type ShellLayoutProps,
} from "./components/ShellLayout.js";
export {
  getTabPanelId,
  getTabTriggerId,
  TabBar,
  type Tab,
  type TabStripProps,
  type TabTransferOptions,
} from "./components/TabBar.js";
export {
  decodeTabTransfer,
  encodeTabTransfer,
  moveTabBefore,
  TAB_TRANSFER_MIME,
  type TabDetachPosition,
  type TabTransfer,
} from "./lib/tab-transfer.js";
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
} from "./lib/tab-adornment.js";
export {
  TerminalTabs,
  type TerminalTabsProps,
} from "./components/TerminalTabs.js";
export {
  TerminalLauncher,
  type TerminalDiscovery,
  type TerminalLaunchRequest,
  type TerminalLaunchResult,
  type TerminalLauncherProps,
  type TerminalProfileSummary,
  type TerminalTargetSummary,
} from "./components/TerminalLauncher.js";
export { TitleBar } from "./components/TitleBar.js";
export { Avatar, Profile } from "./components/Profile.js";
export { type Account } from "./lib/account.js";
export {
  WindowChrome,
  type WindowChromeProps,
} from "./components/WindowChrome.js";
export {
  fill,
  SHELL_CONTENT,
  ShellContentContext,
  ShellContentProvider,
  useShellContent,
  type ShellApiKeysContent,
  type ShellAppsContent,
  type ShellChromeContent,
  type ShellContent,
  type ShellDiagnosticsContent,
  type ShellModelsContent,
  type ShellUsageContent,
} from "./lib/content.js";
export { LOREM_CONTENT } from "./lib/content-lorem.js";
export {
  Banner,
  Button,
  Callout,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  FieldList,
  FormField,
  IconButton,
  InspectorPanel,
  Menu,
  Note,
  RadioGroup,
  Row,
  ScrollArea,
  Select,
  StatusChip,
  Switch,
  Tag,
  TextInput,
  Textarea,
  Toolbar,
  UnsavedChangesDialog,
  ViewModeSwitch,
  type ButtonSize,
  type ButtonVariant,
  type FieldControl,
  type MenuItem,
  type Option,
  type TileProps,
  type ViewMode,
} from "./components/controls/index.js";
export {
  type ApiClient,
  type AppIntegration,
  type AppStatus,
  type Diagnostic,
  type DiagnosticGroup,
  type Endpoint,
  type LogLocation,
  type ModelCapabilities,
  type ModelCard,
  type SettingsSurface,
  type UsageBreakdown,
  type UsageEvent,
  type UsagePeriod,
  type UsageReport,
  type UsageTotals,
} from "./lib/settings.js";
export {
  ApiKeysDialog,
  AppTogglesDialog,
  Diagnostics,
  ModelCardGrid,
  ModelCards,
  SettingsDisclosure,
  SettingsDisclosureList,
  SettingsPage,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Usage,
} from "./components/settings/index.js";
export { CopyButton, copyText } from "./components/CopyButton.js";
export { useShellTabs } from "./lib/useShellTabs.js";
export {
  useThemePreference,
  type ThemePreference,
} from "./lib/useThemePreference.js";
