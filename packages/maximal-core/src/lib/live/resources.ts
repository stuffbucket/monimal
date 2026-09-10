/**
 * Read/aggregation helpers for the control API, re-homed into lib/ from the
 * `routes/settings` cluster and its WebSocket live feed, both deleted in the
 * core split (see docs/spec/archive/control-api-v1.md — "re-homing checklist").
 * These are the reusable core the control endpoints and the live-feed snapshot
 * are both built from; keeping them here (not in a route) means the ControlHub
 * can compose them without a lib -> routes edge.
 *
 * All field mappings are preserved byte-for-byte from the originals so a GET
 * body and a live delta carry the identical shape.
 */

import type { AuthStatus } from "~/lib/config/settings-types"
import type {
  AccountsListResponse,
  AppsListResponse,
  ModelsListResponse,
  ModelSummary,
} from "~/lib/config/settings-types"
import type { ConfiguratorRegistry } from "~/lib/configurator-host"
import type { Model } from "~/services/copilot/get-models"

import { getAllApps } from "~/apps/registry"
import { getAuthStatus } from "~/lib/auth/auth-controller"
import {
  listAccounts,
  readDefaultRegistry,
} from "~/lib/auth/github-token-store"
import { buildConfiguratorAppsList } from "~/lib/configurator-app-compat"
import { listActiveClients } from "~/lib/http/active-clients"
import { getModelsLoadedAtMs, state } from "~/lib/runtime-state/state"
import { getTokenUsageSummary } from "~/lib/token-usage"

export interface ProviderCatalogueModel {
  readonly id: string
  readonly name: string
  readonly provider: string
  readonly providerName: string
}

/** The `/control/accounts` body, from maximal's on-disk registry. */
export async function buildAccountsList(): Promise<AccountsListResponse> {
  const reg = await readDefaultRegistry()
  const accounts = listAccounts(reg).map((account) => ({
    key: account.key,
    login: account.login,
    host: account.host,
    added_via: account.addedVia,
    obtained_at: account.obtainedAt,
    active: account.active,
  }))
  return { accounts, active_key: reg.activeKey }
}

/** The `/control/apps` body — every registered client app's live details. */
export async function buildAppsList(
  configurators?: ConfiguratorRegistry,
): Promise<AppsListResponse> {
  const legacyApps = getAllApps()
  if (configurators) {
    const configured = await buildConfiguratorAppsList(configurators)
    const configuredById = new Map(configured.apps.map((app) => [app.id, app]))
    const apps = await Promise.all(
      legacyApps.map((app) =>
        Promise.resolve(configuredById.get(app.id) ?? app.getDetails()),
      ),
    )
    return { apps }
  }
  const apps = await Promise.all(legacyApps.map((app) => app.getDetails()))
  return { apps }
}

/** Flatten an upstream `Model` into the UI-shaped summary. Optional upstream
 *  fields collapse to null/false so the contract stays total. */
function toModelSummary(model: Model): ModelSummary {
  const capabilities =
    (model as { capabilities?: Partial<Model["capabilities"]> }).capabilities
    ?? {}
  const limits = capabilities.limits ?? {}
  const supports = capabilities.supports ?? {}
  return {
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    family: capabilities.family ?? "",
    type: capabilities.type ?? "",
    preview: model.preview,
    context_window_tokens: limits.max_context_window_tokens ?? null,
    max_output_tokens: limits.max_output_tokens ?? null,
    capabilities: {
      vision: supports.vision ?? false,
      tool_calls: supports.tool_calls ?? false,
      streaming: supports.streaming ?? false,
      reasoning:
        (supports.adaptive_thinking ?? false)
        || (supports.reasoning_effort?.length ?? 0) > 0,
    },
  }
}

/** The `/control/models` body from cached Copilot and live provider catalogs. */
export function buildModelsList(
  providerModels: ReadonlyArray<ProviderCatalogueModel> = [],
): ModelsListResponse {
  const models = (state.models?.data ?? []).map((model) =>
    toModelSummary(model),
  )
  const providerModelKeys = new Set<string>()
  for (const model of providerModels) {
    const key = `${model.providerName}\u0000${model.id}`
    if (providerModelKeys.has(key)) continue
    providerModelKeys.add(key)
    models.push({
      id: model.id,
      name: model.name,
      vendor: model.providerName,
      family: "",
      type: "chat",
      preview: false,
      context_window_tokens: null,
      max_output_tokens: null,
      capabilities: {
        vision: false,
        tool_calls: false,
        streaming: false,
        reasoning: false,
      },
    })
  }
  models.sort(
    (a, b) =>
      a.vendor.localeCompare(b.vendor)
      || a.type.localeCompare(b.type)
      || a.name.localeCompare(b.name),
  )
  const loadedAtMs = getModelsLoadedAtMs()
  return {
    models,
    count: models.length,
    loaded_at: loadedAtMs === null ? null : new Date(loadedAtMs).toISOString(),
  }
}

/** The full snapshot a client receives on connect (replaces the deleted
 *  buildSnapshot). Composed from the same reads the individual GETs use, so the
 *  first paint never disagrees with the first live delta. */
export interface ControlSnapshot {
  auth: AuthStatus
  accounts: AccountsListResponse
  apps: AppsListResponse
  models: ModelsListResponse
  usage: Awaited<ReturnType<typeof getTokenUsageSummary>>
  clients: { clients: ReturnType<typeof listActiveClients>; total: number }
}

export async function buildControlSnapshot(
  configurators?: ConfiguratorRegistry,
  providerModels: ReadonlyArray<ProviderCatalogueModel> = [],
): Promise<ControlSnapshot> {
  const auth = getAuthStatus()
  const [accounts, apps, usage] = await Promise.all([
    buildAccountsList(),
    buildAppsList(configurators),
    getTokenUsageSummary("day"),
  ])
  const models = buildModelsList(providerModels)
  const clients = listActiveClients()
  return {
    auth,
    accounts,
    apps,
    models,
    usage,
    clients: { clients, total: clients.length },
  }
}
