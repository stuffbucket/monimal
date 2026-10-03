import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  Button,
  CopyButton,
  Field,
  FieldList,
  ModelCardGrid,
  Note,
  SettingsActions,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
  type ModelCard,
} from "@maximal/maximal-electron/renderer";
import {
  MAXIMAL_MODEL_CATALOG,
  reconcileModelInventory,
} from "@maximal/maximal-model-catalog";

import type { LocalModelCatalogSnapshot } from "../../../shared/host";
import type { SettingsCapabilities } from "../capabilities";

import { formatBytes, progressLabel, publicationLabel } from "./format";
import type { ActiveOperation } from "./types";
import {
  localModelObservations,
  modelFeatureEnabled,
} from "../model-inventory";

interface MaximalModelsSectionProps {
  capabilities: SettingsCapabilities;
  catalogue: LocalModelCatalogSnapshot | null;
  operations: Record<string, ActiveOperation>;
  onCancel: (modelKey: string, operationId: string) => void;
  onDownload: (modelKey: string) => void;
  onOpenFolder: () => void;
}

const EMPTY_MODELS: LocalModelCatalogSnapshot["models"] = [];

function cardFor(
  model: ReturnType<typeof reconcileModelInventory>["models"][number],
): ModelCard {
  return {
    id: model.id,
    name: model.name,
    kind: model.kind,
    provider: model.provider.name,
    local: true,
    contextWindowTokens: model.limits.contextTokens.value ?? undefined,
    maxOutputTokens: model.limits.outputTokens.value ?? undefined,
    capabilities: {
      vision: modelFeatureEnabled(model, "vision"),
      imageGeneration: modelFeatureEnabled(model, "imageGeneration"),
      videoGeneration: modelFeatureEnabled(model, "videoGeneration"),
      toolCalls: modelFeatureEnabled(model, "toolCalls"),
      streaming: true,
      reasoning: modelFeatureEnabled(model, "reasoning"),
    },
  };
}

function MaximalRuntimeDetails({
  endpoint,
  contextLength,
}: {
  endpoint: string | null;
  contextLength: number | null;
}) {
  return (
    <FieldList>
      <Field label="Application" value="Maximal" />
      <Field
        label="Endpoint"
        value={
          endpoint === null ? (
            "Checking…"
          ) : (
            <>
              <code>{endpoint}</code>
              <CopyButton text={endpoint} about="the Maximal endpoint" />
            </>
          )
        }
      />
      <Field label="Server configuration" value="Maximal llama.cpp runtime" />
      <Field
        label="Context length"
        value={
          contextLength === null
            ? "No model configured"
            : contextLength.toLocaleString()
        }
      />
    </FieldList>
  );
}

export function MaximalModelsSection({
  capabilities,
  catalogue,
  operations,
  onCancel,
  onDownload,
  onOpenFolder,
}: MaximalModelsSectionProps) {
  const [enabled, setEnabled] = useState(true);
  const endpointQuery = useQuery({
    queryKey: ["settings", "connection", "proxy-url"],
    queryFn: () => capabilities.connection.proxyUrl(),
  });
  const endpoint = endpointQuery.data ?? null;

  const models = catalogue?.models ?? EMPTY_MODELS;
  const cards = useMemo(
    () =>
      reconcileModelInventory(
        MAXIMAL_MODEL_CATALOG,
        localModelObservations(models),
      ).models.map(cardFor),
    [models],
  );
  const contextLength =
    models.length === 0
      ? null
      : Math.max(...models.map((model) => model.context.contextWindow));
  const providerToggleLabel = enabled ? "Disable provider" : "Enable provider";

  return (
    <SettingsSection
      title="Maximal"
      description="Models downloaded and served by Maximal on this device."
    >
      <SettingsGroup dividers={false} testId="maximal-provider-settings">
        <SettingsItem
          title="Runtime status"
          description={`${enabled ? "Enabled" : "Disabled"} · Running · Maximal`}
          actions={
            <Switch
              label={providerToggleLabel}
              displayLabel={null}
              tooltip={providerToggleLabel}
              checked={enabled}
              onChange={setEnabled}
              testId="local-models-enable-maximal"
            />
          }
        >
          <MaximalRuntimeDetails
            endpoint={endpoint}
            contextLength={contextLength}
          />
        </SettingsItem>

        {cards.length === 0 ? (
          <SettingsItem title="Models">
            <Note>No bundled local models are configured.</Note>
          </SettingsItem>
        ) : (
          <SettingsItem title="Available models">
            <ModelCardGrid
              models={cards}
              renderActions={(card) => {
                const model = models.find((candidate) => candidate.modelId === card.id);
                if (model === undefined) return null;
                const operation = operations[model.key];
                const details = (
                  <span>
                    {model.format.toUpperCase()} · {formatBytes(model.expectedBytes)}
                    {" · "}
                    {publicationLabel(model)}
                  </span>
                );
                if (operation !== undefined) {
                  return (
                    <>
                      {details}
                      <span aria-live="polite">{progressLabel(operation)}</span>
                      <Button
                        size="sm"
                        onClick={() => onCancel(model.key, operation.operationId)}
                      >
                        Cancel
                      </Button>
                    </>
                  );
                }
                if (model.state === "registered" || model.state === "failed") {
                  return (
                    <>
                      {details}
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!enabled}
                        onClick={() => onDownload(model.key)}
                      >
                        Download
                      </Button>
                    </>
                  );
                }
                return (
                  <>
                    {details}
                    <span>{model.state}</span>
                  </>
                );
              }}
            />
          </SettingsItem>
        )}

        <SettingsActions>
          <Button size="sm" onClick={onOpenFolder}>
            Open models folder
          </Button>
        </SettingsActions>
      </SettingsGroup>
    </SettingsSection>
  );
}
