import {
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from "@maximal/maximal-electron/renderer";

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
  const providerToggleLabel =
    settings?.local_enabled === false ? "Enable provider" : "Disable provider";

  return (
    <SettingsSection
      title="Ollama"
    >
      <SettingsGroup dividers={false} testId="ollama-provider-settings">
        <SettingsItem
          title="Runtime status"
          description={
            provider.endpointLocation === null
              ? provider.status
              : `${provider.status} · ${provider.endpointLocation}`
          }
          actions={
            settings && runtime?.installed ? (
              <Switch
                label={providerToggleLabel}
                displayLabel={null}
                tooltip={providerToggleLabel}
                checked={settings.local_enabled ?? true}
                onChange={(enabled) => void provider.updateEnabled(enabled)}
                testId="local-models-enable-ollama"
              />
            ) : undefined
          }
        >
          <OllamaRuntimeDetails provider={provider} />
        </SettingsItem>
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
