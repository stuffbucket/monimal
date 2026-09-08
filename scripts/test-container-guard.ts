import fs from "node:fs";
import path from "node:path";

const testContainerEnv = "MAXIMAL_TEST_CONTAINER";
const testHostEnv = "MAXIMAL_TEST_HOST";
const testRootEnv = "MAXIMAL_TEST_ROOT";
const isolatedPathVariables = [
  "HOME",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "COPILOT_API_HOME",
  "CLAUDE_CONFIG_DIR",
];

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length > 0 &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

if (process.env[testContainerEnv] !== "1") {
  const rootValue = process.env[testRootEnv];
  if (
    process.env[testHostEnv] !== "1" ||
    !rootValue ||
    !path.isAbsolute(rootValue)
  ) {
    throw new Error(
      "Refusing to run repository tests outside an isolated test environment." +
        " Run `pnpm test` instead of invoking `bun test` directly.",
    );
  }

  const root = fs.realpathSync(rootValue);
  for (const name of isolatedPathVariables) {
    const value = process.env[name];
    if (
      !value ||
      !path.isAbsolute(value) ||
      !isInside(root, fs.realpathSync(value))
    ) {
      throw new Error(
        `Refusing native tests: ${name} must be inside ${testRootEnv}.`,
      );
    }
  }
}
