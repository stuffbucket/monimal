import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPrimaryCheckout,
  currentImageState,
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
    .filter(
      (image) =>
        /^sha256:[0-9a-f]{64}$/u.test(image.Id) &&
        image.Config?.Labels?.[imageLabels.purpose] === "workspace-test" &&
        image.Config?.Labels?.[imageLabels.mutation] === "stryker",
    )
    .sort(
      (left, right) => Date.parse(right.Created) - Date.parse(left.Created),
    )[0]?.Id;
}

export function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length !== 0) {
    throw new Error("Usage: pnpm run docker:prune:test-images");
  }
  assertPrimaryCheckout();
  const targetArch = dockerServerArchitecture();
  const ids = [
    ...new Set(
      dockerOutput(
        [
          "image",
          "ls",
          "--quiet",
          "--no-trunc",
          "--filter",
          `label=${imageLabels.purpose}=workspace-test`,
        ],
        "Docker image listing",
      )
        .split("\n")
        .filter(Boolean),
    ),
  ];
  const images = ids.map((id) => inspectDockerImage(id)).filter(Boolean);
  const currentId = reusableImageId({ ...currentImageState(), targetArch });
  const retainedId = selectRetainedImage(images, currentId);

  for (const image of images) {
    if (image.Id === retainedId) continue;
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
