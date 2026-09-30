import { copilotBaseUrl, copilotModelsHeaders } from "~/lib/config/api-config"
import { HTTPError } from "~/lib/errors/error"
import { GITHUB_API_TIMEOUT_MS } from "~/lib/http/http-timeouts"
import { sendRequest } from "~/lib/http/send-request"
import { runtimeLogger } from "~/lib/platform/runtime-logger"
import { state } from "~/lib/runtime-state/state"

export const getModels = async () => {
  runtimeLogger.info(`Fetching models from ${copilotBaseUrl(state)}/models`)
  const response = await sendRequest(`${copilotBaseUrl(state)}/models`, {
    headers: copilotModelsHeaders(state),
    // Bounded like the other auth/discovery fetches — cacheModels runs on the
    // cold-boot critical path, so an unbounded hang here would stall boot.
    timeoutMs: GITHUB_API_TIMEOUT_MS,
  })

  if (!response.ok) {
    const errorText = await response.clone().text()

    runtimeLogger.error("Failed to get models response body", errorText)

    throw new HTTPError("Failed to get models", response)
  }

  const parsed = (await response.json()) as Partial<ModelsResponse>
  return {
    ...parsed,
    object: parsed.object ?? "list",
    data: (parsed.data ?? []).map((model) => normalizeModel(model)),
  }
}

/**
 * Copilot's catalog is not uniform: some entries omit `capabilities`, or
 * `capabilities.limits` / `capabilities.supports`, even though the static
 * `Model` type declares them required. The rest of the app trusts that
 * shape — the boot-time model filter, thinking-budget math, `max_tokens`
 * auto-fill — so a single sparse entry used to throw and take down the
 * whole critical path (a failed catalog refresh leaves no usable models).
 *
 * Normalize once here, at the single fetch boundary every consumer reads
 * through, so the container objects are guaranteed present. We deliberately
 * do NOT invent leaf values: a genuinely-absent `max_context_window_tokens`
 * stays `undefined` so the UI renders it as "missing" rather than a made-up
 * number. The principle: secondary metadata gaps degrade gracefully; they
 * never error out the critical path.
 */
export function normalizeModel(raw: Model): Model {
  const capabilities =
    (raw as { capabilities?: Partial<ModelCapabilities> }).capabilities ?? {}
  return {
    ...raw,
    capabilities: {
      family: capabilities.family ?? "",
      type: capabilities.type ?? "",
      ...(capabilities.tokenizer === undefined ?
        {}
      : { tokenizer: capabilities.tokenizer }),
      object: capabilities.object ?? "model_capabilities",
      limits: capabilities.limits ?? {},
      supports: capabilities.supports ?? {},
    },
  }
}

export interface ModelsResponse {
  data: Array<Model>
  object: string
}

interface ModelLimits {
  max_context_window_tokens?: number
  max_inputs?: number
  max_non_streaming_output_tokens?: number
  max_output_tokens?: number
  max_prompt_tokens?: number
  vision?: {
    max_prompt_image_size?: number
    max_prompt_images?: number
    supported_media_types?: Array<string>
  }
}

interface ModelSupports {
  max_thinking_budget?: number
  min_thinking_budget?: number
  tool_calls?: boolean
  parallel_tool_calls?: boolean
  dimensions?: boolean
  streaming?: boolean
  structured_outputs?: boolean
  vision?: boolean
  adaptive_thinking?: boolean
  context_editing?: boolean
  reasoning_effort?: Array<string>
  [key: string]: unknown
}

interface ModelCapabilities {
  family: string
  limits: ModelLimits
  object: string
  supports: ModelSupports
  tokenizer?: string
  type: string
}

