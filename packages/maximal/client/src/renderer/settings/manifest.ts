import {
  ChartColumn,
  Cpu,
  Link2,
  ScrollText,
  SlidersHorizontal,
  Stethoscope,
  User,
} from 'lucide-react'
import type { ComponentType } from 'react'

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  type SettingsSectionSpec,
} from '../../shared/settings-sections'
import { AccountSection } from './AccountSection'
import type { SettingsCapabilities } from './capabilities'
import { ConnectionsSection } from './ConnectionsSection'
import { DiagnosticsSection } from './DiagnosticsSection'
import { GeneralSection } from './GeneralSection'
import { LogsSection } from './LogsSection'
import { ModelsSection } from './ModelsSection'
import { UsageSection } from './UsageSection'

type SectionPanel = ComponentType<{ capabilities: SettingsCapabilities }>

interface SectionParts {
  icon: ComponentType<{ size?: number }>
  Panel: SectionPanel
}

const SECTION_PARTS: Record<SettingsSectionId, SectionParts> = {
  'settings-account-heading': { icon: User, Panel: AccountSection },
  'settings-general-heading': {
    icon: SlidersHorizontal,
    Panel: GeneralSection,
  },
  'settings-connections-heading': { icon: Link2, Panel: ConnectionsSection },
  'settings-models-heading': { icon: Cpu, Panel: ModelsSection },
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
