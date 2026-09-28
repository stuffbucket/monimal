import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildDockerArguments,
  checkoutMountArguments,
  containerBoundaryArguments,
  dockerServerArchitecture,
  ensureTestImage,
  ensureTurboCacheVolume,
  expectedImageLabels,
  gitMetadataMountArguments,
  imageLabels,
  inspectDockerImage,
  readToolPins,
  stagedCommandArguments,
  turboCacheMountArguments,
  validatedImageId,
} from "./docker-test.mjs";

function run(args, label) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error) throw new Error(`${label} could not start`, { cause: result.error });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status)}`);
  }
}

function replaceArgument(args, expected, replacement) {
  const index = args.indexOf(expected);
  if (index < 0) throw new Error(`Docker build is missing ${expected}`);
  args[index] = replacement;
}

const targetArch = dockerServerArchitecture();
const pins = readToolPins();
const dependencyImageId = ensureTestImage({ pins, targetArch });
ensureTurboCacheVolume(dependencyImageId);

const directory = mkdtempSync(path.join(tmpdir(), "monimal-desktop-smoke-"));
try {
  const iidFile = path.join(directory, "image-id");
  const args = buildDockerArguments({ iidFile, pins, targetArch });
  replaceArgument(args, `monimal-test:dependencies-${targetArch}`,
    `monimal-desktop-smoke:${targetArch}`);
  replaceArgument(args, "org.opencontainers.image.title=monimal-test-dependencies",
    "org.opencontainers.image.title=monimal-desktop-smoke");
  replaceArgument(args, `${imageLabels.purpose}=workspace-test`,
    `${imageLabels.purpose}=desktop-smoke`);
  args.splice(-1, 0, "--target", "desktop-smoke");
  run(args, "Linux desktop smoke image build");

  const imageId = readFileSync(iidFile, "utf8").trim();
  const expectedLabels = {
    ...expectedImageLabels({ targetArch }),
    [imageLabels.purpose]: "desktop-smoke",
  };
  if (validatedImageId(inspectDockerImage(imageId), expectedLabels) !== imageId) {
    throw new Error("Linux desktop smoke image did not match the pinned build");
  }

  run([
    "run",
    "--rm",
    ...containerBoundaryArguments(),
    "--shm-size=1g",
    ...checkoutMountArguments(),
    ...gitMetadataMountArguments(),
    ...turboCacheMountArguments(dependencyImageId),
    imageId,
    ...stagedCommandArguments("connections", "node", [
      "scripts/verify-linux-desktop-inner.mjs",
    ]),
  ], "Linux packaged desktop smoke test");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
