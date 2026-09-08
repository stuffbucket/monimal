import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertHostStateCanaryUnchanged,
  assertPrimaryCheckout,
  containerBoundaryArguments,
  createHostStateCanary,
  currentImageState,
  dockerServerArchitecture,
  requireReusableImage,
} from "./docker-test.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const mutationReportDirectory = path.join(
  repositoryRoot,
  "packages/maximal-core/reports/mutation",
);
const mutationLedgerContainerPath =
  "/workspace/packages/maximal-core/reports/mutation/incomplete-runs.log";
const usage =
  "Usage: pnpm mutate:core -- [--mutate=src/path.ts[:start-end]] [--concurrency=1..32]" +
  " (or bun run mutate -- with the same options)";
const targetPattern =
  /^src\/[A-Za-z0-9_./*-]+\.ts(?::\d+(?::\d+)?-\d+(?::\d+)?)?$/u;

export function parseMutationOptions(arguments_) {
  const options = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  let mutate;
  let concurrency;
  let sawConcurrency = false;

  for (const option of options) {
    if (option.startsWith("--mutate=")) {
      if (mutate !== undefined) throw new Error("Duplicate --mutate option");
      mutate = option.slice("--mutate=".length);
      const targets = mutate.split(",");
      if (
        targets.some(
          (target) =>
            !targetPattern.test(target) ||
            target.includes("..") ||
            target.includes("//"),
        )
      ) {
        throw new Error(`Invalid mutation target: ${mutate}`);
      }
      continue;
    }
    if (option.startsWith("--concurrency=")) {
      if (sawConcurrency) throw new Error("Duplicate --concurrency option");
      sawConcurrency = true;
      const raw = option.slice("--concurrency=".length);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) {
        throw new Error(`Invalid mutation concurrency: ${raw}`);
      }
      concurrency = parsed;
      continue;
    }
    throw new Error(usage);
  }

  return { concurrency, mutate };
}

export function createMutationContainerArguments(imageId, options) {
  const arguments_ = [
    "create",
    ...containerBoundaryArguments(),
    "--env",
    `MAXIMAL_MUTATION_LEDGER=${mutationLedgerContainerPath}`,
    imageId,
    "pnpm",
    "run",
    "mutate:core:inner",
  ];
  if (options.mutate !== undefined) {
    arguments_.push("--mutate", options.mutate);
  }
  if (options.concurrency !== undefined) {
    arguments_.push("--concurrency", String(options.concurrency));
  }
  return arguments_;
}

function runDocker(arguments_, label, options = {}) {
  const result = spawnSync("docker", arguments_, {
    cwd: repositoryRoot,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? undefined : "inherit",
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  return result;
}

function requiredOutput(result, label) {
  if (result.status !== 0 || !result.stdout?.trim()) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}` +
        (result.stderr ? `: ${result.stderr.trim()}` : ""),
    );
  }
  return result.stdout.trim();
}

export function inspectMutationReport(directory) {
  const indexPath = path.join(directory, "index.html");
  if (!fs.statSync(indexPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Mutation report is missing ${indexPath}`);
  }

  const ledgerPath = path.join(directory, "incomplete-runs.log");
  const ledger = fs.existsSync(ledgerPath)
    ? fs.readFileSync(ledgerPath, "utf8")
    : "";
  return { incomplete: ledger.trim().length > 0, ledgerPath };
}

export function publishMutationReport(
  stagingDirectory,
  destination = mutationReportDirectory,
) {
  inspectMutationReport(stagingDirectory);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  let backupDirectory;

  if (fs.existsSync(destination)) {
    backupDirectory = fs.mkdtempSync(path.join(parent, ".mutation-backup-"));
    fs.rmdirSync(backupDirectory);
    fs.renameSync(destination, backupDirectory);
  }

  try {
    fs.renameSync(stagingDirectory, destination);
  } catch (error) {
    if (backupDirectory !== undefined) {
      try {
        fs.renameSync(backupDirectory, destination);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          `Could not publish or restore the mutation report at ${destination}`,
        );
      }
    }
    throw error;
  }

  if (backupDirectory !== undefined) {
    fs.rmSync(backupDirectory, { recursive: true, force: true });
  }
}

function copyMutationReport(containerId) {
  const parent = path.dirname(mutationReportDirectory);
  fs.mkdirSync(parent, { recursive: true });
  const stagingDirectory = fs.mkdtempSync(
    path.join(parent, ".mutation-stage-"),
  );
  let published = false;

  try {
    const result = runDocker(
      [
        "cp",
        `${containerId}:/workspace/packages/maximal-core/reports/mutation/.`,
        stagingDirectory,
      ],
      "Mutation report copy",
    );
    if (result.status !== 0) {
      throw new Error(
        `Mutation report copy failed with exit code ${result.status ?? "unknown"}`,
      );
    }

    const report = inspectMutationReport(stagingDirectory);
    publishMutationReport(stagingDirectory);
    published = true;
    console.error(`Mutation report: ${mutationReportDirectory}/index.html`);
    return {
      ...report,
      ledgerPath: path.join(mutationReportDirectory, "incomplete-runs.log"),
    };
  } finally {
    if (!published) {
      fs.rmSync(stagingDirectory, { recursive: true, force: true });
    }
  }
}

export function main(arguments_ = process.argv.slice(2)) {
  const options = parseMutationOptions(arguments_);
  assertPrimaryCheckout();
  const targetArch = dockerServerArchitecture();
  const imageId = requireReusableImage({ ...currentImageState(), targetArch });
  const hostStateCanary = createHostStateCanary();
  let containerId;

  try {
    containerId = requiredOutput(
      runDocker(
        createMutationContainerArguments(imageId, options),
        "Docker mutation container creation",
        { capture: true },
      ),
      "Docker mutation container creation",
    );
    const start = runDocker(
      ["start", "--attach", containerId],
      "Docker mutation container",
    );
    const report = copyMutationReport(containerId);
    if (report.incomplete) {
      throw new Error(
        `Mutation sweep was incomplete; inspect ${report.ledgerPath}`,
      );
    }
    if (start.status !== 0) {
      throw new Error(
        `Docker mutation container failed with exit code ${start.status ?? "unknown"}`,
      );
    }
  } finally {
    if (containerId !== undefined) {
      runDocker(["rm", "--force", containerId], "Docker mutation cleanup", {
        capture: true,
      });
    }
    try {
      assertHostStateCanaryUnchanged(hostStateCanary);
    } finally {
      fs.rmSync(hostStateCanary.root, { recursive: true, force: true });
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
