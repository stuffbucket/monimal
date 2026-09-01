#!/usr/bin/env bun
/**
 * check-ci-coverage.ts — what `bun run ci:check` runs. Every step of
 * `check:deep` must also run in a required CI job, or it is a red build.
 *
 * WHY: `dupes:check` landed in `check:deep` and in no workflow (#61);
 * `.dependency-cruiser.cjs` sat in the repo, correct and uninvoked, for
 * months. A gate that runs nowhere makes the build green for free.
 *
 * THE EXPECTATION IS DERIVED, NOT RECORDED. Both sides are read from the repo
 * — `check:deep` from package.json, the steps from the workflows — so there is
 * no baseline to bump. `EXCLUDED` is the one hand-written part, and it is a
 * policy like `check-rulesets.ts`'s `EXPECTED`, not a last-reviewed value like
 * `external-drift-baseline.json`: typed, unit-tested, `why` required, and
 * stale entries fail (see below). It holds `preflight` plus the two leaf
 * commands covered through Core's composite `build` script.
 *
 * "RUNS IN CI" = named by a step of a job that is a REQUIRED status check:
 * the package jobs in `CHECK_JOBS` plus the monorepo root's required `check`
 * job. A comment is not a step, and a job that is not required — or is path-filtered
 * like tooling-ci.yml's — can be red with the merge button still green.
 * `check:deep` is composite and CI runs its constituents as separate named
 * steps, so composite members are expanded to the scripts CI actually names.
 * The match is on the invocation `bun run <script>` (arguments are not
 * compared); `bun test` is matched as the literal command.
 *
 * ONE DIRECTION ONLY. A CI step that is not in `check:deep` does not fail
 * here. CI legitimately runs what `check:deep` cannot — `bun install`, the
 * Windows artifact leg, `test:ops` — so the reverse assertion would need a
 * second, churnier exclusion list to buy nothing: those steps do run, and are
 * blocking. The hole this closes is a check that runs NOWHERE.
 *
 * Exit codes: 0 every member is covered · 1 a member runs in no required job,
 * or `EXCLUDED` is stale · 2 the repo could not be read (a renamed job, an
 * unparseable script).
 */

import fs from "node:fs"

import { CHECK_JOBS, repoPath } from "./check-rulesets"

/** A `check:deep` member deliberately not run in CI. `why` is mandatory. */
export interface Exclusion {
  /** The script name, or the raw command, as `check:deep` runs it. */
  readonly step: string
  /** A composite ancestor a required job must invoke for this exclusion to hold. */
  readonly coveredBy?: string
  /** When set, only this required job may satisfy `coveredBy`. */
  readonly requiredJob?: string
  readonly why: string
}

/**
 * An entry here is a claim that a check does not belong in CI, and it is
 * checked in both directions — a step that is excluded but does run, or that
 * `check:deep` no longer runs at all, fails this gate rather than lingering.
 */
export const ROOT_BUILD_JOB_LABEL = "check (root .github/workflows/ci.yml)"

export const EXCLUDED: ReadonlyArray<Exclusion> = [
  {
    step: "preflight",
    why: "asserts node_modules exists, which every CI job establishes with `bun install` before it runs anything; in CI it could only ever be a no-op, and a guard that can trip there is a guard someone deletes",
  },
  {
    step: "bun scripts/ops/build-bundle.ts",
    coveredBy: "build",
    requiredJob: ROOT_BUILD_JOB_LABEL,
    why: "runs through the package's composite `build` script, which the required root CI job must invoke through its `turbo run build` task",
  },
  {
    step: "build:lib",
    coveredBy: "build",
    requiredJob: ROOT_BUILD_JOB_LABEL,
    why: "runs through the package's composite `build` script, which the required root CI job must invoke through its `turbo run build` task",
  },
]

// --- what check:deep runs ---

/** One command `check:deep` ultimately runs. */
export interface Step {
  /** `<script>` for `bun run <script>`, else the raw command. Its identity. */
  readonly name: string
  /** True when `name` is a package.json script rather than a raw command. */
  readonly isScript: boolean
  /** Scripts it was reached through, `check:deep` first. */
  readonly via: ReadonlyArray<string>
}

