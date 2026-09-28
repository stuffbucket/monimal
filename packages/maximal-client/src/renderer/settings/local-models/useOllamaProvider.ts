import { useCallback, useEffect, useRef, useState } from "react";

import type { OllamaRuntimeStatus } from "@maximal/maximal-ollama/contract";
import type {
  SettingsCapabilities,
  OllamaSettingsResponse,
} from "../capabilities";
import { describeError } from "../../shared/errors";

import { ollamaEndpointLocation } from "./format";

interface UseOllamaProviderOptions {
  capabilities: SettingsCapabilities;
  clearError: () => void;
  reportError: (message: string) => void;
}

export function useOllamaProvider({
  capabilities,
  clearError,
  reportError,
}: UseOllamaProviderOptions) {
  const [settings, setSettings] = useState<OllamaSettingsResponse | null>(null);
  const [runtime, setRuntime] = useState<OllamaRuntimeStatus | null>(null);
  const [launching, setLaunching] = useState(false);
  const [savingContextLength, setSavingContextLength] = useState(false);
  const [contextLength, setContextLength] = useState("");
  const contextLengthSaveRevision = useRef(0);

  const applyRuntime = useCallback((next: OllamaRuntimeStatus) => {
    setRuntime(next);
    setContextLength(
      next.context_length === null ? "" : String(next.context_length),
    );
  }, []);

  const refreshStatus = useCallback(async () => {
    if (settings === null) return;
    try {
      applyRuntime(
        await capabilities.ollamaRuntime.status(settings.local_endpoint),
      );
    } catch (cause) {
      reportError(describeError(cause));
    }
  }, [applyRuntime, capabilities, reportError, settings]);

  useEffect(() => {
    let active = true;
    void capabilities.ollamaSettings.get()
      .then((nextSettings) => {
        if (!active) return;
        setSettings(nextSettings);
      })
      .catch((cause: unknown) => {
        if (active) reportError(describeError(cause));
      });
    return () => {
      active = false;
    };
  }, [capabilities, reportError]);

  useEffect(() => {
    if (settings === null) return;
    let active = true;
    const refresh = () => {
      void capabilities.ollamaRuntime
        .status(settings.local_endpoint)
        .then((nextRuntime) => {
          if (active) applyRuntime(nextRuntime);
        })
        .catch((cause: unknown) => {
          if (active) reportError(describeError(cause));
        });
    };
    refresh();
    const interval = window.setInterval(() => {
      refresh();
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [applyRuntime, capabilities, reportError, settings]);

  const updatePreference = useCallback(
    async (preferLocalModels: boolean) => {
      clearError();
      try {
        setSettings(
          await capabilities.ollamaSettings.update({
            prefer_local_models: preferLocalModels,
          }),
        );
      } catch (cause) {
        reportError(describeError(cause));
      }
    },
    [capabilities, clearError, reportError],
  );

  const updateEnabled = useCallback(
    async (localEnabled: boolean) => {
      clearError();
      try {
        setSettings(
          await capabilities.ollamaSettings.update({
            local_enabled: localEnabled,
          }),
        );
      } catch (cause) {
        reportError(describeError(cause));
      }
    },
    [capabilities, clearError, reportError],
  );

  const launch = useCallback(async () => {
    if (settings === null) return;
    setLaunching(true);
    clearError();
    try {
      applyRuntime(
        await capabilities.ollamaRuntime.launch(settings.local_endpoint),
      );
    } catch (cause) {
      reportError(describeError(cause));
    } finally {
      setLaunching(false);
    }
  }, [applyRuntime, capabilities, clearError, reportError, settings]);

  const saveContextLength = useCallback(async (nextContextLength = contextLength) => {
    const value = Number(nextContextLength);
    if (!Number.isSafeInteger(value) || value < 512) {
      reportError("Context length must be a whole number of at least 512.");
      return;
    }
    const revision = contextLengthSaveRevision.current + 1;
    contextLengthSaveRevision.current = revision;
    setSavingContextLength(true);
    clearError();
    try {
      const next = await capabilities.ollamaRuntime.updateContextLength(value);
      if (contextLengthSaveRevision.current === revision) applyRuntime(next);
    } catch (cause) {
      if (contextLengthSaveRevision.current === revision) {
        reportError(describeError(cause));
      }
    } finally {
      if (contextLengthSaveRevision.current === revision) {
        setSavingContextLength(false);
      }
    }
  }, [applyRuntime, capabilities, clearError, contextLength, reportError]);

  const status =
    runtime === null
      ? "Checking installation…"
      : runtime.running
        ? "Running"
        : runtime.installed
          ? "Installed, not running"
          : "Not installed";

  return {
    settings,
    runtime,
    launching,
    savingContextLength,
    contextLength,
    status,
    endpointLocation:
      runtime === null || !runtime.installed
        ? null
        : ollamaEndpointLocation(runtime.endpoint),
    setContextLength,
    refreshStatus,
    updatePreference,
    updateEnabled,
    launch,
    saveContextLength,
  };
}
