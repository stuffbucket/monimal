import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const coreSourcePrefix = "packages/maximal-core/";
const coreSourcePattern =
  /^packages\/maximal-core\/(src\/[A-Za-z0-9_./*-]+\.ts)$/u;

export function gitOutput(arguments_, label, root = repositoryRoot) {
  try {
    return execFileSync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not be resolved: ${detail}`);
  }
}

export function affectedBase(root = repositoryRoot) {
  try {
    gitOutput(
      ["rev-parse", "--verify", "origin/main^{commit}"],
      "origin/main",
      root,
    );
  } catch (error) {
    throw new Error(
      "The affected test base origin/main is unavailable. Run `git fetch origin main`" +
        " and retry.",
      { cause: error },
    );
  }
  const base = gitOutput(
    ["merge-base", "HEAD", "origin/main"],
    "merge base",
    root,
  );
  if (!/^[0-9a-f]{40}$/u.test(base)) {
    throw new Error(`Invalid merge base: ${base}`);
  }
  return base;
}

export function mergeLineRanges(ranges) {
  const merged = [];
  for (const range of [...ranges].sort(
    (left, right) => left.start - right.start,
  )) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function formatMutationTargets(rangesByPath) {
  return [...rangesByPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([relativePath, ranges]) =>
      mergeLineRanges(ranges).map(
        ({ start, end }) => `${relativePath}:${start}-${end}`,
      ),
    );
}

export function parseMutationDiff(diff, sourcePath) {
  const rangesByPath = new Map();
  let destinationPath;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      destinationPath = undefined;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const pathValue = line.slice(4);
      destinationPath =
        pathValue === "/dev/null"
          ? undefined
          : sourcePath(pathValue.replace(/^b\//u, ""));
      continue;
    }
    if (!destinationPath || !line.startsWith("@@ ")) continue;
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u);
    if (!hunk) throw new Error(`Invalid zero-context diff hunk: ${line}`);
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    const ranges = rangesByPath.get(destinationPath) ?? [];
    ranges.push({ start, end: start + count - 1 });
    rangesByPath.set(destinationPath, ranges);
  }

  return rangesByPath;
}

export function parseCoreMutationDiff(diff) {
  return parseMutationDiff(
    diff,
    (diffPath) => diffPath.match(coreSourcePattern)?.[1],
  );
}

function untrackedLineCount(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  if (!contents) return 0;
  const lines = contents.split("\n").length;
  return contents.endsWith("\n") ? lines - 1 : lines;
}

export function mutationTargets({
  packageDirectory,
  mutableFiles,
  label,
  root = repositoryRoot,
  base = affectedBase(root),
}) {
  if (!/^[0-9a-f]{40}$/u.test(base))
    throw new Error(`Invalid merge base: ${base}`);
  const packagePrefix = `${packageDirectory.replace(/\/+$/u, "")}/`;
  const mutable = new Set(mutableFiles);
  const sourcePath = (repositoryPath) => {
    if (!repositoryPath.startsWith(packagePrefix)) return undefined;
    const relativePath = repositoryPath.slice(packagePrefix.length);
    return mutable.has(relativePath) ? relativePath : undefined;
  };
  const diff = gitOutput(
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "--unified=0",
      "--find-renames",
      "--no-ext-diff",
      base,
      "--",
      packageDirectory,
    ],
    `${label} source diff`,
    root,
  );
  const rangesByPath = parseMutationDiff(diff, sourcePath);
  const untracked = gitOutput(
    [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      packageDirectory,
    ],
    `untracked ${label} source files`,
    root,
  );

  for (const repositoryPath of untracked.split("\n").filter(Boolean)) {
    const relativePath = sourcePath(repositoryPath);
    if (!relativePath) continue;
    const filePath = path.join(root, repositoryPath);
    const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
    if (!stat?.isFile()) continue;
    const lineCount = untrackedLineCount(filePath);
    if (lineCount > 0)
      rangesByPath.set(relativePath, [{ start: 1, end: lineCount }]);
  }

  const targets = formatMutationTargets(rangesByPath);
  if (targets.length === 0) {
    throw new Error(
      `No mutable ${label} source lines changed since origin/main. Use --mutate for an` +
        " explicit target or --all for a deliberate full sweep.",
    );
  }
  return targets;
}

export function coreMutationTargets(
  root = repositoryRoot,
  base = affectedBase(root),
) {
  const sourceRoot = path.join(root, coreSourcePrefix, "src");
  const mutableFiles = fs
    .readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) =>
      path
        .relative(path.join(root, coreSourcePrefix), path.join(entry.parentPath, entry.name))
        .replaceAll(path.sep, "/"),
    );
  return mutationTargets({
    packageDirectory: coreSourcePrefix,
    mutableFiles,
    label: "Core",
    root,
    base,
  });
}
