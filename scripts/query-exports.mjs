#!/usr/bin/env node
/**
 * Query the workspace export map to quickly check if a symbol or export
 * exists without chewing up context window or running verification gates.
 *
 * Usage:
 *   node scripts/query-exports.mjs @stuffbucket/maximal-core
 *   node scripts/query-exports.mjs @stuffbucket/maximal-core ./settings-types
 *   node scripts/query-exports.mjs --all
 *   node scripts/query-exports.mjs --all --json
 *   node scripts/query-exports.mjs --summary
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Discover all package manifests in the workspace using pnpm.
 * @param {string} root
 * @returns {Map<string, object>} Map of package name to manifest object
 */
export function loadWorkspaceExports(root) {
  const packages = new Map();

  const workspacePaths = JSON.parse(
    execFileSync("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );

  for (const project of workspacePaths) {
    if (!project.name) continue;

    // pnpm ls returns absolute paths, so use project.path directly if it's absolute
    const projectPath = path.isAbsolute(project.path || ".")
      ? project.path
      : path.join(root, project.path || ".");
    const manifestPath = path.join(projectPath, "package.json");

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.exports) {
        packages.set(manifest.name, {
          path: projectPath,
          exports: Object.keys(manifest.exports),
          manifest,
        });
      }
    } catch {
      // Silently skip packages without valid manifests
    }
  }

  return packages;
}

/**
 * Format exports for human-readable output.
 * @param {string} packageName
 * @param {Array<string>} exports
 * @returns {string}
 */
function formatExports(packageName, exports) {
  return `${packageName}\n${exports.map((ex) => `  ${ex}`).join("\n")}`;
}

/**
 * Check if a package and optional subpath exist.
 * @param {Map<string, object>} packages
 * @param {string} packageName
 * @param {string | null} subpath
 * @returns {object | null}
 */
function findExport(packages, packageName, subpath) {
  const pkg = packages.get(packageName);
  if (!pkg) return null;
  if (!subpath) return { package: packageName, ...pkg };
  if (pkg.exports.includes(subpath)) {
    return { package: packageName, subpath, found: true };
  }
  return { package: packageName, subpath, found: false, available: pkg.exports };
}

// Parse command-line arguments
const args = process.argv.slice(2);
const isJson = args.includes("--json");
const isAll = args.includes("--all");
const isSummary = args.includes("--summary");
const positionals = args.filter((arg) => !arg.startsWith("--"));
const packageName = positionals[0] || null;
const subpathArg = positionals[1] || null;

// Load workspace exports
const packages = loadWorkspaceExports(ROOT);

// Only run CLI if this is the entry point (not imported as a module)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (isAll || isSummary) {
    // --all: list all packages and their exports
    // --summary: just counts
    const sorted = Array.from(packages.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    if (isSummary) {
      const totalPackages = sorted.length;
      const totalExports = Array.from(packages.values()).reduce(
        (sum, pkg) => sum + pkg.exports.length,
        0,
      );
      const output = {
        packages: totalPackages,
        exports: totalExports,
        byPackage: Object.fromEntries(
          sorted.map(([name, pkg]) => [name, pkg.exports.length]),
        ),
      };
      console.log(JSON.stringify(output, null, 2));
    } else if (isJson) {
      const output = Object.fromEntries(
        sorted.map(([name, pkg]) => [name, pkg.exports]),
      );
      console.log(JSON.stringify(output, null, 2));
    } else {
      for (const [name, pkg] of sorted) {
        console.log(formatExports(name, pkg.exports));
        console.log("");
      }
    }
  } else if (packageName) {
    // Check if a specific package and optional subpath exist
    const pkg = packageName;
    const subpath = subpathArg;

    const result = findExport(packages, pkg, subpath);

    if (!result) {
      if (isJson) {
        console.log(JSON.stringify({ error: `Package not found: ${pkg}` }));
      } else {
        console.error(`✗ Package not found: ${pkg}`);
        console.error(`\n  Available packages: ${Array.from(packages.keys()).join(", ")}`);
      }
      process.exit(1);
    }

    if (!subpath) {
      // Just listing the package's exports
      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatExports(pkg, result.exports));
      }
    } else {
      // Checking a specific subpath
      if (result.found) {
        if (isJson) {
          console.log(JSON.stringify({ found: true, package: pkg, subpath }));
        } else {
          console.log(`✓ ${pkg} exports ${subpath}`);
        }
      } else {
        if (isJson) {
          console.log(
            JSON.stringify({
              found: false,
              package: pkg,
              subpath,
              available: result.available,
            }),
          );
        } else {
          console.error(`✗ ${pkg} does not export ${subpath}`);
          console.error(`\n  Available exports:`);
          console.error(result.available.map((ex) => `    ${ex}`).join("\n"));
        }
        process.exit(1);
      }
    }
  } else {
    // No arguments
    console.error("Usage:");
    console.error("  node scripts/query-exports.mjs <package>              # List package exports");
    console.error("  node scripts/query-exports.mjs <package> <subpath>   # Check specific export");
    console.error("  node scripts/query-exports.mjs --all                 # List all packages");
    console.error("  node scripts/query-exports.mjs --all --json          # JSON output");
    console.error("  node scripts/query-exports.mjs --summary             # Count summary");
    console.error("\nExamples:");
    console.error("  node scripts/query-exports.mjs @stuffbucket/maximal-core");
    console.error("  node scripts/query-exports.mjs @stuffbucket/maximal-core ./settings-types");
    console.error("  node scripts/query-exports.mjs @stuffbucket/maximal-electron ./renderer");
    process.exit(1);
  }
}