/** `&&` is the whole grammar this reads; anything else is refused, not guessed. */
const isUnparseable = (body: string): boolean => /[|;&]/u.test(body.replaceAll("&&", ""))

/**
 * `check:deep` flattened to the commands CI has to name. A member that is
 * itself a composite script (`check:fast`) is expanded, because CI runs its
 * constituents as separate steps; a single-command script is not, because CI
 * invokes it by name.
 */
export function expand(
  scripts: Readonly<Record<string, string>>,
  entry = "check:deep",
  via: ReadonlyArray<string> = [],
): Array<Step> {
  const body = scripts[entry]
  if (body === undefined) throw new Error(`package.json has no \`${entry}\` script`)
  if (via.includes(entry)) throw new Error(`\`${entry}\` is defined in terms of itself`)
  if (isUnparseable(body)) {
    throw new Error(
      `\`${entry}\` uses shell this check cannot read (only \`&&\` is supported): ${body}`,
    )
  }

  const chain = [...via, entry]
  const out: Array<Step> = []
  for (const part of body.split("&&").map((p) => p.trim())) {
    if (part === "") continue
    const script = /^bun run (\S+)/u.exec(part)?.[1]
    if (script !== undefined && (scripts[script] ?? "").includes("&&")) {
      out.push(...expand(scripts, script, chain))
      continue
    }
    out.push({ name: script ?? part, isScript: script !== undefined, via: chain })
  }
  return out
}

// --- what a required job runs ---

/** A required status check's job, and every shell line its steps execute. */
export interface Job {
  /** `<job id> (<workflow path>)`, as reported. */
  readonly label: string
  readonly commands: ReadonlyArray<string>
}

/**
 * The lines of one top-level job. Textual, for the reason check-rulesets.ts
 * gives: the ops lane has no `node_modules`, so a YAML parser here would mean a
 * new install in three workflows.
 */
export function jobBlock(yaml: string, jobId: string): string | undefined {
  const lines = yaml.split("\n")
  const start = lines.findIndex((l) => l.startsWith(`  ${jobId}:`))
  if (start < 0) return undefined
  const out: Array<string> = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*$/u.test(line)) {
      out.push(line)
      continue
    }
    if (/^ {0,2}\S/u.test(line)) break // column 0 or another job id
    out.push(line)
  }
  return out.join("\n")
}

/**
 * The shell commands a block's `run:` steps execute, with one entry per scalar
 * and YAML comments dropped. Block scalars retain their marker and physical-line
 * grouping: a continued conditional must not turn a later line into apparent
 * standalone execution. A `bun run x` inside a `#` comment is documentation,
 * and this check exists precisely because documentation and execution drift apart.
 */
export function runLines(block: string): Array<string> {
  const lines = block.split("\n")
  const out: Array<string> = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ""
    if (/^\s*#/u.test(line)) continue
    const key = /^(\s*(?:- )?)run:(.*)$/u.exec(line)
    if (!key) continue
    const indent = (key[1] ?? "").length
    const inline = (key[2] ?? "").trim()
    if (inline !== "" && !/^[|>][+-]?$/u.test(inline)) {
      out.push(inline)
      continue
    }
    const command: Array<string> = []
    for (i += 1; i < lines.length; i += 1) {
      const body = lines[i] ?? ""
      if (body.trim() === "") continue
      if (body.search(/\S/u) <= indent) break
      if (!/^\s*#/u.test(body)) command.push(body.trim())
    }
    if (command.length > 0) out.push(`${inline}\n${command.join("\n")}`)
    i -= 1
  }
  return out
}

const escape = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)

/** A simple shell literal, or undefined when shell evaluation would be required. */
function shellLiteral(value: string): string | undefined {
  const singleQuoted = /^'([^']*)'$/u.exec(value)?.[1]
  if (singleQuoted !== undefined) return singleQuoted

  const doubleQuoted = /^"([^"\\$`]*)"$/u.exec(value)?.[1]
  if (doubleQuoted !== undefined) return doubleQuoted

  if (/['"\\$`|;&()<>]/u.test(value)) return undefined
  return value
}

