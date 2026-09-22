import { Button, SettingsItem } from "stuffbucket-electron/renderer";

import type { SettingsCapabilities } from "../capabilities";
import { useSettingsNavigation } from "../navigation";

import type { useOllamaProvider } from "./useOllamaProvider";

interface OllamaProviderActionsProps {
  capabilities: SettingsCapabilities;
  provider: ReturnType<typeof useOllamaProvider>;
}

export function OllamaProviderActions({
  capabilities,
  provider,
}: OllamaProviderActionsProps) {
  const navigate = useSettingsNavigation();
  const { runtime } = provider;

  return (
    <SettingsItem
      title="Actions"
      actions={
        <>
          <Button
            size="sm"
            onClick={() => navigate("settings-account-heading")}
          >
            Edit account…
          </Button>
          {runtime?.can_launch ? (
            <Button
              variant="primary"
              size="sm"
              disabled={provider.launching}
              onClick={() => void provider.launch()}
            >
              {provider.launching
                ? "Opening…"
                : runtime.can_manage
                  ? "Open Ollama"
                  : "Start Ollama"}
            </Button>
          ) : runtime?.installed === false ? (
            <Button
              size="sm"
              onClick={() =>
                void capabilities.openExternal("https://ollama.com/download")
              }
            >
              Get Ollama
            </Button>
          ) : null}
        </>
      }
    />
  );
}
