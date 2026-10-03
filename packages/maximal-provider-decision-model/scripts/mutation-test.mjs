import { spawnSync } from "node:child_process"
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = path.resolve(import.meta.dirname, "..")
const work = path.join(root, ".mutation-work")

const mutations = [
  {
    name: "noul-threshold",
    file: "evaluation.ts",
    from: "const NOUL_POSITIVE_THRESHOLD = 0.5",
    to: "const NOUL_POSITIVE_THRESHOLD = 0.500_001",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "choice-selection",
    file: "evaluation.ts",
    from: 'if (answer.type === "choice") return answer.choice',
    to: 'if (answer.type === "choice") return "mutated-choice"',
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "score-lowest-index-tie",
    file: "evaluation.ts",
    from: "probability === selectedProbability && index < selectedIndex",
    to: "probability === selectedProbability && index > selectedIndex",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "wilson-lower-bound",
    file: "evaluation.ts",
    from: "(center - radius) / denominator",
    to: "(center + radius) / denominator",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "bootstrap-seed",
    file: "evaluation.ts",
    from: "const seed = options.seed ?? 1_592_639_710",
    to: "const seed = 1_592_639_710",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "overall-margin",
    file: "evaluation.ts",
    from: "const OVERALL_ACCURACY_MARGIN = 0.08",
    to: "const OVERALL_ACCURACY_MARGIN = 0.079",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "primitive-margin",
    file: "evaluation.ts",
    from: "const PRIMITIVE_ACCURACY_MARGIN = 0.12",
    to: "const PRIMITIVE_ACCURACY_MARGIN = 0.119",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "score-mae-margin",
    file: "evaluation.ts",
    from: "const SCORE_MAE_MARGIN = 0.2",
    to: "const SCORE_MAE_MARGIN = 0.199",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "primitive-failure-count",
    file: "evaluation.ts",
    from: "const failures = rows.reduce((sum, row) => sum + row.failure, 0)",
    to: "const failures = rows.reduce((sum) => sum, 0)",
    occurrence: 1,
    expectedOccurrences: 2,
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "overall-failure-count",
    file: "evaluation.ts",
    from: "const failures = rows.reduce((sum, row) => sum + row.failure, 0)",
    to: "const failures = rows.reduce((sum) => sum, 0)",
    occurrence: 2,
    expectedOccurrences: 2,
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "corpus-hash",
    file: "evaluation-corpus.ts",
    from: "slot < 20",
    to: "slot < 19",
    occurrence: 1,
    expectedOccurrences: 2,
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "corpus-balance",
    file: "evaluation-corpus.ts",
    from: "slot < 20",
    to: "slot < 19",
    occurrence: 2,
    expectedOccurrences: 2,
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "identity-version",
    file: "evaluation-runner.ts",
    from: "version !== OLLAMA_EVALUATION_VERSION",
    to: "false",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "identity-digest",
    file: "evaluation-runner.ts",
    from: "actual.digest !== expected.digest",
    to: "false",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "identity-architecture",
    file: "evaluation-runner.ts",
    from: "actual.details.family !== expected.architecture",
    to: "false",
    testFiles: ["evaluation.test.ts"],
  },
  {
    name: "probability-normalization",
    file: "validation.ts",
    from: "if (!approximatelyEqual(sum, 1))",
    to: "if (false)",
    testFiles: ["profiles.test.ts"],
  },
  {
    name: "choice-argmax",
    file: "validation.ts",
    from: "|| !approximatelyEqual(selectedProbability, maximum)",
    to: "|| false",
    testFiles: ["profiles.test.ts"],
  },
  {
    name: "score-expectation",
    file: "validation.ts",
    from: "if (!approximatelyEqual(answer.score, expectedScore))",
    to: "if (false)",
    testFiles: ["profiles.test.ts"],
  },
  {
    name: "entropy-confidence",
    file: "validation.ts",
    from: "&& !approximatelyEqual(confidence, expectedConfidence(probabilities))",
    to: "&& false",
    testFiles: ["profiles.test.ts"],
  },
  {
    name: "typesafe-null-content",
    file: "profiles.ts",
    from: "const typeSafeNullableContentSchema = typeSafeSystemOneContentSchema.nullable()",
    to: "const typeSafeNullableContentSchema = typeSafeSystemOneContentSchema",
    testFiles: ["profiles.test.ts"],
  },
  {
    name: "prototype-key-preservation",
    file: "schemas.ts",
    from: 'if (key === "__proto__")',
    to: "if (false)",
    testFiles: ["profiles.test.ts"],
  },
  {
    name: "oracle-response-hash",
    file: "oracles.ts",
    from: "if (responseHash !== oracle.source.response_sha256)",
    to: "if (false)",
    testFiles: ["oracles.test.ts"],
  },
]

function replaceOccurrence(source, mutation) {
  const occurrence = mutation.occurrence ?? 1
  const matches = source.split(mutation.from).length - 1
  const expectedOccurrences = mutation.expectedOccurrences ?? 1
  if (matches !== expectedOccurrences) {
    throw new Error(
      `Mutation point ${mutation.name} expected ${String(expectedOccurrences)} occurrences, found ${String(matches)}`,
    )
  }
  let start = 0
  let index = -1
  for (let count = 0; count < occurrence; count += 1) {
    index = source.indexOf(mutation.from, start)
    if (index === -1) {
      throw new Error(`Mutation point ${mutation.name} is no longer stable`)
    }
    start = index + mutation.from.length
  }
  return `${source.slice(0, index)}${mutation.to}${source.slice(index + mutation.from.length)}`
}

async function prepareWork() {
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  await cp(path.join(root, "src"), path.join(work, "src"), { recursive: true })
  await cp(path.join(root, "tests"), path.join(work, "tests"), {
    recursive: true,
  })
  await cp(path.join(root, "fixtures"), path.join(work, "fixtures"), {
    recursive: true,
  })
}

async function prepareMutation(mutation) {
  await prepareWork()
  const target = path.join(work, "src", mutation.file)
  const source = await readFile(target, "utf8")
  await writeFile(target, replaceOccurrence(source, mutation))
}

function runTests(testFiles) {
  return spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      ...testFiles.map((file) => path.join(work, "tests", file)),
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    },
  )
}

const survivors = []
const harnessErrors = []
try {
  await prepareWork()
  const controlFiles = (await readdir(path.join(work, "tests")))
    .filter((file) => file.endsWith(".test.ts"))
    .sort()
  const control = runTests(controlFiles)
  if (control.status !== 0 || !/# fail 0(?:\n|$)/u.test(control.stdout)) {
    throw new Error(
      `Mutation control failed:\n${control.stderr}${control.stdout}`,
    )
  }
  for (const mutation of mutations) {
    await prepareMutation(mutation)
    const result = runTests(mutation.testFiles)
    if (result.status === 0) {
      survivors.push(mutation.name)
    } else if (
      result.status === null
      || result.signal !== null
      || !/# fail [1-9]\d*(?:\n|$)/u.test(result.stdout)
    ) {
      harnessErrors.push(
        `${mutation.name}:\n${result.error?.message ?? ""}\n${result.stderr}${result.stdout}`,
      )
    }
  }
} finally {
  await rm(work, { recursive: true, force: true })
}

if (survivors.length > 0) {
  throw new Error(`Surviving mutations: ${survivors.join(", ")}`)
}
if (harnessErrors.length > 0) {
  throw new Error(`Mutation harness errors:\n${harnessErrors.join("\n")}`)
}
process.stdout.write(
  `Killed ${String(mutations.length)}/${String(mutations.length)} System One mutations.\n`,
)
