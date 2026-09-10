import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPrimaryCheckout,
  dockerBuilderName,
  dockerServerArchitecture,
  imageLabels,
  inspectDockerImage,
  reusableImageId,
} from "./docker-test.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function dockerOutput(arguments_, label) {
  const result = spawnSync("docker", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error)
    throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "unknown"}` +
        (result.stderr ? `: ${result.stderr.trim()}` : ""),
    );
  }
  return result.stdout.trim();
}

export function selectRetainedImage(images, currentId) {
  if (currentId && images.some((image) => image.Id === currentId))
    return currentId;
  return images
    .filter(isManagedTestImage)
    .sort(
      (left, right) => Date.parse(right.Created) - Date.parse(left.Created),
    )[0]?.Id;
}

export function isManagedTestImage(image) {
  const architecture = image?.Config?.Labels?.[imageLabels.architecture];
  return (
    /^sha256:[0-9a-f]{64}$/u.test(image?.Id) &&
    (architecture === "amd64" || architecture === "arm64") &&
    image.Config?.Labels?.[imageLabels.purpose] === "workspace-test" &&
    image.Config?.Labels?.[imageLabels.mutation] === "stryker"
  );
}

export function parsePruneOptions(arguments_) {
  if (arguments_.length === 0) return { minAgeMilliseconds: 0 };
  const match = arguments_[0]?.match(/^--min-age=(\d+)$/u);
  if (arguments_.length !== 1 || !match?.[1]) {
    throw new Error(
      "Usage: pnpm run docker:prune:test-images [--min-age=<seconds>]",
    );
  }
  return { minAgeMilliseconds: Number(match[1]) * 1000 };
}

export function imageIsOldEnough(image, minAgeMilliseconds, now = Date.now()) {
  const created = Date.parse(image.Created);
  return Number.isFinite(created) && now - created >= minAgeMilliseconds;
}

function pruneBuilderCache() {
  const inspect = spawnSync(
    "docker",
    ["buildx", "inspect", dockerBuilderName],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (inspect.status !== 0) return;
  dockerOutput(
    [
      "buildx",
      "prune",
      "--builder",
      dockerBuilderName,
      "--force",
      "--max-used-space",
      "8gb",
      "--reserved-space",
      "2gb",
    ],
    "Docker builder cache cleanup",
  );
}

export function main(arguments_ = process.argv.slice(2)) {
  const { minAgeMilliseconds } = parsePruneOptions(arguments_);
  assertPrimaryCheckout();
  const targetArch = dockerServerArchitecture();
  const ids = [
    ...new Set(
      // Containerd-backed stores may omit dangling manifests from a
      // label-filtered listing, so enforce ownership after inspection.
      dockerOutput(
        ["image", "ls", "--all", "--quiet", "--no-trunc"],
        "Docker image listing",
      )
        .split("\n")
        .filter(Boolean),
    ),
  ];
  const images = ids
    .map((id) => inspectDockerImage(id))
    .filter(isManagedTestImage);
  const currentId = reusableImageId({ targetArch });
  const retainedId = selectRetainedImage(images, currentId);

  for (const image of images) {
    if (image.Id === retainedId) continue;
    if (!imageIsOldEnough(image, minAgeMilliseconds)) continue;
    const containers = dockerOutput(
      ["ps", "--all", "--quiet", "--filter", `ancestor=${image.Id}`],
      "Docker container lookup",
    );
    if (containers) {
      console.error(
        `Keeping ${image.Id}: referenced by container ${containers}`,
      );
      continue;
    }
    dockerOutput(["image", "rm", image.Id], "Docker image removal");
    console.error(`Removed stale Monimal test image ${image.Id}`);
  }

  if (retainedId) console.error(`Retained Monimal test image ${retainedId}`);
  pruneBuilderCache();
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
