import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const baseTasks = ["build", "lint", "test", "typecheck"];

function readManifest(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function discoverPackageManifests(root) {
  return execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ":(glob)packages/**/package.json",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .filter((manifest) => fs.existsSync(path.join(root, manifest)))
    .map((manifest) => path.dirname(manifest))
    .sort();
}

export function pnpmWorkspacePaths(root) {
  return JSON.parse(
    execFileSync("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).map((project) => path.relative(root, project.path) || ".");
}

export function inferredTasks(manifest) {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  if (dependencies.electron || dependencies["@electron-forge/cli"]) {
    return [...baseTasks, "package", "start"];
  }
  if (dependencies.astro) return ["build", "dev", "test"];
  const hasBin =
    (typeof manifest.bin === "string" && Boolean(manifest.bin.trim())) ||
    (typeof manifest.bin === "object" &&
      manifest.bin !== null &&
      Object.keys(manifest.bin).length > 0);
  if (hasBin) return [...baseTasks, "dev", "start"];
  return baseTasks;
}

export function auditWorkspacePackages(root, workspacePaths) {
  const workspace = new Set(workspacePaths);
  const issues = [];
  const manifests = discoverPackageManifests(root);

  for (const packagePath of manifests) {
    const manifest = readManifest(path.join(root, packagePath, "package.json"));
    const exclusion = manifest.monimal?.workspace;
    if (exclusion === false) {
      if (workspace.has(packagePath)) {
        issues.push(
          `${packagePath} is a workspace package but declares monimal.workspace=false`,
        );
      }
      if (
        typeof manifest.monimal?.workspaceReason !== "string" ||
        !manifest.monimal.workspaceReason.trim()
      ) {
        issues.push(
          `${packagePath} excludes itself from the workspace without monimal.workspaceReason`,
        );
      }
      if (manifest.private !== true) {
        issues.push(`${packagePath} excludes itself from the workspace but is not private`);
      }
      continue;
    }
    if (!workspace.has(packagePath)) {
      issues.push(`${packagePath} is not included in the pnpm workspace`);
      continue;
    }

    const requiredTasks = inferredTasks(manifest);
    const exemptions = manifest.monimal?.taskExemptions ?? {};
    if (
      typeof exemptions !== "object" ||
      exemptions === null ||
      Array.isArray(exemptions)
    ) {
      issues.push(`${packagePath} has invalid monimal.taskExemptions`);
      continue;
    }
    for (const [task, reason] of Object.entries(exemptions)) {
      if (!requiredTasks.includes(task)) {
        issues.push(`${packagePath} has stale ${task} task exemption`);
      } else if (typeof reason !== "string" || !reason.trim()) {
        issues.push(`${packagePath} exempts ${task} without a reason`);
      }
    }
    for (const task of requiredTasks) {
      if (Object.hasOwn(exemptions, task)) continue;
      const script = manifest.scripts?.[task];
      if (typeof script !== "string" || !script.trim()) {
        issues.push(
          `${packagePath} is missing inferred ${task} script; add scripts.${task}`,
        );
      }
    }
  }

  return { issues, manifests };
}