FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

ARG NODE_MAJOR
ARG BUN_VERSION
ARG PNPM_VERSION
ARG PNPM_SHA256_AMD64
ARG PNPM_SHA256_ARM64
ARG GIT_SHA
ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    libatomic1 \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN test "$(node -p "process.versions.node.split('.')[0]")" = "${NODE_MAJOR}"

ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
  && test "$(bun --version)" = "${BUN_VERSION}"

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) pnpm_arch=x64; pnpm_sha="${PNPM_SHA256_AMD64}" ;; \
    arm64) pnpm_arch=arm64; pnpm_sha="${PNPM_SHA256_ARM64}" ;; \
    *) echo "unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  archive=/tmp/pnpm.tar.gz; \
  curl -fsSL \
    "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-${pnpm_arch}.tar.gz" \
    -o "${archive}"; \
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
    /home/maximal/.cache \
    /home/maximal/.config \
    /home/maximal/.local/share \
    /home/maximal/.local/state \
    /workspace \
  && chown -R maximal:maximal /home/maximal /workspace

ENV HOME=/home/maximal \
  XDG_CACHE_HOME=/home/maximal/.cache \
  XDG_CONFIG_HOME=/home/maximal/.config \
  XDG_DATA_HOME=/home/maximal/.local/share \
  XDG_STATE_HOME=/home/maximal/.local/state \
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
  MAXIMAL_TEST_CONTAINER=1 \
  MAXIMAL_GIT_SHA=${GIT_SHA} \
  MAXIMAL_CORE_TARGET=bun \
  TURBO_TELEMETRY_DISABLED=1 \
  CI=1

WORKDIR /workspace
COPY --chown=maximal:maximal . .

USER maximal

RUN test "$(printf '%s' "${MAXIMAL_GIT_SHA}" | wc -c)" -eq 40 \
  && git init --quiet \
  && printf '%s\n' "${MAXIMAL_GIT_SHA}" > .git/HEAD \
  && test "$(git rev-parse HEAD)" = "${MAXIMAL_GIT_SHA}"

RUN pnpm install --frozen-lockfile \
  && pnpm run verify:workspace \
  && pnpm exec turbo run build --concurrency=1

CMD ["pnpm", "run", "test:inner"]
