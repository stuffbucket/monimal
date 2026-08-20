export const llamaServerBackendDescriptor = Object.freeze({
  id: "llama-server",
  modelFormat: "gguf",
  transport: "http",
} as const)

export type LlamaServerBackendDescriptor = typeof llamaServerBackendDescriptor
