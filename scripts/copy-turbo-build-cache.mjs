import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const cacheFileSuffixes = [".tar.zst", "-meta.json", "-manifest.json"];

export function selectTurboCacheHashes(report) {
  if (!report || !Array.isArray(report.tasks) || report.tasks.length === 0) {
    throw new Error("Turbo dry-run report has no tasks");
  }

  const hashes = new Set();
  for (const task of report.tasks) {
    const cache = task?.resolvedTaskDefinition?.cache;
    if (typeof cache !== "boolean" || typeof task.command !== "string") {
      throw new Error("Turbo dry-run report contains a malformed task");
    }
    if (!cache || task.command === "<NONEXISTENT>") continue;
    if (!/^[0-9a-f]{16}$/u.test(task.hash)) {
      throw new Error(`Invalid Turbo task hash: ${String(task.hash)}`);
    }
    hashes.add(task.hash);
  }

  if (hashes.size === 0) {
    throw new Error("Turbo dry-run report has no cacheable executable tasks");
  }
  return [...hashes];
}

export function publishTurboBuildCache(
  report,
  sourceDirectory,
  destinationDirectory,
) {
  const source = path.resolve(sourceDirectory);
  const destination = path.resolve(destinationDirectory);
  if (source === destination) {
    throw new Error("Turbo cache source and destination must differ");
  }

  const hashes = selectTurboCacheHashes(report);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, ".turbo-cache-stage-"));
  let backup;
  let published = false;

  try {
    for (const hash of hashes) {
      for (const suffix of cacheFileSuffixes) {
        const name = `${hash}${suffix}`;
        const sourceFile = path.join(source, name);
        if (!fs.lstatSync(sourceFile, { throwIfNoEntry: false })?.isFile()) {
          throw new Error(`Turbo cache artifact is missing: ${sourceFile}`);
        }
        fs.copyFileSync(sourceFile, path.join(staging, name));
      }
    }

    if (fs.existsSync(destination)) {
      backup = fs.mkdtempSync(path.join(parent, ".turbo-cache-backup-"));
      fs.rmdirSync(backup);
      fs.renameSync(destination, backup);
    }

    try {
      fs.renameSync(staging, destination);
      published = true;
    } catch (error) {
      if (backup !== undefined) fs.renameSync(backup, destination);
      throw error;
    }

    if (backup !== undefined) {
      fs.rmSync(backup, { recursive: true, force: true });
    }
    return hashes;
  } finally {
    if (!published) fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function readTurboBuildGraph(sourceDirectory) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "build",
      "--concurrency=1",
      "--dry=json",
      `--cache-dir=${sourceDirectory}`,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.error) {
    throw new Error(`Turbo dry run could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Turbo dry run failed with exit code ${result.status ?? "unknown"}` +
        (result.stderr ? `: ${result.stderr.trim()}` : ""),
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error("Turbo dry run returned invalid JSON", { cause: error });
  }
}

export function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length !== 2) {
    throw new Error(
      "Usage: node scripts/copy-turbo-build-cache.mjs <source> <destination>",
    );
  }
  const [source, destination] = arguments_;
  const report = readTurboBuildGraph(source);
  publishTurboBuildCache(report, source, destination);
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
