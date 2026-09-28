import {
  CopyButton,
  Field,
  FieldList,
  FormField,
  Slider,
} from "@maximal/maximal-electron/renderer";

import type { useOllamaProvider } from "./useOllamaProvider";

const CONTEXT_LENGTH_OPTIONS = [
  { value: 4_096, label: "4k" },
  { value: 8_192, label: "8k" },
  { value: 16_384, label: "16k" },
  { value: 32_768, label: "32k" },
  { value: 65_536, label: "64k" },
  { value: 131_072, label: "128k" },
  { value: 262_144, label: "256k" },
] as const;

interface OllamaRuntimeDetailsProps {
  provider: ReturnType<typeof useOllamaProvider>;
}

export function OllamaRuntimeDetails({ provider }: OllamaRuntimeDetailsProps) {
  const { runtime } = provider;
  if (!runtime?.installed) return null;

  return (
    <>
      <FieldList>
        <Field
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
        <Field
          label="Endpoint"
          value={
            <>
              <code>{runtime.endpoint}</code>
              <CopyButton text={runtime.endpoint} about="the Ollama endpoint" />
            </>
          }
        />
        <Field
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
        <Field
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
      </FieldList>
      {runtime.context_length !== null ? (
        <FormField
          label="Context length"
          hint={
            provider.savingContextLength
              ? "Saving context length…"
              : "Context length determines how much of your conversation local models can remember and use to generate responses."
          }
        >
          {(control) => (
            <Slider
                {...control}
              label="Context length"
              value={Number(provider.contextLength)}
              options={CONTEXT_LENGTH_OPTIONS}
              testId="ollama-context-length"
              onChange={(value) => provider.setContextLength(String(value))}
              onCommit={(value) => void provider.saveContextLength(String(value))}
            />
          )}
        </FormField>
      ) : null}
    </>
  );
}
