import * as Tooltip from '@radix-ui/react-tooltip';
import { ChartColumn, Cpu, ScrollText } from 'lucide-react';
import { useCallback, useState, type ComponentType } from 'react';

import type { AppVersions } from '../../shared/ipc.js';
import {
  SAMPLE_APPS,
  SAMPLE_CLIENTS,
  SAMPLE_DIAGNOSTICS,
  SAMPLE_ENDPOINT,
  SAMPLE_MODELS,
  sampleUsage,
} from '../lib/sample-settings.js';
import type {
  ApiClient,
  AppIntegration,
  DiagnosticGroup,
  SettingsSurface,
  UsagePeriod,
} from '../lib/settings.js';

import { ApiKeysDialog } from './settings/ApiKeysDialog.js';
import { AppTogglesDialog } from './settings/AppTogglesDialog.js';
import { Diagnostics } from './settings/Diagnostics.js';
import { ModelCards } from './settings/ModelCards.js';
import { Usage } from './settings/Usage.js';

/**
 * The reference application's wiring of the settings surfaces.
 *
 * Every surface takes its content as props, so this is the part a consumer
 * replaces: their own models, their own clients, their own diagnostics. What
 * is here holds sample content and keeps it in local state, which is enough to
 * make the controls real without inventing a persistence contract the shell
 * has no business owning.
 *
 * Two components rather than one, because the two halves live in different
 * places. The tab surface renders inside `ShellLayout`'s document area; the
 * dialogs render beside it, so that opening one from any tab works. They share
 * `useShellSettings` rather than duplicating the state.
 */

/** Which surfaces are tabs. The rest are dialogs. */
export const TAB_SURFACES: Record<string, string> = {
  'model-cards': 'Model cards',
  diagnostics: 'Diagnostics',
  usage: 'Usage',
};

/** The tab-strip icon for each of them. */
export const TAB_SURFACE_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  'model-cards': Cpu,
  diagnostics: ScrollText,
  usage: ChartColumn,
};

/** The surface a tab of this kind shows, or undefined if it is not one. */
export function tabSurface(kind: string): SettingsSurface | undefined {
  return TAB_SURFACES[kind] === undefined ? undefined : (kind as SettingsSurface);
}

export function useShellSettings() {
  const [clients, setClients] = useState<ApiClient[]>(SAMPLE_CLIENTS);
  const [apps, setApps] = useState<AppIntegration[]>(SAMPLE_APPS);
  const [period, setPeriod] = useState<UsagePeriod>('day');

  const addClient = useCallback((label: string) => {
    setClients((prev) => [
      ...prev,
      {
        id: `client-${String(prev.length + 1)}`,
        label,
        // Not a credential. A consumer's own store issues the real value.
        key: 'example-not-a-real-key',
        enabled: true,
      },
    ]);
  }, []);

  const removeClient = useCallback((id: string) => {
    setClients((prev) => prev.filter((client) => client.id !== id));
  }, []);

  const toggleClient = useCallback((id: string, enabled: boolean) => {
    setClients((prev) =>
      prev.map((client) => (client.id === id ? { ...client, enabled } : client)),
    );
  }, []);

  const toggleApp = useCallback((id: string, enabled: boolean) => {
    setApps((prev) => prev.map((app) => (app.id === id ? { ...app, enabled } : app)));
  }, []);

  return {
    clients,
    apps,
    period,
    setPeriod,
    addClient,
    removeClient,
    toggleClient,
    toggleApp,
  };
}

export type ShellSettings = ReturnType<typeof useShellSettings>;

/** The runtime facts the shell already knows, as a diagnostics group. */
function runtimeGroup(versions: AppVersions | undefined): DiagnosticGroup[] {
  if (!versions) return [];
  return [
    {
      id: 'runtime',
      label: 'Runtime',
      entries: [
        { label: 'Application', value: versions.app },
        { label: 'Electron', value: versions.electron },
        { label: 'Chrome', value: versions.chrome },
        { label: 'Node', value: versions.node },
        { label: 'Platform', value: `${versions.platform} ${versions.arch}` },
        { label: 'Packaged', value: String(versions.packaged) },
      ],
    },
  ];
}

export function SettingsSurfaceView({
  surface,
  settings,
  versions,
}: {
  surface: SettingsSurface;
  settings: ShellSettings;
  versions?: AppVersions;
}) {
  switch (surface) {
    case 'model-cards':
      return <ModelCards models={SAMPLE_MODELS} loadedAtMs={Date.now()} />;
    case 'diagnostics':
      return (
        <Diagnostics
          groups={[...runtimeGroup(versions), ...SAMPLE_DIAGNOSTICS]}
          logs={{ path: '~/.local/share/stuffbucket/logs', retentionDays: 7 }}
        />
      );
    default:
      return (
        <Usage
          report={sampleUsage(Date.now())}
          period={settings.period}
          onPeriodChange={settings.setPeriod}
        />
      );
  }
}

export function SettingsDialogs({
  surface,
  onClose,
  settings,
}: {
  surface: SettingsSurface | undefined;
  onClose: () => void;
  settings: ShellSettings;
}) {
  /*
   * Its own tooltip provider.
   *
   * These render beside `ShellLayout` rather than inside it, so the provider
   * that component supplies is not above them — and `IconButton` throws
   * without one. The keys dialog rendered as nothing at all in the packaged
   * application while every story of it passed, because
   * `.storybook/preview.ts` supplies a provider globally.
   */
  return (
    <Tooltip.Provider delayDuration={400}>
      <ApiKeysDialog
        open={surface === 'api-keys'}
        onOpenChange={onClose}
        endpoint={SAMPLE_ENDPOINT}
        clients={settings.clients}
        onAddClient={settings.addClient}
        onRemoveClient={settings.removeClient}
        onToggleClient={settings.toggleClient}
      />
      <AppTogglesDialog
        open={surface === 'app-toggles'}
        onOpenChange={onClose}
        apps={settings.apps}
        onToggle={settings.toggleApp}
      />
    </Tooltip.Provider>
  );
}
