import {
  Button,
  Field,
  FieldList,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from "@maximal/maximal-electron/renderer";

import type { LocalModelCatalogSnapshot } from "../../../shared/host";

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
      title="Maximal"
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
              <FieldList>
                <Field label="Model" value={<code>{model.modelId}</code>} />
                <Field
                  label="Format"
                  value={`${model.format.toUpperCase()} · ${formatBytes(model.expectedBytes)}`}
                />
                <Field label="Source" value={publicationLabel(model)} />
                {progress ? (
                  <Field
                    label="Progress"
                    value={<span aria-live="polite">{progress}</span>}
                  />
                ) : null}
              </FieldList>
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
