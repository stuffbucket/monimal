import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

export function readTurboBuildGraph(reportPath) {
  let serialized;
  try {
    serialized = fs.readFileSync(path.resolve(reportPath), "utf8");
  } catch (error) {
    throw new Error("Turbo dry-run report could not be read", { cause: error });
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error("Turbo dry-run report contains invalid JSON", { cause: error });
  }
}

export function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length !== 3) {
    throw new Error(
      "Usage: node scripts/copy-turbo-build-cache.mjs <report> <source> <destination>",
    );
  }
  const [reportPath, source, destination] = arguments_;
  const report = readTurboBuildGraph(reportPath);
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
