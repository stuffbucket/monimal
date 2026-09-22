import { useCallback, useState, type ReactElement } from "react";

import { Banner, Button } from "stuffbucket-electron/renderer";

import type { SettingsCapabilities } from "../capabilities";

import { MaximalModelsSection } from "./MaximalModelsSection";
import { OllamaProviderSection } from "./OllamaProviderSection";
import { useLocalModelCatalogue } from "./useLocalModelCatalogue";
import { useOllamaProvider } from "./useOllamaProvider";

interface LocalModelsSectionProps {
  capabilities: SettingsCapabilities;
}

export function LocalModelsSection({
  capabilities,
}: LocalModelsSectionProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const reportError = useCallback((message: string) => setError(message), []);
  const catalogue = useLocalModelCatalogue({
    capabilities,
    clearError,
    reportError,
  });
  const ollama = useOllamaProvider({
    capabilities,
    clearError,
    reportError,
  });

  return (
    <section className="settings-section">
      {error ? (
        <Banner
          fullWidth
          status="failed"
          action={<Button onClick={clearError}>Dismiss</Button>}
        >
          <strong>Local model action failed:</strong> {error}
        </Banner>
      ) : null}
      <OllamaProviderSection capabilities={capabilities} provider={ollama} />
      <MaximalModelsSection
        catalogue={catalogue.catalogue}
        operations={catalogue.operations}
        onCancel={(modelKey, operationId) =>
          void catalogue.cancel(modelKey, operationId)
        }
        onDownload={(modelKey) => void catalogue.ensure(modelKey)}
        onOpenFolder={() => void catalogue.openFolder()}
      />
    </section>
  );
}
