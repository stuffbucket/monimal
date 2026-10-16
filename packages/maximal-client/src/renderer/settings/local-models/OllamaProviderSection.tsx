import { Switch, Tooltip } from "@maximal/maximal-design-system";
import { SettingsGroup, SettingsItem, SettingsSection } from "@maximal/maximal-electron/renderer";

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
  const providerStatus =
    settings?.local_enabled === false ? "Disabled" : "Enabled";

  return (
    <SettingsSection
      title="Ollama"
    >
      <SettingsGroup dividers={false} testId="ollama-provider-settings">
        <SettingsItem
          title="Runtime status"
          description={
            provider.endpointLocation === null
              ? `${providerStatus} · ${provider.status} · Ollama`
              : `${providerStatus} · ${provider.status} · Ollama · ${provider.endpointLocation}`
          }
          actions={
            settings && runtime?.installed ? (
              <Tooltip
                trigger={(
                  <Switch
                    aria-label={providerToggleLabel}
                    label={null}
                    checked={settings.local_enabled ?? true}
                    onCheckedChange={(enabled) => void provider.updateEnabled(enabled)}
                    data-testid="local-models-enable-ollama"
                  />
                )}
              >
                {providerToggleLabel}
              </Tooltip>
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
                aria-label="Prefer local"
                label={null}
                checked={settings.prefer_local_models}
                onCheckedChange={(next) => void provider.updatePreference(next)}
                data-testid="local-models-prefer-ollama-local"
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