/** Whether a root Turbo invocation runs a package script for Core. */
function runsTurboTask(command: string, task: string): boolean {
  // `pnpm exec` is how a workflow `run:` block reaches the workspace-local
  // turbo binary: bare `turbo` is not on PATH there. Stripping the prefix keeps
  // this a direct invocation -- the operator check below still fails closed.
  const direct = command.trim().replace(/^pnpm\s+exec\s+/u, "")
  if (!/^turbo\s+run(?:\s|$)/u.test(direct)) return false
  // This is evidence only for a direct invocation. Shell composition can make
  // the text present without executing Turbo, so operators and evaluation fail closed.
  if (/[\r\n|;&#$`\\()<>]/u.test(direct)) return false

  const words = direct.split(/\s+/u)
  for (let i = 0; i < words.length - 1; i += 1) {
    if (words[i] !== "turbo" || words[i + 1] !== "run") continue

    let runsTask = false
    let readingTasks = true
    const filters: Array<string> = []
    for (let j = i + 2; j < words.length; j += 1) {
      const word = words[j] ?? ""
      if (/[|;&]/u.test(word)) break
      if (word.startsWith("-")) readingTasks = false
      if (readingTasks && word === task) runsTask = true

      const inlineFilter = /^(?:--filter=|-F=?)(.+)$/u.exec(word)?.[1]
      if (inlineFilter !== undefined) {
        const filter = shellLiteral(inlineFilter)
        if (filter === undefined) return false
        filters.push(filter)
        continue
      }
      if (word === "--filter" || word === "-F") {
        const rawFilter = words[j + 1]
        if (rawFilter === undefined || rawFilter.startsWith("-") || /[|;&]/u.test(rawFilter)) {
          return false
        }
        const filter = shellLiteral(rawFilter)
        if (filter === undefined) return false
        filters.push(filter)
        j += 1
        continue
      }
      if (word.startsWith("--filter") || word.startsWith("-F")) return false
      // Any other flag is fail-closed: Turbo can add scope or execution modes
      // (`--affected`, `--dry`) whose presence means this command proves no build.
      if (word.startsWith("-")) return false
      const literal = shellLiteral(word)
      if (literal === undefined || literal !== word) return false
    }

    if (!runsTask) continue
    if (filters.length === 0) return true
    if (filters.some((filter) => filter.startsWith("!"))) return false
    return filters.includes("@stuffbucket/maximal-core")
  }
  return false
}

/** Whether `commands` invoke `step` — by script name, Turbo task, or literal command. */
export function runsStep(commands: ReadonlyArray<string>, step: Step): boolean {
  const pattern = step.isScript
    ? new RegExp(String.raw`(?:^|[\s(])bun run ${escape(step.name)}(?![\w:./-])`, "u")
    : new RegExp(String.raw`(?:^|[\s(])${escape(step.name)}(?:\s+-|\s*$)`, "u")
  return commands.some(
    (command) => pattern.test(command) || (step.isScript && runsTurboTask(command, step.name)),
  )
}

// --- evaluation (pure) ---

export interface Report {
  readonly covered: Array<{ step: Step; jobs: Array<string> }>
  readonly missing: Array<Step>
  readonly excluded: Array<Exclusion>
  /** An `EXCLUDED` entry that no longer describes reality. Blocking. */
  readonly stale: Array<string>
}

export function coverage(
  steps: ReadonlyArray<Step>,
  jobs: ReadonlyArray<Job>,
  excluded: ReadonlyArray<Exclusion> = EXCLUDED,
): Report {
  const report: Report = { covered: [], missing: [], excluded: [], stale: [] }

  for (const step of steps) {
    const where = jobs.filter((job) => runsStep(job.commands, step)).map((job) => job.label)
    const exclusion = excluded.find((e) => e.step === step.name)
    if (exclusion) {
      report.excluded.push(exclusion)
      if (where.length > 0) {
        report.stale.push(
          `\`${step.name}\` is excluded — "${exclusion.why}" — but ${where.join(", ")} runs it. Delete the exclusion.`,
        )
      }
      if (exclusion.coveredBy !== undefined) {
        if (!step.via.includes(exclusion.coveredBy)) {
          report.stale.push(
            `\`${step.name}\` claims coverage through \`${exclusion.coveredBy}\`, but that script is not an ancestor in check:deep. Fix or delete the exclusion.`,
          )
        } else {
          const parent = { name: exclusion.coveredBy, isScript: true, via: step.via }
          const parentJobs = jobs
            .filter(
              (job) =>
                (exclusion.requiredJob === undefined || job.label === exclusion.requiredJob) &&
                runsStep(job.commands, parent),
            )
            .map((job) => job.label)
          if (parentJobs.length === 0) {
            const required = exclusion.requiredJob ?? "a required job"
            report.stale.push(
              `\`${step.name}\` is excluded only through parent \`${exclusion.coveredBy}\`, but ${required} does not invoke that parent (directly or as a root Turbo task).`,
            )
          }
        }
      }
      continue
    }
    if (where.length === 0) report.missing.push(step)
    else report.covered.push({ step, jobs: where })
  }

  const names = new Set(steps.map((s) => s.name))
  for (const entry of excluded) {
    if (!names.has(entry.step)) {
      report.stale.push(
        `\`${entry.step}\` is excluded but \`check:deep\` no longer runs it. Delete the exclusion.`,
      )
    }
  }

  return report
}

export const exitCodeFor = (report: Report): number =>
  report.missing.length > 0 || report.stale.length > 0 ? 1 : 0

export function render(report: Report, jobs: ReadonlyArray<Job>): string {
  const lines: Array<string> = []
  for (const { step, jobs: where } of report.covered) {
    lines.push(`ok      ${step.name.padEnd(22)} ${where.join(", ")}`)
  }
  for (const entry of report.excluded) {
    lines.push(`skip    ${entry.step.padEnd(22)} excluded: ${entry.why}`)
  }
  for (const step of report.missing) {
    const via = step.via.slice(1)
    lines.push(
      `MISSING ${step.name.padEnd(22)} ${via.length > 0 ? `via ${via.join(" > ")}; ` : ""}no required job runs ${step.isScript ? `\`bun run ${step.name}\`` : `\`${step.name}\``}`,
    )
  }
  for (const problem of report.stale) lines.push(`STALE   ${problem}`)

  if (report.missing.length > 0) {
    lines.push(
      "",
      `Every \`check:deep\` step must run in one of: ${jobs.map((j) => j.label).join(", ")}.`,
      "Add a step to the workflow, or record the step in `EXCLUDED` in this file with the reason it does not belong in CI.",
    )
  }
  return lines.join("\n")
}

// --- entry point ---

/** The required jobs, read from disk. Throws if a job named as required is gone. */
export function readJobs(
  check: ReadonlyArray<{ context: string; workflow: string }> = CHECK_JOBS,
): Array<Job> {
  const packageJobs = check.map(({ context, workflow }) => {
    const block = jobBlock(fs.readFileSync(repoPath(workflow), "utf8"), context)
    if (block === undefined) {
      throw new Error(
        `${workflow} defines no \`${context}\` job, but \`${context}\` is a required status check (see CHECK_JOBS in check-rulesets.ts).`,
      )
    }
    return { label: `${context} (${workflow})`, commands: runLines(block) }
  })

  const rootWorkflow = ".github/workflows/ci.yml"
  const rootContext = "check"
  const rootBlock = jobBlock(
    fs.readFileSync(repoPath(`../../${rootWorkflow}`), "utf8"),
    rootContext,
  )
  if (rootBlock === undefined) {
    throw new Error(
      `${rootWorkflow} defines no \`${rootContext}\` job, but that root job is required to cover Core's composite build.`,
    )
  }

  return [
    ...packageJobs,
    { label: ROOT_BUILD_JOB_LABEL, commands: runLines(rootBlock) },
  ]
}

export function readScripts(): Record<string, string> {
  const pkg = JSON.parse(fs.readFileSync(repoPath("package.json"), "utf8")) as {
    scripts?: Record<string, string>
  }
  return pkg.scripts ?? {}
}

if (import.meta.main) {
  try {
    const jobs = readJobs()
    const report = coverage(expand(readScripts()), jobs)
    console.error(render(report, jobs))
    const code = exitCodeFor(report)
    if (code === 0) console.error("Every `check:deep` step runs in a required CI job.")
    process.exit(code)
  } catch (err) {
    console.error(`check-ci-coverage: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}
