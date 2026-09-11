import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const coreBinSource = `#!/usr/bin/env bun
await import("../src/main.ts");
`;

export function prepareCoreWorkspaceBin(rootDirectory) {
  const binPath = path.join(
    rootDirectory,
    "packages/maximal-core/dist/main.js",
  );
  fs.mkdirSync(path.dirname(binPath), { recursive: true });
  try {
    fs.writeFileSync(binPath, coreBinSource, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o755,
    });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

export function main() {
  prepareCoreWorkspaceBin(repositoryRoot);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main();