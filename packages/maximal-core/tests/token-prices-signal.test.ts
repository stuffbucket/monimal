/**
 * `pricedModelIsPaid` is the paid/free interpreter for Copilot's per-model
 * `token_prices` (ADR-0016, divergence 1). Since the 2026-06-01 per-token
 * billing change, `token_prices` is the PRIMARY pricing signal; the legacy
 * `is_premium` flag is only a fallback when `token_prices` is absent.
 *
 * These tests pin the contract the token-usage recorder relies on:
 *   - any advertised non-zero rate ⇒ paid (true);
 *   - present-but-all-zero ⇒ free (false);
 *   - absent / empty / non-numeric ⇒ unknown (null → caller falls back).
 *
 * The live nested shape declares its token batch size. This interpreter reads
 * only rate presence and sign, and never mistakes that batch size or a prompt
 * threshold for a positive price.
 */

import { describe, expect, test } from "bun:test"

import type { TokenPrices } from "~/services/copilot/get-models"

import { pricedModelIsPaid } from "~/services/copilot/get-models"

describe("pricedModelIsPaid", () => {
  test("a positive input rate marks the model paid", () => {
    // gpt-5-mini shape from ADR-0016: cheap but NOT free.
    const prices: TokenPrices = {
      input: 0.25,
      output: 2.0,
      cache_read: 0.025,
      cache_write: 0.3,
    }
    expect(pricedModelIsPaid(prices)).toBe(true)
  })

  test("any single non-zero rate is enough to be paid", () => {
    expect(pricedModelIsPaid({ input: 0, output: 0, cache_read: 0.01 })).toBe(
      true,
    )
  })

  test("present-but-all-zero rates read as free", () => {
    expect(
      pricedModelIsPaid({ input: 0, output: 0, cache_read: 0, cache_write: 0 }),
    ).toBe(false)
  })

  test("reads live nested tiers without treating batch size as a price", () => {
    expect(
      pricedModelIsPaid({
        batch_size: 1_000_000,
        default: {
          input_price: 0,
          max_prompt_tokens: 272_000,
          output_price: 0,
        },
      }),
    ).toBe(false)
    expect(
      pricedModelIsPaid({
        batch_size: 1_000_000,
        default: { input_price: 175, output_price: 1400 },
      }),
    ).toBe(true)
    expect(
      pricedModelIsPaid({
        batch_size: 1_000_000,
        max_prompt_tokens: 272_000,
      }),
    ).toBeNull()
  })

  test("magnitude does not matter — a per-token rate still reads paid", () => {
    // Whether the unit is per-1M ($2.00) or per-token (0.000002), any positive
    // rate is paid. This is the encoded unit-agnostic assumption.
    expect(pricedModelIsPaid({ output: 0.000002 })).toBe(true)
  })

  test("absent / empty / non-numeric token_prices is unknown (null)", () => {
    expect(pricedModelIsPaid(undefined)).toBeNull()
    expect(pricedModelIsPaid(null)).toBeNull()
    expect(pricedModelIsPaid({})).toBeNull()
    // Non-finite / non-numeric values are ignored; an all-garbage object is
    // indistinguishable from "no rates advertised".
    expect(pricedModelIsPaid({ input: Number.NaN })).toBeNull()
  })

  test("tolerates future rate keys without treating metadata as prices", () => {
    expect(pricedModelIsPaid({ some_future_price: 5 })).toBe(true)
    expect(
      pricedModelIsPaid({
        default: {
          max_prompt_tokens: 272_000,
          some_future_price: 5,
        },
      }),
    ).toBe(true)
    expect(pricedModelIsPaid({ some_future_metadata: 5 })).toBeNull()
    expect(
      pricedModelIsPaid({
        default: { max_prompt_tokens: 272_000 },
      }),
    ).toBeNull()
  })
})
