import assert from "node:assert/strict"
import test from "node:test"

import {
  TrafficAttributionMetadataSchema,
  TrafficContextMetadataSchema,
  TrafficDispatchMetadataSchema,
  TrafficErrorMetadataSchema,
  TrafficIdentityMetadataSchema,
  TrafficResponseMetadataSchema,
  TrafficRouteMetadataSchema,
  TrafficSizeMetadataSchema,
  TrafficTimingMetadataSchema,
  TrafficTokenMetadataSchema,
} from "../src/index.ts"
import { completedRequest } from "./fixtures.ts"

void test("all metadata groups accept serializable request facts", () => {
  const request = completedRequest()

  assert.deepEqual(
    TrafficIdentityMetadataSchema.parse(request.identity),
    request.identity,
  )
  assert.deepEqual(
    TrafficTimingMetadataSchema.parse(request.timing),
    request.timing,
  )
  assert.deepEqual(
    TrafficRouteMetadataSchema.parse(request.route),
    request.route,
  )
  assert.deepEqual(
    TrafficAttributionMetadataSchema.parse(request.attribution),
    request.attribution,
  )
  assert.deepEqual(
    TrafficDispatchMetadataSchema.parse(request.dispatch),
    request.dispatch,
  )
  assert.deepEqual(
    TrafficTokenMetadataSchema.parse(request.tokens),
    request.tokens,
  )
  assert.deepEqual(
    TrafficContextMetadataSchema.parse(request.context),
    request.context,
  )
  assert.deepEqual(TrafficSizeMetadataSchema.parse(request.size), request.size)
  assert.deepEqual(
    TrafficResponseMetadataSchema.parse(request.response),
    request.response,
  )
})

void test("schemas reject transport objects, content, and invalid counters", () => {
  const request = completedRequest()

  assert.throws(() =>
    TrafficRouteMetadataSchema.parse({ ...request.route, headers: {} }),
  )
  assert.throws(() =>
    TrafficIdentityMetadataSchema.parse({ ...request.identity, requestId: "" }),
  )
  assert.throws(() =>
    TrafficTokenMetadataSchema.parse({
      ...request.tokens,
      inputTokens: -1,
    }),
  )
  assert.throws(() =>
    TrafficTimingMetadataSchema.parse({
      ...request.timing,
      acceptedAt: "not-a-time",
    }),
  )
})

void test("failure metadata is bounded and runtime neutral", () => {
  assert.deepEqual(
    TrafficErrorMetadataSchema.parse({
      category: "provider",
      code: "overloaded",
      message: "provider is temporarily overloaded",
      retryable: true,
    }),
    {
      category: "provider",
      code: "overloaded",
      message: "provider is temporarily overloaded",
      retryable: true,
    },
  )

  assert.throws(() =>
    TrafficErrorMetadataSchema.parse({
      category: "provider",
      code: "overloaded",
      message: "x".repeat(1_001),
      retryable: true,
    }),
  )
})
