import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { mutationTargets } from "./git-changes.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const usage =
  "Usage: pnpm run mutate -- [--all|--mutate=file[:start-end]]" +
  " [--incremental] [--concurrency=1..32]" +
  " [--shard=INDEX/TOTAL|--merge-shards=2..16]";

export function parseMutationOptions(arguments_) {
  const argumentsWithoutSeparator =
    arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const options = {
    all: false,
    concurrency: undefined,
    incremental: false,
    mergeShards: undefined,
    mutate: undefined,
    shard: undefined,
  };

  for (const argument of argumentsWithoutSeparator) {
    if (argument === "--all") {
      if (options.all) throw new Error("Duplicate --all option");
      options.all = true;
    } else if (argument === "--incremental") {
      if (options.incremental) throw new Error("Duplicate --incremental option");
      options.incremental = true;
    } else if (argument.startsWith("--mutate=")) {
      if (options.mutate !== undefined)
        throw new Error("Duplicate --mutate option");
      options.mutate = argument.slice("--mutate=".length);
      if (!options.mutate) throw new Error("Mutation target cannot be empty");
    } else if (argument.startsWith("--concurrency=")) {
      if (options.concurrency !== undefined)
        throw new Error("Duplicate --concurrency option");
      const value = Number(argument.slice("--concurrency=".length));
      if (!Number.isInteger(value) || value < 1 || value > 32)
        throw new Error(`Invalid mutation concurrency: ${value}`);
      options.concurrency = value;
    } else if (argument.startsWith("--shard=")) {
      if (options.shard !== undefined) throw new Error("Duplicate --shard option");
      const match = argument.match(/^--shard=(\d+)\/(\d+)$/u);
      if (!match) throw new Error(`Invalid mutation shard: ${argument}`);
      const index = Number(match[1]);
      const total = Number(match[2]);
      if (total < 2 || total > 16 || index < 1 || index > total)
        throw new Error(`Invalid mutation shard: ${argument}`);
      options.shard = { index, total };
    } else if (argument.startsWith("--merge-shards=")) {
      if (options.mergeShards !== undefined)
        throw new Error("Duplicate --merge-shards option");
      const value = Number(argument.slice("--merge-shards=".length));
      if (!Number.isInteger(value) || value < 2 || value > 16)
        throw new Error(`Invalid mutation shard count: ${value}`);
      options.mergeShards = value;
    } else {
      throw new Error(`${usage}\nUnknown option: ${argument}`);
    }
  }

  if (options.all && options.mutate !== undefined)
    throw new Error("--all and --mutate are mutually exclusive");
  if (options.shard && !options.all)
    throw new Error("--shard requires --all");
  if (
    options.mergeShards &&
    (options.all ||
      options.mutate ||
      options.shard ||
      options.incremental ||
      options.concurrency)
  ) {
    throw new Error("--merge-shards cannot be combined with run options");
  }
  return options;
}

function sourceFile(target) {
  return target.replace(/:\d+(?::\d+)?-\d+(?::\d+)?$/u, "");
}

export function validateMutationTargets(targets, configuredTargets) {
  const configuredFiles = new Set(configuredTargets.map(sourceFile));
  for (const target of targets) {
    if (
      !/^[A-Za-z0-9_./-]+\.(?:[cm]?[jt]sx?)(?::\d+(?::\d+)?-\d+(?::\d+)?)?$/u.test(
        target,
      ) ||
      target.includes("..") ||
      target.includes("//")
    ) {
      throw new Error(`Invalid mutation target: ${target}`);
    }
    if (!configuredFiles.has(sourceFile(target))) {
      throw new Error(`Mutation target is outside the reviewed scope: ${target}`);
    }
  }
  return targets;
}

export function balancedMutationShards(targets, shardCount, packageRoot) {
  const weighted = targets
    .map((target) => {
      const contents = fs.readFileSync(path.join(packageRoot, sourceFile(target)), "utf8");
      return { target, weight: Math.max(1, contents.split("\n").length) };
    })
    .sort(
      (left, right) =>
        right.weight - left.weight || left.target.localeCompare(right.target),
    );
  const shards = Array.from({ length: shardCount }, () => ({
    targets: [],
    weight: 0,
  }));
  for (const entry of weighted) {
    const shard = shards.reduce((lightest, candidate) =>
      candidate.weight < lightest.weight ? candidate : lightest,
    );
    shard.targets.push(entry.target);
    shard.weight += entry.weight;
  }
  return shards.map(({ targets: shardTargets }) => shardTargets.sort());
}

