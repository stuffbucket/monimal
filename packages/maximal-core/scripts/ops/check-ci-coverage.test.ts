import { describe, expect, test } from "bun:test"

import {
  coverage,
  EXCLUDED,
  exitCodeFor,
  expand,
  type Job,
  jobBlock,
  readJobs,
  readScripts,
  render,
  ROOT_BUILD_JOB_LABEL,
  runLines,
  runsStep,
  type Step,
} from "./check-ci-coverage"

// Offline and deterministic: every function here is pure over strings, and the
// live block at the end reads this repo's own package.json and workflows.

const SCRIPTS = {
  "check:deep": "bun run check:fast && bun test && bun run knip && bun run dupes:check",
  "check:fast": "bun run lint:fast && bun run typecheck",
  "lint:fast": "oxlint",
  typecheck: "tsc",
  knip: "knip-bun",
  "dupes:check": "bun scripts/check-dupes.ts",
}

const step = (name: string, isScript = true): Step => ({ name, isScript, via: ["check:deep"] })

const job = (label: string, ...commands: Array<string>): Job => ({ label, commands })

describe("expanding check:deep", () => {
  test("a composite member becomes the scripts CI names, a simple one stays whole", () => {
    expect(expand(SCRIPTS).map((s) => s.name)).toEqual([
      "lint:fast",
      "typecheck",
      "bun test",
      "knip",
      "dupes:check",
    ])
  })

  test("a raw command is a step too, and is marked as one", () => {
    const found = expand(SCRIPTS).find((s) => s.name === "bun test")
    expect(found?.isScript).toBe(false)
  })

  test("the chain that reached a step is recorded, for the failure message", () => {
    expect(expand(SCRIPTS).find((s) => s.name === "lint:fast")?.via).toEqual([
      "check:deep",
      "check:fast",
    ])
  })

  test("shell beyond `&&` is refused, not guessed at", () => {
    expect(() => expand({ "check:deep": "bun test || true" })).toThrow(/cannot read/u)
    expect(() => expand({ "check:deep": "bun test; bun run knip" })).toThrow(/cannot read/u)
    expect(() => expand({ "check:deep": "bun test | tee log" })).toThrow(/cannot read/u)
  })

  test("a missing or self-referential script throws rather than reporting coverage", () => {
    expect(() => expand({}, "check:deep")).toThrow(/no `check:deep` script/u)
    expect(() => expand({ "check:deep": "bun run a && bun run b", a: "x && y", b: "z" }, "a")).toBeDefined()
    expect(() => expand({ "check:deep": "bun run check:deep && bun test" })).toThrow(/itself/u)
  })
})

describe("reading a job's steps", () => {
  const WORKFLOW = [
    "jobs:",
    "  test:",
    "    steps:",
    "      # `bun run knip` in a comment is documentation, not a step.",
    "      - name: Lint",
    "        run: bun run lint:all",
    "      - name: Several",
    "        run: |",
    "          set -euo pipefail",
    "          # bun run casts:check",
    "          bun run build",
    "",
    "      - name: Folded",
    "        run: >-",
    "          bun run deps:check",
    "  windows:",
    "    steps:",
    "      - run: bun test",
  ].join("\n")

  test("a block ends at the next job id", () => {
    expect(jobBlock(WORKFLOW, "test")).toContain("bun run lint:all")
    expect(jobBlock(WORKFLOW, "test")).not.toContain("bun test")
    expect(jobBlock(WORKFLOW, "windows")).toContain("bun test")
  })

  test("an absent job is distinguishable from an empty one", () => {
    expect(jobBlock(WORKFLOW, "gate")).toBeUndefined()
  })

  test("inline, block and folded scalars are all read; comments are not", () => {
    const lines = runLines(jobBlock(WORKFLOW, "test") ?? "")
    expect(lines).toEqual([
      "bun run lint:all",
      "|\nset -euo pipefail\nbun run build",
      ">-\nbun run deps:check",
    ])
    expect(runsStep(lines, step("build"))).toBe(true)
    expect(runsStep(lines, step("deps:check"))).toBe(true)
  })

  test("a step named only in a comment does not count as running", () => {
    const lines = runLines(jobBlock(WORKFLOW, "test") ?? "")
    expect(runsStep(lines, step("knip"))).toBe(false)
    expect(runsStep(lines, step("casts:check"))).toBe(false)
  })

  test("block-scalar continuation context cannot masquerade as direct Turbo", () => {
    const workflow = [
      "jobs:",
      "  check:",
      "    steps:",
      "      - run: |",
      "          true ||",
      "            turbo run build typecheck lint",
      "      - run: |",
      "          false &&",
      "            turbo run build typecheck lint",
      "      - run: |",
      "          printf ok \\",
      "            turbo run build typecheck lint",
      "      - run: |",
      "          turbo run build typecheck lint",
    ].join("\n")
    const lines = runLines(jobBlock(workflow, "check") ?? "")
    expect(lines).toHaveLength(4)
    expect(runsStep(lines, step("build"))).toBe(false)
  })
})

