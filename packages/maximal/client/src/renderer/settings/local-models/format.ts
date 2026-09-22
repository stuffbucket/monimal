import type { LocalModelCatalogEntry } from "../../../shared/bridge-types";

import type { ActiveOperation } from "./types";

export function formatBytes(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "unit",
    unit: "byte",
    unitDisplay: "narrow",
  }).format(value);
}

export function publicationLabel(model: LocalModelCatalogEntry): string {
  if (model.publication === "aggregate")
    return "Published in aggregate catalogues";
  if (model.publication === "provider") {
    return "Published by its configured provider";
  }
  return "Not published in model catalogues";
}

export function progressLabel(operation: ActiveOperation): string | null {
  if (operation.phase === undefined) return null;
  const phase = `${operation.phase[0]?.toUpperCase() ?? ""}${operation.phase.slice(1)}`;
  if (
    operation.completedBytes === undefined ||
    operation.totalBytes === undefined ||
    operation.totalBytes === 0
  ) {
    return `${phase}…`;
  }
  return `${phase} ${formatBytes(operation.completedBytes)} of ${formatBytes(operation.totalBytes)}`;
}

export function ollamaEndpointLocation(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(host)
      ? "Ollama server on this device"
      : "Ollama server at a remote endpoint";
  } catch {
    return "Configured Ollama endpoint";
  }
}
