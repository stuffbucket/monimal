import {
  Button,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from "stuffbucket-electron/renderer";

import type { LocalModelCatalogSnapshot } from "../../../shared/bridge-types";

import { formatBytes, progressLabel, publicationLabel } from "./format";
import type { ActiveOperation } from "./types";

interface MaximalModelsSectionProps {
  catalogue: LocalModelCatalogSnapshot | null;
  operations: Record<string, ActiveOperation>;
  onCancel: (modelKey: string, operationId: string) => void;
  onDownload: (modelKey: string) => void;
  onOpenFolder: () => void;
}

export function MaximalModelsSection({
  catalogue,
  operations,
  onCancel,
  onDownload,
  onOpenFolder,
}: MaximalModelsSectionProps) {
  return (
    <SettingsSection
      title="Models hosted by Maximal"
      description="Models downloaded and served by this device using its hardware."
    >
      {catalogue !== null && catalogue.models.length === 0 ? (
        <Note>No bundled local models are configured.</Note>
      ) : null}
      <SettingsGroup>
        {catalogue?.models.map((model) => {
          const operation = operations[model.key];
          const progress =
            operation === undefined ? null : progressLabel(operation);
          const canDownload =
            operation === undefined &&
            (model.state === "registered" || model.state === "failed");
          return (
            <SettingsItem
              key={model.key}
              title={model.displayName}
              description={model.state}
              actions={
                operation !== undefined ? (
                  <Button
                    size="sm"
                    onClick={() => onCancel(model.key, operation.operationId)}
                  >
                    Cancel
                  </Button>
                ) : canDownload ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onDownload(model.key)}
                  >
                    Download
                  </Button>
                ) : undefined
              }
            >
              <code>{model.modelId}</code>
              <span className="settings-list__meta">
                {model.format.toUpperCase()} ·{" "}
                {formatBytes(model.expectedBytes)}
              </span>
              <span className="settings-list__detail">
                {publicationLabel(model)}
              </span>
              {progress ? (
                <span className="settings-list__detail" aria-live="polite">
                  {progress}
                </span>
              ) : null}
            </SettingsItem>
          );
        })}
        <SettingsItem
          title="Models folder"
          actions={
            <Button size="sm" onClick={onOpenFolder}>
              Open models folder
            </Button>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}
