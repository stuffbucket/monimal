#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const FORBIDDEN_INPUT_MARKERS = [
  "/packages/anthropic-provider/",
  "/packages/omlx/",
  "/../anthropic-provider/",
  "/../omlx/",
  "/@stuffbucket/anthropic-provider/",
  "/@stuffbucket/omlx/",
  "/@deepseek-ai/cordis/",
  "/@deepseek-ai/dsh-llm/",
  "/@deepseek-ai/schemastery/",
  "/@stuffbucket+anthropic-provider@",
  "/@stuffbucket+omlx@",
  "/@deepseek-ai+cordis@",
  "/@deepseek-ai+dsh-llm@",
  "/@deepseek-ai+schemastery@",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function normalizeInput(input: string): string {
  return `/${input.replaceAll("\\", "/").replace(/^\.?\//u, "")}`
}

export function assertGenericProviderBundle(metafile: unknown): void {
  if (!isRecord(metafile) || !isRecord(metafile.inputs)) {
    throw new TypeError("Bun did not produce a valid build metafile.")
  }
  const forbidden = Object.keys(metafile.inputs).filter((input) => {
    const normalized = normalizeInput(input)
    return FORBIDDEN_INPUT_MARKERS.some((marker) => normalized.includes(marker))
  })
  if (forbidden.length > 0) {
    throw new Error(
      `Concrete or external provider runtime code entered the Maximal bundle:\n${forbidden.join("\n")}`,
    )
  }
}

async function build(): Promise<void> {
  const packageRoot = path.resolve(import.meta.dirname, "..")
  const distDirectory = path.join(packageRoot, "dist")
  const metafilePath = path.join(distDirectory, ".provider-metafile.json")
  await fs.mkdir(distDirectory, { recursive: true })
  try {
    const result = spawnSync(
      process.execPath,
      [
        "build",
        "src/main.ts",
        "--target=bun",
        "--outdir=dist",
        `--metafile=${metafilePath}`,
      ],
      { cwd: packageRoot, stdio: "inherit" },
    )
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
    const metafile: unknown = JSON.parse(await fs.readFile(metafilePath, "utf8"))
    assertGenericProviderBundle(metafile)
  } finally {
    await fs.rm(metafilePath, { force: true })
  }
}

if (import.meta.main) await build()
