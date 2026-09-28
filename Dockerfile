# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependency-base

ARG NODE_MAJOR
ARG NODE_VERSION
ARG BUN_VERSION
ARG BUN_URL_AMD64
ARG BUN_URL_ARM64
ARG BUN_SHA256_AMD64
ARG BUN_SHA256_ARM64
ARG PNPM_VERSION
ARG PNPM_URL_AMD64
ARG PNPM_URL_ARM64
ARG PNPM_SHA256_AMD64
ARG PNPM_SHA256_ARM64
ARG TARGETARCH

# Stryker's process cleanup invokes `ps` through tree-kill.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    libatomic1 \
    procps \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN test "$(node -p "process.versions.node.split('.')[0]")" = "${NODE_MAJOR}" \
  && test "$(node --version)" = "v${NODE_VERSION}"

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) bun_url="${BUN_URL_AMD64}"; bun_sha="${BUN_SHA256_AMD64}" ;; \
    arm64) bun_url="${BUN_URL_ARM64}"; bun_sha="${BUN_SHA256_ARM64}" ;; \
    *) echo "unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  archive=/tmp/bun.zip; \
  curl -fsSL "${bun_url}" -o "${archive}"; \
  printf '%s  %s\n' "${bun_sha}" "${archive}" | sha256sum -c -; \
  unzip -q "${archive}" -d /tmp/bun; \
  mv /tmp/bun/bun-linux-*/bun /usr/local/bin/bun; \
  test "$(bun --version)" = "${BUN_VERSION}"; \
  rm -rf "${archive}" /tmp/bun

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) pnpm_url="${PNPM_URL_AMD64}"; pnpm_sha="${PNPM_SHA256_AMD64}" ;; \
    arm64) pnpm_url="${PNPM_URL_ARM64}"; pnpm_sha="${PNPM_SHA256_ARM64}" ;; \
    *) echo "unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  archive=/tmp/pnpm.tar.gz; \
  curl -fsSL "${pnpm_url}" -o "${archive}"; \
  printf '%s  %s\n' "${pnpm_sha}" "${archive}" | sha256sum -c -; \
  mkdir /tmp/pnpm; \
  tar -xzf "${archive}" -C /tmp/pnpm; \
  test -x /tmp/pnpm/pnpm; \
  mv /tmp/pnpm /opt/pnpm; \
  ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm; \
  test "$(pnpm --version)" = "${PNPM_VERSION}"; \
  rm -f "${archive}"

RUN useradd --create-home --uid 10001 --shell /bin/bash maximal \
  && mkdir -p \
    /checkout \
    /home/maximal/.cache \
    /home/maximal/.config \
    /home/maximal/.local/share \
    /home/maximal/.local/state \
    /opt/monimal \
    /workspace/.turbo \
  && chown -R maximal:maximal /home/maximal /workspace \
  && git config --system --add safe.directory /checkout \
  && git config --system --add safe.directory /workspace

ENV HOME=/home/maximal \
  XDG_CACHE_HOME=/home/maximal/.cache \
  XDG_CONFIG_HOME=/home/maximal/.config \
  XDG_DATA_HOME=/home/maximal/.local/share \
  XDG_STATE_HOME=/home/maximal/.local/state \
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
  MAXIMAL_TEST_CONTAINER=1 \
  MAXIMAL_TEST_ROOT=/home/maximal \
  MAXIMAL_CORE_TARGET=bun \
  TURBO_CACHE_DIR=/workspace/.turbo/cache \
  TURBO_TELEMETRY_DISABLED=1 \
  CI=1

WORKDIR /workspace

