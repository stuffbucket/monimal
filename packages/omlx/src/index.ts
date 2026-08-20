export const omlxBackendDescriptor = Object.freeze({
  id: "omlx",
  modelFormat: "mlx",
  transport: "http",
} as const)

export type OmlxBackendDescriptor = typeof omlxBackendDescriptor