export interface Model {
  capabilities: ModelCapabilities
  id: string
  info_messages?: Array<ModelMessage>
  is_chat_default?: boolean
  is_chat_fallback?: boolean
  model_picker_category?: string
  model_picker_enabled: boolean
  model_picker_price_category?: string
  name: string
  object: string
  preview: boolean
  vendor: string
  version: string
  policy?: {
    state: string
    terms: string
  }
  supported_endpoints?: Array<string>
  warning_messages?: Array<ModelMessage>
  /** Per-model billing metadata — Copilot-specific (see ADR-0016,
   *  divergence 1). A second provider would carry its own price sheet or
   *  none; nothing here transfers.
   *
   *  PRIMARY signal: `token_prices`. Since the 2026-06-01 per-token billing
   *  change, Copilot advertises per-model rates here. A model with any
   *  non-zero rate is paid — this is what pricing/premium inference should
   *  key on (see `resolveIsPaid` in `src/lib/token-usage/index.ts`).
   *
   *  LEGACY fallback: `is_premium` / `multiplier`. Under usage-based billing
   *  Copilot warns the multiplier no longer applies and `is_premium === false`
   *  no longer means "free" (e.g. gpt-5-mini is cheap-but-not-free). These are
   *  retained only for annual-plan accounts that still lack `token_prices`.
   *  (The actual per-request cost is `copilot_usage.total_nano_aiu` on
   *  completions — captured separately, not from this field.) */
  billing?: {
    auto_discount?: number
    /** LEGACY. Premium-quota flag; unreliable under usage-based billing. */
    is_premium?: boolean
    /** LEGACY. Per-model multiplier; retained for annual plans only. */
    multiplier?: number
    restricted_to?: Array<string>
    /** PRIMARY. Per-model token rates. The live response includes an explicit
     *  token batch size but does not state a currency. */
    token_prices?: TokenPrices
  }
}

export interface ModelMessage {
  code: string
  message: string
}

/**
 * Copilot's per-model `token_prices` (Copilot-specific — ADR-0016 div. 1).
 *
 * The current live shape carries an explicit `batch_size` and named default
 * and long-context tiers. Older annual-plan responses used flat rate keys, so
 * both forms remain accepted. The response does not state a currency; callers
 * retaining magnitude must not infer one.
 */
export interface TokenPrices {
  /** Number of tokens represented by each advertised amount. */
  batch_size?: number
  /** Current default rate tier. */
  default?: TokenPriceTier
  /** Rate tier used above the default tier's prompt threshold. */
  long_context?: TokenPriceTier
  /** Uncached input tokens. */
  input?: number
  /** Cache-read (cached input) tokens. */
  cache_read?: number
  /** Cache-write tokens. */
  cache_write?: number
  /** Output tokens. */
  output?: number
  [key: string]: number | TokenPriceTier | undefined
}

export interface TokenPriceTier {
  cache_read_price?: number
  cache_write_1h_price?: number
  cache_write_price?: number
  input_price?: number
  max_prompt_tokens?: number
  output_price?: number
  [key: string]: number | undefined
}

function tokenPriceTierRates(tier: TokenPriceTier | undefined): Array<number> {
  if (tier === undefined) return []
  return Object.entries(tier)
    .filter(([key]) => key.endsWith("_price"))
    .map(([, value]) => value)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    )
}

/**
 * Interpret a model's `token_prices` as the paid/free signal.
 *
 * Returns:
 *   - `true`  — at least one advertised rate is > 0 ⇒ the model is paid.
 *   - `false` — `token_prices` is present but every numeric rate is 0
 *               (a genuinely free model under usage-based billing).
 *   - `null`  — no usable `token_prices` (absent, empty, or all-non-numeric);
 *               the caller should fall back to the legacy `is_premium` signal.
 *
 * We read only presence + sign, never magnitude, so the per-token-vs-per-1M
 * unit question does not affect this result (see `TokenPrices` for the encoded
 * unit assumption). Copilot-specific: a future provider needs its own mapping.
 */
export function pricedModelIsPaid(
  prices: TokenPrices | null | undefined,
): boolean | null {
  if (!prices) return null
  const legacyRates = Object.entries(prices)
    .filter(
      ([key]) =>
        ["cache_read", "cache_write", "input", "output"].includes(key)
        || key.endsWith("_price"),
    )
    .map(([, value]) => value)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    )
  const rates = [
    ...legacyRates,
    ...tokenPriceTierRates(prices.default),
    ...tokenPriceTierRates(prices.long_context),
  ]
  if (rates.length === 0) return null
  return rates.some((rate) => rate > 0)
}
