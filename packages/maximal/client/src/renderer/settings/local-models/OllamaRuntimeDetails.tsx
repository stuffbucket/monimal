import {
  Button,
  CopyButton,
  Field,
  FieldList,
  FormField,
} from "stuffbucket-electron/renderer";

import type { useOllamaProvider } from "./useOllamaProvider";

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
          label="Context window"
          hint="Ollama applies this setting to newly loaded models. Larger values use more memory."
        >
          {(control) => (
            <div className="settings__row">
              <input
                {...control}
                className="input"
                type="number"
                min={512}
                step={512}
                value={provider.contextLength}
                disabled={provider.savingContextLength}
                onChange={(event) =>
                  provider.setContextLength(event.target.value)
                }
              />
              <Button
                size="sm"
                disabled={provider.savingContextLength}
                onClick={() => void provider.saveContextLength()}
              >
                {provider.savingContextLength ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </FormField>
      ) : null}
    </>
  );
}
