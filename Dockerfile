# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

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
  MAXIMAL_CORE_TARGET=bun \
  TURBO_CACHE_DIR=/workspace/.turbo/cache \
  TURBO_TELEMETRY_DISABLED=1 \
  CI=1

WORKDIR /workspace

COPY --chown=maximal:maximal package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY --chown=maximal:maximal scripts/lockfile-shard-hosts.cjs scripts/lockfile-shard-hosts.cjs
COPY --chown=maximal:maximal packages/anthropic-provider/package.json packages/anthropic-provider/package.json
COPY --chown=maximal:maximal packages/eslint-config/package.json packages/eslint-config/package.json
COPY --chown=maximal:maximal packages/llama-server/package.json packages/llama-server/package.json
COPY --chown=maximal:maximal packages/maximal-core/package.json packages/maximal-core/package.json
COPY --chown=maximal:maximal packages/maximal-core/downstream/package.json packages/maximal-core/downstream/package.json
COPY --chown=maximal:maximal packages/maximal-dsh-host/package.json packages/maximal-dsh-host/package.json
COPY --chown=maximal:maximal packages/maximal-electron/package.json packages/maximal-electron/package.json
COPY --chown=maximal:maximal packages/maximal-observability/package.json packages/maximal-observability/package.json
COPY --chown=maximal:maximal packages/maximal-observability-contract/package.json packages/maximal-observability-contract/package.json
COPY --chown=maximal:maximal packages/maximal-provider-contract/package.json packages/maximal-provider-contract/package.json
COPY --chown=maximal:maximal packages/maximal/package.json packages/maximal/package.json
COPY --chown=maximal:maximal packages/maximal/client/package.json packages/maximal/client/package.json
COPY --chown=maximal:maximal packages/omlx/package.json packages/omlx/package.json

USER maximal
RUN --mount=type=cache,id=maximal-pnpm-${TARGETARCH},target=/workspace/.pnpm-store,uid=10001,gid=10001,sharing=locked \
  --mount=type=cache,id=maximal-pnpm-cache-${TARGETARCH},target=/home/maximal/.cache/pnpm,uid=10001,gid=10001,sharing=locked \
  --mount=type=cache,id=maximal-pnpm-state-${TARGETARCH},target=/home/maximal/.local/state/pnpm,uid=10001,gid=10001,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --store-dir=/workspace/.pnpm-store \
  && pnpm --filter @stuffbucket/maximal-core exec stryker --version

COPY --chown=maximal:maximal scripts/stage-test-checkout.mjs /opt/monimal/stage-test-checkout.mjs

CMD ["node", "/opt/monimal/stage-test-checkout.mjs", "--rebuild=workspace", "--", "pnpm", "run", "test:inner"]
