import { useCallback, useEffect, useState } from "react";

import type {
  LocalModelCatalogEntry,
  LocalModelCatalogSnapshot,
  LocalModelOperationEvent,
} from "../../../shared/bridge-types";
import type { SettingsCapabilities } from "../capabilities";
import { describeError } from "../../shared/errors";

import type { ActiveOperation } from "./types";

interface UseLocalModelCatalogueOptions {
  capabilities: SettingsCapabilities;
  clearError: () => void;
  reportError: (message: string) => void;
}

function replaceModel(
  snapshot: LocalModelCatalogSnapshot | null,
  model: LocalModelCatalogEntry,
): LocalModelCatalogSnapshot {
  const models = snapshot?.models ?? [];
  const index = models.findIndex(({ key }) => key === model.key);
  return {
    revision: snapshot?.revision ?? 0,
    models:
      index === -1
        ? [...models, model]
        : models.map((candidate) =>
            candidate.key === model.key ? model : candidate,
          ),
  };
}

export function useLocalModelCatalogue({
  capabilities,
  clearError,
  reportError,
}: UseLocalModelCatalogueOptions) {
  const [catalogue, setCatalogue] = useState<LocalModelCatalogSnapshot | null>(
    null,
  );
  const [operations, setOperations] = useState<Record<string, ActiveOperation>>(
    {},
  );

  const refresh = useCallback(async () => {
    try {
      setCatalogue(await capabilities.localModels.list());
    } catch (cause) {
      reportError(describeError(cause));
    }
  }, [capabilities, reportError]);

  useEffect(() => {
    let active = true;
    const unsubscribe = capabilities.localModels.subscribe(
      (event: LocalModelOperationEvent) => {
        if (!active) return;
        if (event.type === "catalog") {
          setCatalogue(event.snapshot);
          return;
        }
        if (event.type === "progress") {
          setOperations((current) => ({
            ...current,
            [event.progress.modelKey]: {
              operationId: event.operationId,
              phase: event.progress.phase,
              completedBytes: event.progress.completedBytes,
              totalBytes: event.progress.totalBytes,
            },
          }));
          return;
        }
        if (event.type === "completed") {
          setCatalogue((current) => replaceModel(current, event.model));
          setOperations((current) => {
            const next = { ...current };
            delete next[event.model.key];
            return next;
          });
          return;
        }

        setOperations((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, operation]) => operation.operationId !== event.operationId,
            ),
          ),
        );
        if (event.type === "failed") reportError(event.error.message);
        void refresh();
      },
    );

    void capabilities.localModels
      .list()
      .then((snapshot) => {
        if (active) setCatalogue(snapshot);
      })
      .catch((cause: unknown) => {
        if (active) reportError(describeError(cause));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [capabilities, refresh, reportError]);

  const openFolder = useCallback(async () => {
    clearError();
    try {
      await capabilities.localModels.openFolder();
    } catch (cause) {
      reportError(describeError(cause));
    }
  }, [capabilities, clearError, reportError]);

  const ensure = useCallback(
    async (modelKey: string) => {
      clearError();
      try {
        const result = await capabilities.localModels.ensure(modelKey);
        setOperations((current) => ({
          ...current,
          [modelKey]: { operationId: result.operationId },
        }));
      } catch (cause) {
        reportError(describeError(cause));
      }
    },
    [capabilities, clearError, reportError],
  );

  const cancel = useCallback(
    async (modelKey: string, operationId: string) => {
      try {
        await capabilities.localModels.cancel(operationId);
        setOperations((current) => {
          const next = { ...current };
          delete next[modelKey];
          return next;
        });
      } catch (cause) {
        reportError(describeError(cause));
      }
    },
    [capabilities, reportError],
  );

  return { catalogue, operations, openFolder, ensure, cancel };
}