describe("matching an invocation", () => {
  // `build:lib` must not satisfy `build`. The examples are real script names
  // on purpose: a fixture naming a script this repo does not have reads as a
  // covered case and proves nothing about the ones it does.
  test("a longer script name does not satisfy a shorter one", () => {
    expect(runsStep(["bun run build:lib"], step("build"))).toBe(false)
    expect(runsStep(["bun run build"], step("build"))).toBe(true)
  })

  test("arguments are not compared — the assertion is that the check runs", () => {
    expect(runsStep(["bun run deps:check --list"], step("deps:check"))).toBe(true)
  })

  test("the current unfiltered root Turbo command invokes Core's package script", () => {
    const actualRequiredRootCommand = "pnpm exec turbo run build typecheck lint"
    expect(runsStep([actualRequiredRootCommand], step("build"))).toBe(true)
    expect(runsStep(["turbo run build typecheck lint"], step("build"))).toBe(true)
    expect(runsStep(["pnpm exec turbo run typecheck lint"], step("build"))).toBe(false)
    expect(runsStep(["pnpm exec turbo run build:lib typecheck lint"], step("build"))).toBe(false)
  })

  test("only `pnpm exec` is unwrapped — other indirection is not execution evidence", () => {
    for (const command of [
      "pnpm run turbo run build",
      "pnpm dlx turbo run build",
      "npx turbo run build",
      "pnpm exec echo turbo run build",
    ]) {
      expect(runsStep([command], step("build"))).toBe(false)
    }
  })

  test("Turbo text that is not a direct invocation proves no coverage", () => {
    for (const command of [
      "echo turbo run build typecheck lint",
      "false && turbo run build typecheck lint",
      "turbo run build typecheck lint | cat",
      "turbo run build typecheck lint; true",
      "turbo run build typecheck lint # not execution evidence",
      "turbo run build typecheck lint || true",
      "turbo run build typecheck lint $(printf ignored)",
    ]) {
      expect(runsStep([command], step("build"))).toBe(false)
    }
  })

  test("a filtered root Turbo task counts only when the filter includes Core", () => {
    expect(runsStep(["turbo run build --filter=maximal-site"], step("build"))).toBe(false)
    expect(
      runsStep(["turbo run build --filter=@stuffbucket/maximal-core"], step("build")),
    ).toBe(true)
    expect(
      runsStep(["turbo run build --filter @stuffbucket/maximal-core"], step("build")),
    ).toBe(true)
    expect(
      runsStep(["turbo run build --filter='@stuffbucket/maximal-core'"], step("build")),
    ).toBe(true)
    expect(
      runsStep(["turbo run build --filter \"@stuffbucket/maximal-core\""], step("build")),
    ).toBe(true)
  })

  test("negative Turbo filters fail closed even alongside a Core filter", () => {
    const positive = "--filter=@stuffbucket/maximal-core"
    for (const negative of [
      "--filter=!@stuffbucket/maximal-core",
      "--filter='!@stuffbucket/maximal-core'",
      '--filter="!@stuffbucket/maximal-core"',
      "'--filter=!@stuffbucket/maximal-core'",
      '"--filter=!@stuffbucket/maximal-core"',
    ]) {
      expect(runsStep([`turbo run build ${positive} ${negative}`], step("build"))).toBe(false)
    }
  })

  test("malformed or evaluated Turbo filters cannot establish Core coverage", () => {
    for (const filter of [
      "--filter='@stuffbucket/maximal-core",
      '--filter="$CORE_PACKAGE"',
      "--filter=@stuffbucket/maximal-core'",
      "--filter=",
    ]) {
      expect(runsStep([`turbo run build ${filter}`], step("build"))).toBe(false)
    }
  })

  test("scope-changing, dry-run, and unknown Turbo flags fail closed", () => {
    for (const suffix of [
      "--affected",
      "--dry",
      "--dry-run",
      "--dry=json",
      "--concurrency=1",
      "--output-logs errors-only",
      "--unknown value",
    ]) {
      expect(runsStep([`turbo run build typecheck lint ${suffix}`], step("build"))).toBe(false)
    }
  })

  test("a raw command matches the full-suite invocation, not a single-file one", () => {
    expect(runsStep(["bun test"], step("bun test", false))).toBe(true)
    expect(runsStep(["bun test --randomize"], step("bun test", false))).toBe(true)
    expect(runsStep(["bun test tests/cli-path.test.ts"], step("bun test", false))).toBe(false)
  })
})

