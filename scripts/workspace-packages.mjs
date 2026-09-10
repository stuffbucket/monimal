import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const baseTasks = ["build", "lint", "test", "typecheck"];

function readManifest(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function discoverPackageManifests(root) {
  const manifests = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name === "package.json") {
        manifests.push(path.relative(root, path.dirname(absolute)));
      }
    }
  };
  visit(path.join(root, "packages"));
  return manifests.sort();
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
  const profile = manifest.monimal?.taskProfile;
  if (profile === "config") return ["lint"];
  if (profile !== undefined) return [];

  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  if (dependencies.electron || dependencies["@electron-forge/cli"]) {
    return [...baseTasks, "package", "start"];
  }
  if (dependencies.astro) return ["build", "dev", "test"];
  if (manifest.bin) return [...baseTasks, "dev", "start"];
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
      continue;
    }
    if (!workspace.has(packagePath)) {
      issues.push(`${packagePath} is not included in the pnpm workspace`);
      continue;
    }

    const profile = manifest.monimal?.taskProfile;
    if (profile !== undefined && profile !== "config") {
      issues.push(`${packagePath} declares unknown monimal.taskProfile ${JSON.stringify(profile)}`);
      continue;
    }
    for (const task of inferredTasks(manifest)) {
      if (typeof manifest.scripts?.[task] !== "string") {
        issues.push(
          `${packagePath} is missing inferred ${task} script; add scripts.${task}`,
        );
      }
    }
  }

  return { issues, manifests };
}