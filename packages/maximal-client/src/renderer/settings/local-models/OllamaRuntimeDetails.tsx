import { Property, PropertyList, Select } from "@maximal/maximal-design-system";
import { CopyButton } from "@maximal/maximal-electron/renderer";

import { ControlNotes } from "../ControlNotes";

import type { useOllamaProvider } from "./useOllamaProvider";

const CONTEXT_LENGTH_OPTIONS = [
  { value: "4096", label: "4k" },
  { value: "8192", label: "8k" },
  { value: "16384", label: "16k" },
  { value: "32768", label: "32k" },
  { value: "65536", label: "64k" },
  { value: "131072", label: "128k" },
  { value: "262144", label: "256k" },
] as const;

interface OllamaRuntimeDetailsProps {
  provider: ReturnType<typeof useOllamaProvider>;
}

export function OllamaRuntimeDetails({ provider }: OllamaRuntimeDetailsProps) {
  const { runtime } = provider;
  if (!runtime?.installed) return null;

  return (
    <>
      <PropertyList>
        <Property
          label="Application"
          value={
            runtime.application_path ? (
              <>
                <code>{runtime.application_path}</code>
                <CopyButton
                  text={runtime.application_path}
                  about="the Ollama application path"
                />
              </>
            ) : (
              "Not detected"
            )
          }
        />
        <Property
          label="Endpoint"
          value={
            <>
              <code>{runtime.endpoint}</code>
              <CopyButton text={runtime.endpoint} about="the Ollama endpoint" />
            </>
          }
        />
        <Property
          label="Server configuration"
          value={
            <>
              <code>{runtime.server_configuration_path}</code>
              <CopyButton
                text={runtime.server_configuration_path}
                about="the Ollama server configuration path"
              />
            </>
          }
        />
        <Property
          label="Desktop settings"
          value={
            runtime.desktop_settings_path ? (
              <>
                <code>{runtime.desktop_settings_path}</code>
                <CopyButton
                  text={runtime.desktop_settings_path}
                  about="the Ollama desktop settings path"
                />
              </>
            ) : (
              "Not available"
            )
          }
        />
      </PropertyList>
      {runtime.context_length !== null ? (
        <ControlNotes
          hint={
            provider.savingContextLength
              ? "Saving context length…"
              : "Context length determines how much of your conversation local models can remember and use to generate responses."
          }
        >
          {(describedBy) => (
            <Select
              label="Context length"
              value={provider.contextLength}
              options={CONTEXT_LENGTH_OPTIONS}
              onValueChange={(value) => {
                provider.setContextLength(value);
                void provider.saveContextLength(value);
              }}
              triggerProps={{
                "aria-describedby": describedBy,
                "data-testid": "ollama-context-length",
              }}
            />
          )}
        </ControlNotes>
      ) : null}
    </>
  );
}
