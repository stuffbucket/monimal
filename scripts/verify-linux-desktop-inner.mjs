import { spawnSync } from "node:child_process";

if (process.platform !== "linux" || process.env.MAXIMAL_TEST_CONTAINER !== "1") {
  throw new Error("Linux desktop packaging checks must run in the test container.");
}

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw new Error(`${label} could not start`, { cause: result.error });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status)}`);
  }
}

run("pnpm", ["--dir", "apps/desktop", "run", "package"], "Linux desktop package");
run("pnpm", ["--dir", "apps/desktop", "run", "verify:package"], "Linux package contract");
run("xvfb-run", ["-a", "pnpm", "--dir", "apps/desktop", "run", "e2e"], "Linux packaged Electron");
