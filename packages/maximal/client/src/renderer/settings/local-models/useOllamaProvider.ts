import { useCallback, useEffect, useState } from "react";

import type { OllamaRuntimeStatus } from "../../../shared/bridge-types";
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

  const applyRuntime = useCallback((next: OllamaRuntimeStatus) => {
    setRuntime(next);
    setContextLength(
      next.context_length === null ? "" : String(next.context_length),
    );
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      applyRuntime(await capabilities.ollamaRuntime.status());
    } catch (cause) {
      reportError(describeError(cause));
    }
  }, [applyRuntime, capabilities, reportError]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      capabilities.ollamaSettings.get(),
      capabilities.ollamaRuntime.status(),
    ])
      .then(([nextSettings, nextRuntime]) => {
        if (!active) return;
        setSettings(nextSettings);
        applyRuntime(nextRuntime);
      })
      .catch((cause: unknown) => {
        if (active) reportError(describeError(cause));
      });

    const interval = window.setInterval(() => {
      void capabilities.ollamaRuntime
        .status()
        .then((nextRuntime) => {
          if (active) applyRuntime(nextRuntime);
        })
        .catch((cause: unknown) => {
          if (active) reportError(describeError(cause));
        });
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [applyRuntime, capabilities, reportError]);

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
    setLaunching(true);
    clearError();
    try {
      applyRuntime(await capabilities.ollamaRuntime.launch());
    } catch (cause) {
      reportError(describeError(cause));
    } finally {
      setLaunching(false);
    }
  }, [applyRuntime, capabilities, clearError, reportError]);

  const saveContextLength = useCallback(async () => {
    const value = Number(contextLength);
    if (!Number.isSafeInteger(value) || value < 512) {
      reportError("Context length must be a whole number of at least 512.");
      return;
    }
    setSavingContextLength(true);
    clearError();
    try {
      applyRuntime(await capabilities.ollamaRuntime.updateContextLength(value));
    } catch (cause) {
      reportError(describeError(cause));
    } finally {
      setSavingContextLength(false);
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