function run(command, arguments_, { cwd, env = process.env } = {}) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${arguments_.join(" ")} exited ${result.status}`);
}

function mutationConfig(packageRoot) {
  return JSON.parse(
    fs.readFileSync(path.join(packageRoot, "stryker.conf.json"), "utf8"),
  );
}

function reportDirectoryFor(options) {
  if (options.shard)
    return `reports/mutation/shards/${options.shard.index}-of-${options.shard.total}`;
  return options.all ? "reports/mutation" : "reports/mutation/scoped";
}

function writeRunConfig(packageRoot, config, targets, reportDirectory, options) {
  const suffix = options.shard
    ? `shard-${options.shard.index}-of-${options.shard.total}`
    : `run-${process.pid}`;
  const file = path.join(packageRoot, `.stryker-${suffix}.config.mjs`);
  const runConfig = {
    ...config,
    mutate: targets,
    tempDirName: `.stryker-tmp/${suffix}`,
    htmlReporter: { fileName: `${reportDirectory}/index.html` },
    jsonReporter: { fileName: `${reportDirectory}/mutation.json` },
    ...(options.incremental ? { incremental: true } : {}),
    ...(options.concurrency ? { concurrency: options.concurrency } : {}),
  };
  fs.writeFileSync(file, `export default ${JSON.stringify(runConfig, null, 2)};\n`);
  return file;
}

function staticMutantCount(reportFile) {
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  return Object.values(report.files ?? {}).reduce(
    (count, entry) =>
      count +
      (entry.mutants ?? []).filter((mutant) => mutant.static === true).length,
    0,
  );
}

function packageContext(packageRoot) {
  const packageDirectory = path
    .relative(repositoryRoot, packageRoot)
    .replaceAll(path.sep, "/");
  if (
    packageDirectory.startsWith("..") ||
    !packageDirectory.startsWith("packages/")
  ) {
    throw new Error("Mutation runner must execute from a workspace package");
  }
  return { packageDirectory, label: path.basename(packageDirectory) };
}

function selectedTargets(packageRoot, config, options) {
  if (options.mutate)
    return validateMutationTargets(
      options.mutate.split(",").filter(Boolean),
      config.mutate,
    );
  if (options.all) {
    const targets = [...config.mutate];
    if (!options.shard) return validateMutationTargets(targets, config.mutate);
    return validateMutationTargets(
      balancedMutationShards(
        targets,
        options.shard.total,
        packageRoot,
      )[options.shard.index - 1],
      config.mutate,
    );
  }
  const { packageDirectory, label } = packageContext(packageRoot);
  return validateMutationTargets(
    mutationTargets({
      packageDirectory,
      mutableFiles: config.mutate.map(sourceFile),
      label,
    }),
    config.mutate,
  );
}

export function mergeMutationReports(reportFiles) {
  const reports = reportFiles.map((file) =>
    JSON.parse(fs.readFileSync(file, "utf8")),
  );
  if (reports.length === 0) throw new Error("No mutation reports to merge");
  const merged = structuredClone(reports[0]);
  merged.files = {};
  merged.testFiles = {};
  for (const report of reports) {
    Object.assign(merged.files, report.files ?? {});
    Object.assign(merged.testFiles, report.testFiles ?? {});
  }
  return merged;
}

function mergeShardReports(packageRoot, shardCount) {
  const shardRoot = path.join(packageRoot, "reports/mutation/shards");
  const dynamicFiles = Array.from({ length: shardCount }, (_, index) =>
    path.join(shardRoot, `${index + 1}-of-${shardCount}/mutation.json`),
  );
  const staticFiles = Array.from({ length: shardCount }, (_, index) =>
    path.join(shardRoot, `${index + 1}-of-${shardCount}/static.json`),
  ).filter((file) => fs.existsSync(file));
  const reportRoot = path.join(packageRoot, "reports/mutation");
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.writeFileSync(
    path.join(reportRoot, "mutation.json"),
    `${JSON.stringify(mergeMutationReports(dynamicFiles), null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(reportRoot, "static.json"),
    `${JSON.stringify(mergeMutationReports(staticFiles), null, 2)}\n`,
  );
  run(process.execPath, ["scripts/mutation-report.mjs"], { cwd: packageRoot });
}

async function main() {
  const packageRoot = process.cwd();
  const options = parseMutationOptions(process.argv.slice(2));
  const config = mutationConfig(packageRoot);
  if (options.mergeShards) {
    mergeShardReports(packageRoot, options.mergeShards);
    return;
  }

  run(process.execPath, ["scripts/mutation-scope.mjs"], { cwd: packageRoot });
  const targets = selectedTargets(packageRoot, config, options);
  if (targets.length === 0) throw new Error("Mutation target scope is empty");
  const reportDirectory = reportDirectoryFor(options);
  const reportRoot = path.join(packageRoot, reportDirectory);
  fs.mkdirSync(reportRoot, { recursive: true });
  const staticReport = path.join(reportRoot, "static.json");
  fs.rmSync(staticReport, { force: true });
  const configFile = writeRunConfig(
    packageRoot,
    config,
    targets,
    reportDirectory,
    options,
  );
  const environment = {
    ...process.env,
    MONIMAL_MUTATION_REPORT_DIRECTORY: reportDirectory,
    MONIMAL_MUTATION_TEMP_DIR: `.stryker-tmp/static-${process.pid}`,
  };

  try {
    run("pnpm", ["exec", "stryker", "run", configFile], {
      cwd: packageRoot,
      env: environment,
    });
    const dynamicReport = path.join(reportRoot, "mutation.json");
    if (staticMutantCount(dynamicReport) > 0) {
      run("pnpm", ["exec", "stryker", "run", "stryker.static.conf.mjs"], {
        cwd: packageRoot,
        env: environment,
      });
    }
    const reportArguments = ["scripts/mutation-report.mjs"];
    if (!options.all || options.shard) {
      reportArguments.push("--scoped", `--mutate=${targets.join(",")}`);
    }
    run(process.execPath, reportArguments, {
      cwd: packageRoot,
      env: environment,
    });
  } finally {
    fs.rmSync(configFile, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
