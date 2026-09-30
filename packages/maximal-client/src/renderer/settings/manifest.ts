import {
  ChartColumn,
  Cloud,
  FolderGit2,
  Laptop,
  Link2,
  MousePointer2,
  Palette,
  PanelLeft,
  ScrollText,
  Search,
  Sparkles,
  Stethoscope,
  SunMoon,
  Type,
  User,
} from 'lucide-react'
import type { ComponentType } from 'react'

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  type SettingsSectionSpec,
} from '../../shared/settings-sections'
import { AccountSection } from './AccountSection'
import {
  ShadersSection,
  ThemesSection,
} from './AppearancePlaceholderSections'
import type { SettingsCapabilities } from './capabilities'
import { ConnectionsSection } from './ConnectionsSection'
import { DiagnosticsSection } from './DiagnosticsSection'
import {
  ColorPalettesSection,
  GeneralSection,
  TypographySection,
} from './GeneralSection'
import { LocalModelsSection } from './LocalModelsSection'
import { LogsSection } from './LogsSection'
import { ModelsSection } from './ModelsSection'
import { ProjectsSection } from './projects/ProjectsSection'
import { SearchSection } from './SearchSection'
import { UsageSection } from './UsageSection'
import { WorkbarSection } from './WorkbarSection'

type SectionPanel = ComponentType<{ capabilities: SettingsCapabilities }>

interface SectionParts {
  icon: ComponentType<{ size?: number }>
  Panel: SectionPanel
}

const SECTION_PARTS: Record<SettingsSectionId, SectionParts> = {
  'settings-account-heading': { icon: User, Panel: AccountSection },
  'settings-projects-heading': { icon: FolderGit2, Panel: ProjectsSection },
  'settings-models-heading': { icon: Cloud, Panel: ModelsSection },
  'settings-local-models-heading': {
    icon: Laptop,
    Panel: LocalModelsSection,
  },
  'settings-typography-heading': { icon: Type, Panel: TypographySection },
  'settings-color-palettes-heading': {
    icon: Palette,
    Panel: ColorPalettesSection,
  },
  'settings-shaders-heading': { icon: Sparkles, Panel: ShadersSection },
  'settings-themes-heading': { icon: SunMoon, Panel: ThemesSection },
  'settings-interaction-heading': {
    icon: MousePointer2,
    Panel: GeneralSection,
  },
  'settings-workbar-heading': { icon: PanelLeft, Panel: WorkbarSection },
  'settings-connections-heading': { icon: Link2, Panel: ConnectionsSection },
  'settings-search-heading': { icon: Search, Panel: SearchSection },
  'settings-usage-heading': { icon: ChartColumn, Panel: UsageSection },
  'settings-logs-heading': { icon: ScrollText, Panel: LogsSection },
  'settings-diagnostics-heading': {
    icon: Stethoscope,
    Panel: DiagnosticsSection,
  },
}

export interface SettingsSectionView extends SettingsSectionSpec, SectionParts {}

export const SETTINGS_SECTION_VIEWS: readonly SettingsSectionView[] =
  SETTINGS_SECTIONS.map((section) => ({ ...section, ...SECTION_PARTS[section.id] }))
