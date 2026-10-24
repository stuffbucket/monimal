import type {
  ModelConnectionBinding,
  ModelConnectionReview,
  ModelConnectionSelection,
} from "@maximal/maximal-core-contract/control"

import {
  ModelConnectionBindingSchema,
  ModelConnectionReviewSchema,
} from "@maximal/maximal-core-contract/control"
import { createHash, randomUUID } from "node:crypto"

import { isLoopbackAddress } from "~/lib/auth/request-auth"
import { canonicalJson } from "~/lib/local-model-setup/digest"

const MAX_EVIDENCE_AGE_MS = 60_000

function endpointUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new Error("The connection destination is invalid. Review it again.")
  }
}

function assertTransport(binding: ModelConnectionBinding): void {
  const url = endpointUrl(binding.endpoint.url)
  const loopback = isLoopbackAddress(url.hostname.replaceAll(/^\[|\]$/gu, ""))
  if (binding.transport === "loopback") {
    if (!loopback || binding.selection.location !== "device") {
      throw new Error(
        "A loopback transport does not establish remote execution access. Review an authenticated tunnel or TLS destination.",
      )
    }
    return
  }
  if (binding.auth.kind !== "credential-reference") {
    throw new Error(
      "Remote connections require authenticated, encrypted transport.",
    )
  }
  if (binding.transport === "tls" && url.protocol !== "https:") {
    throw new Error("TLS connections require an HTTPS destination.")
  }
  if (binding.transport === "authenticated-tunnel" && !loopback) {
    throw new Error(
      "The reviewed tunnel must terminate at a literal loopback destination.",
    )
  }
}

/** Only trusted transaction readers may supply the binding, never RPC params. */
export function validateConnectionBinding(
  value: ModelConnectionBinding,
  selection: ModelConnectionSelection,
  now: number,
): ModelConnectionBinding {
  const binding = ModelConnectionBindingSchema.parse(value)
  if (
    canonicalJson(binding.selection) !== canonicalJson(selection)
    || binding.endpoint.id !== selection.endpointId
    || binding.runtime.id !== selection.runtimeId
    || canonicalJson(binding.models.map(({ id }) => id).toSorted())
      !== canonicalJson([...selection.modelIds].toSorted())
  ) {
    throw new Error(
      "The authoritative connection no longer matches the selected deployment. Review it again.",
    )
  }
  if (binding.runtimeState !== "installed") {
    throw new Error(
      "The reviewed runtime is not installed. Connecting cannot install adapters.",
    )
  }
  if (binding.providerMode !== binding.requiredProviderMode) {
    throw new Error(
      "This connection requires a different provider mode. Connecting cannot switch modes.",
    )
  }
  if (binding.policy.state !== "allowed") {
    throw new Error("Current policy does not authorize this connection.")
  }
  const observed = Date.parse(binding.observedAt)
  if (
    observed > now
    || now - observed >= MAX_EVIDENCE_AGE_MS
    || Date.parse(binding.expiresAt) <= now
  ) {
    throw new Error(
      "Connection evidence is stale. Refresh discovery and review again.",
    )
  }
  const credentialId =
    binding.auth.kind === "none" ? null : binding.auth.credentialId
  if (credentialId !== selection.credentialId) {
    throw new Error(
      "The credential reference changed. Review the destination again.",
    )
  }
  if (
    credentialId === null ?
      binding.credentialDestination !== null
    : binding.credentialDestination === null
      || endpointUrl(binding.credentialDestination).origin
        !== endpointUrl(binding.endpoint.url).origin
  ) {
    throw new Error("The credential is not scoped to this exact destination.")
  }
  assertTransport(binding)
  return binding
}

function reviewDigest(body: Omit<ModelConnectionReview, "digest">): string {
  return `sha256:${createHash("sha256").update(canonicalJson(body)).digest("hex")}`
}

/** Canonical, immutable review covering every host fact and requested identity. */
export function createConnectionReview(
  value: ModelConnectionBinding,
  selection: ModelConnectionSelection,
  now: number,
): ModelConnectionReview {
  const binding = validateConnectionBinding(value, selection, now)
  const body = {
    schemaVersion: 1 as const,
    id: randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(
      Math.min(
        Date.parse(binding.expiresAt),
        Date.parse(binding.observedAt) + MAX_EVIDENCE_AGE_MS,
      ),
    ).toISOString(),
    binding,
  }
  return ModelConnectionReviewSchema.parse({
    ...body,
    digest: reviewDigest(body),
  })
}

/** Run inside the authoritative lock immediately before releasing credentials. */
export function assertConnectionReviewCurrent(
  review: ModelConnectionReview,
  current: ModelConnectionBinding,
  now: number,
): void {
  const { digest, ...body } = ModelConnectionReviewSchema.parse(review)
  if (
    reviewDigest(body) !== digest
    || Date.parse(review.createdAt) > now
    || Date.parse(review.expiresAt) <= now
  ) {
    throw new Error(
      "The connection review expired or changed. Review it again.",
    )
  }
  const binding = validateConnectionBinding(
    current,
    review.binding.selection,
    now,
  )
  if (canonicalJson(binding) !== canonicalJson(review.binding)) {
    throw new Error(
      "The deployment, runtime, policy, transport, or credential scope changed. Review the connection again.",
    )
  }
}
