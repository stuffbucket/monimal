import {
  Button,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from "stuffbucket-electron/renderer";

import type { SettingsCapabilities } from "../capabilities";

import { OllamaProviderActions } from "./OllamaProviderActions";
import { OllamaRuntimeDetails } from "./OllamaRuntimeDetails";
import type { useOllamaProvider } from "./useOllamaProvider";

interface OllamaProviderSectionProps {
  capabilities: SettingsCapabilities;
  provider: ReturnType<typeof useOllamaProvider>;
}

export function OllamaProviderSection({
  capabilities,
  provider,
}: OllamaProviderSectionProps) {
  const { runtime, settings } = provider;

  return (
    <SettingsSection
      title="Ollama"
      description="Models running locally on this device via Ollama."
    >
      <SettingsGroup>
        <SettingsItem
          title="Runtime status"
          description={
            provider.endpointLocation === null
              ? provider.status
              : `${provider.status} · ${provider.endpointLocation}`
          }
          actions={
            <Button size="sm" onClick={() => void provider.refreshStatus()}>
              Refresh
            </Button>
          }
        >
          <OllamaRuntimeDetails provider={provider} />
        </SettingsItem>
        {settings && runtime?.installed ? (
          <SettingsItem
            title="Enable provider"
            control={
              <Switch
                label={`${settings.local_enabled === false ? "Enable" : "Disable"} local Ollama`}
                displayLabel={null}
                tooltip={
                  settings.local_enabled === false ? "Disabled" : "Enabled"
                }
                layout="compact"
                checked={settings.local_enabled ?? true}
                onChange={(enabled) => void provider.updateEnabled(enabled)}
              />
            }
          />
        ) : null}
        {settings ? (
          <SettingsItem
            title="Prefer local models"
            description="When available locally and in the cloud, use the local copy."
            control={
              <Switch
                label="Prefer local"
                displayLabel={null}
                checked={settings.prefer_local_models}
                onChange={(next) => void provider.updatePreference(next)}
                testId="local-models-prefer-ollama-local"
              />
            }
          />
        ) : null}
        <OllamaProviderActions
          capabilities={capabilities}
          provider={provider}
        />
      </SettingsGroup>
    </SettingsSection>
  );
}