COPY --chown=maximal:maximal package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY --chown=maximal:maximal scripts/lockfile-shard-hosts.cjs scripts/lockfile-shard-hosts.cjs
COPY --chown=maximal:maximal packages/model-runtimes/anthropic/package.json packages/model-runtimes/anthropic/package.json
COPY --chown=maximal:maximal packages/eslint-config/package.json packages/eslint-config/package.json
COPY --chown=maximal:maximal packages/local-model-registry/package.json packages/local-model-registry/package.json
COPY --chown=maximal:maximal packages/maximal-assets/package.json packages/maximal-assets/package.json
COPY --chown=maximal:maximal packages/maximal-configurators/package.json packages/maximal-configurators/package.json
COPY --chown=maximal:maximal packages/maximal-harness/package.json packages/maximal-harness/package.json
COPY --chown=maximal:maximal packages/maximal-search/package.json packages/maximal-search/package.json
COPY --chown=maximal:maximal packages/maximal-core/package.json packages/maximal-core/package.json
COPY --chown=maximal:maximal packages/maximal-core/downstream/package.json packages/maximal-core/downstream/package.json
COPY --chown=maximal:maximal packages/maximal-models/package.json packages/maximal-models/package.json
COPY --chown=maximal:maximal packages/maximal-electron/package.json packages/maximal-electron/package.json
COPY --chown=maximal:maximal packages/maximal-recording/package.json packages/maximal-recording/package.json
COPY --chown=maximal:maximal packages/maximal-data-visualization/package.json packages/maximal-data-visualization/package.json
COPY --chown=maximal:maximal packages/maximal-context-window/package.json packages/maximal-context-window/package.json
COPY --chown=maximal:maximal packages/maximal-observability/package.json packages/maximal-observability/package.json
COPY --chown=maximal:maximal packages/maximal-observability-contract/package.json packages/maximal-observability-contract/package.json
COPY --chown=maximal:maximal packages/maximal-logging/package.json packages/maximal-logging/package.json
COPY --chown=maximal:maximal packages/maximal-model-contract/package.json packages/maximal-model-contract/package.json
COPY --chown=maximal:maximal packages/maximal-core-contract/package.json packages/maximal-core-contract/package.json
COPY --chown=maximal:maximal packages/maximal-settings/package.json packages/maximal-settings/package.json
COPY --chown=maximal:maximal packages/maximal-settings/dependency-review.json packages/maximal-settings/dependency-review.json
COPY --chown=maximal:maximal packages/maximal-settings/scripts/dependency-policy.cjs packages/maximal-settings/scripts/dependency-policy.cjs
COPY --chown=maximal:maximal packages/maximal/package.json packages/maximal/package.json
COPY --chown=maximal:maximal packages/maximal-client/package.json packages/maximal-client/package.json
COPY --chown=maximal:maximal packages/maximal-ollama/package.json packages/maximal-ollama/package.json
COPY --chown=maximal:maximal packages/maximal-terminal/package.json packages/maximal-terminal/package.json
COPY --chown=maximal:maximal apps/desktop/package.json apps/desktop/package.json
COPY --chown=maximal:maximal packages/model-runtimes/omlx/package.json packages/model-runtimes/omlx/package.json
COPY --chown=maximal:maximal packages/model-qwen3-0.6b-q8-gguf/package.json packages/model-qwen3-0.6b-q8-gguf/package.json

USER maximal
RUN --mount=type=cache,id=maximal-pnpm-${TARGETARCH},target=/workspace/.pnpm-store,uid=10001,gid=10001,sharing=locked \
  --mount=type=cache,id=maximal-pnpm-cache-${TARGETARCH},target=/home/maximal/.cache/pnpm,uid=10001,gid=10001,sharing=locked \
  --mount=type=cache,id=maximal-pnpm-state-${TARGETARCH},target=/home/maximal/.local/state/pnpm,uid=10001,gid=10001,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --store-dir=/workspace/.pnpm-store \
  && pnpm --filter @maximal/maximal-core exec stryker --version

COPY --chown=maximal:maximal scripts/stage-test-checkout.mjs /opt/monimal/stage-test-checkout.mjs

CMD ["node", "/opt/monimal/stage-test-checkout.mjs", "--rebuild=workspace", "--", "pnpm", "run", "test:inner"]

FROM dependency-base AS desktop-smoke

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    xauth \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

ENV ELECTRON_SKIP_BINARY_DOWNLOAD="" \
    MAXIMAL_DESKTOP_E2E_NO_SANDBOX=1 \
    MAXIMAL_ELECTRON_ZIP_DIR=/home/maximal/.cache/electron-zips
USER maximal
RUN node apps/desktop/node_modules/electron/install.js \
  && node -e "const fs=require('node:fs'); if (!fs.existsSync(require('./apps/desktop/node_modules/electron'))) process.exit(1)" \
  && node --input-type=module -e 'import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; const require = createRequire(import.meta.url); const { downloadArtifact } = await import(require.resolve("@electron/get", { paths: [require.resolve("@electron/packager")] })); const archive = await downloadArtifact({ version: require("./apps/desktop/node_modules/electron/package.json").version, artifactName: "electron", platform: "linux", arch: process.arch }); fs.mkdirSync(process.env.MAXIMAL_ELECTRON_ZIP_DIR, { recursive: true }); fs.copyFileSync(archive, path.join(process.env.MAXIMAL_ELECTRON_ZIP_DIR, path.basename(archive)));'

FROM dependency-base AS dependencies