describe("coverage", () => {
  const steps = [step("knip"), step("dupes:check")]

  test("a step no required job runs is named, with the path that reached it", () => {
    const report = coverage(steps, [job("test (ci.yml)", "bun run knip")], [])
    expect(report.missing.map((s) => s.name)).toEqual(["dupes:check"])
    expect(exitCodeFor(report)).toBe(1)
    expect(render(report, [job("test (ci.yml)")])).toContain("no required job runs `bun run dupes:check`")
  })

  test("every covering job is reported, not just the first", () => {
    const report = coverage(
      [step("bun test", false)],
      [job("test (ci.yml)", "bun test"), job("windows (ci.yml)", "bun test")],
      [],
    )
    expect(report.covered[0].jobs).toEqual(["test (ci.yml)", "windows (ci.yml)"])
    expect(exitCodeFor(report)).toBe(0)
  })

  test("an exclusion passes, and carries its reason into the output", () => {
    const excluded = [{ step: "dupes:check", why: "needs a tool CI does not install" }]
    const report = coverage(steps, [job("test (ci.yml)", "bun run knip")], excluded)
    expect(report.missing).toEqual([])
    expect(exitCodeFor(report)).toBe(0)
    expect(render(report, [])).toContain("needs a tool CI does not install")
  })

  test("an exclusion for a step that DOES run in CI is stale, and fails", () => {
    // Otherwise the reason rots into a false claim about the repo.
    const excluded = [{ step: "knip", why: "stale" }]
    const report = coverage(steps, [job("test (ci.yml)", "bun run knip")], excluded)
    expect(report.stale[0]).toContain("but test (ci.yml) runs it")
    expect(exitCodeFor(report)).toBe(1)
  })

  test("an exclusion for a step check:deep no longer runs is stale, and fails", () => {
    const excluded = [{ step: "mutate", why: "manual only" }]
    const report = coverage(steps, [job("test (ci.yml)", "bun run knip", "bun run dupes:check")], excluded)
    expect(report.stale[0]).toContain("`check:deep` no longer runs it")
    expect(exitCodeFor(report)).toBe(1)
  })

  test("an excluded build child requires its composite parent in required CI", () => {
    const buildChild: Step = {
      name: "build:lib",
      isScript: true,
      via: ["check:deep", "check:deep:host", "build"],
    }
    const excluded = [
      {
        step: "build:lib",
        coveredBy: "build",
        requiredJob: ROOT_BUILD_JOB_LABEL,
        why: "the required root build task invokes Core's composite build",
      },
    ]

    const covered = coverage(
      [buildChild],
      [job(ROOT_BUILD_JOB_LABEL, "turbo run build typecheck lint")],
      excluded,
    )
    expect(covered.stale).toEqual([])
    expect(exitCodeFor(covered)).toBe(0)

    const removedBuild = coverage(
      [buildChild],
      [
        job(ROOT_BUILD_JOB_LABEL, "turbo run typecheck lint"),
        job("test (package ci.yml)", "bun run build"),
      ],
      excluded,
    )
    expect(removedBuild.stale).toContainEqual(expect.stringContaining("does not invoke that parent"))
    expect(exitCodeFor(removedBuild)).toBe(1)
  })

  test("an exclusion cannot claim an unrelated script as its covering parent", () => {
    const excluded = [
      {
        step: "dupes:check",
        coveredBy: "build",
        why: "an invalid fixture whose claimed parent is not in the expansion chain",
      },
    ]
    const report = coverage([step("dupes:check")], [job("check (ci.yml)", "turbo run build")], excluded)
    expect(report.stale).toContainEqual(expect.stringContaining("not an ancestor in check:deep"))
    expect(exitCodeFor(report)).toBe(1)
  })
})

describe("this repository", () => {
  test("every check:deep step runs in a required CI job", () => {
    const jobs = readJobs()
    const report = coverage(expand(readScripts()), jobs)
    expect(render(report, jobs)).toBeTruthy()
    expect(report.missing).toEqual([])
    expect(report.stale).toEqual([])
  })

  test("`ci:check` is itself in check:deep — a gate outside it is the bug it catches", () => {
    expect(expand(readScripts()).map((s) => s.name)).toContain("ci:check")
  })

  test("every exclusion carries a reason", () => {
    for (const entry of EXCLUDED) expect(entry.why.length).toBeGreaterThan(20)
  })
})
