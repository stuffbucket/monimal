import {
  resolveModelProfile
} from "./chunk-5T53LY3F.js";

// src/lib/models/small-model.ts
function supportsToolCalls(model) {
  return resolveModelProfile(model).supportsToolCalls;
}
function isHaikuClass(model) {
  const family = model.capabilities.family.toLowerCase();
  const id = model.id.toLowerCase();
  return (family.includes("claude") || id.startsWith("claude")) && (family.includes("haiku") || id.includes("haiku"));
}
function resolveSmallToolModel(models, configured) {
  if (configured && configured.trim().length > 0) {
    return configured;
  }
  const catalog = models ?? [];
  const haiku = catalog.find(
    (model) => isHaikuClass(model) && supportsToolCalls(model)
  );
  if (haiku) {
    return haiku.id;
  }
  const toolCapable = catalog.find((model) => supportsToolCalls(model));
  return toolCapable?.id;
}

export {
  resolveSmallToolModel
};
