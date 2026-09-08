import { Link2, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  type SettingsSectionSpec,
} from '../../shared/settings-sections'
import { AccountSection } from './AccountSection'
import { AccountsSection } from './AccountsSection'
import type { SettingsCapabilities } from './capabilities'
import { ConnectionSection } from './ConnectionSection'

/**
 * The renderer's half of the settings manifest.
 *
 * `shared/settings-sections.ts` says which sections exist and what they are
 * called; that half is data the main process reads to build a native menu. This
 * half adds the two things only a renderer can use: the icon the rail draws
 * when it narrows to an icon column, and the component that draws the section.
 *
 * Keeping the panel here rather than in `Settings.tsx` is the point of the
 * exercise. `Settings.tsx` used to hold the rail's list and the panels' list
 * separately, and nothing made them agree; now both are projections of one
 * array, and a section cannot appear in the rail without a panel to scroll to.
 */

/** Every panel takes the same one prop, which is what makes the table below
 *  a lookup rather than a switch with three shapes in it. */
type SectionPanel = ComponentType<{ capabilities: SettingsCapabilities }>

interface SectionParts {
  icon: ComponentType<{ size?: number }>
  Panel: SectionPanel
}

/*
 * Typed by the id union rather than by `string`, so this is a total function of
 * `SETTINGS_SECTION_IDS`: adding a section to the shared list and forgetting it
 * here fails to compile. That is the check that replaces the two lists which
 * used to drift.
 *
 * Account and Accounts share a first letter, which is why the collapsed rail
 * draws icons rather than initials — see `SectionRail`.
 */
const SECTION_PARTS: Record<SettingsSectionId, SectionParts> = {
  'settings-account-heading': { icon: User, Panel: AccountSection },
  'settings-accounts-heading': { icon: Users, Panel: AccountsSection },
  'settings-connection-heading': { icon: Link2, Panel: ConnectionSection },
}

export interface SettingsSectionView extends SettingsSectionSpec, SectionParts {}

/** The manifest as the renderer uses it, in the shared list's order. */
export const SETTINGS_SECTION_VIEWS: readonly SettingsSectionView[] =
  SETTINGS_SECTIONS.map((section) => ({ ...section, ...SECTION_PARTS[section.id] }))
