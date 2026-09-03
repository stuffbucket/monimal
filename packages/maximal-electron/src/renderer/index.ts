export { Canvas, type CanvasViewMode } from './components/Canvas.js';
export {
  NavRail,
  type NavRailEntry,
  type NavRailSection,
} from './components/NavRail.js';
export {
  ShellLayout,
  type PanelSize,
  type PanelToggleSubscription,
  type ShellPanel,
} from './components/ShellLayout.js';
export {
  getTabPanelId,
  getTabTriggerId,
  TabBar,
  type Tab,
  type TabStripProps,
} from './components/TabBar.js';
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
  TerminalTabs,
  type TerminalTabsProps,
} from './components/TerminalTabs.js';
export {
  TerminalView,
  type TerminalHost,
  type TerminalViewProps,
} from './components/TerminalView.js';
export { TitleBar } from './components/TitleBar.js';
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
} from './lib/content.js';
export { LOREM_CONTENT } from './lib/content-lorem.js';
export { detachedSessions } from './lib/terminal-sessions.js';
export {
  createTerminalTransport,
  readTerminalTheme,
  SHELL_TERMINAL_PROPERTIES,
  type DetachableTerminalTransport,
  type TerminalChannels,
  type TerminalDataMessage,
  type TerminalDescriptor,
  type TerminalDisposition,
  type TerminalEvent,
  type TerminalExitMessage,
  type TerminalSession,
  type TerminalTransport,
  type TerminalTransportOptions,
} from './lib/terminal-transport.js';
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
  Select,
  StatusChip,
  Switch,
  Tag,
  TextInput,
  Textarea,
  Toolbar,
  ViewModeSwitch,
  type ButtonSize,
  type ButtonVariant,
  type FieldControl,
  type MenuItem,
  type Option,
  type TileProps,
  type ViewMode,
} from './components/controls/index.js';
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
} from './lib/settings.js';
export {
  ApiKeysDialog,
  AppTogglesDialog,
  CopyButton,
  copyText,
  Diagnostics,
  ModelCards,
  SettingsPage,
  SettingsSection,
  Usage,
} from './components/settings/index.js';
export { useShellTabs } from './lib/useShellTabs.js';
export {
  useThemePreference,
  type ThemePreference,
} from './lib/useThemePreference.js';
