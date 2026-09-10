const LLAMA_PLATFORM = {
  darwin: 'mac',
  mas: 'mac',
  win32: 'win',
  linux: 'linux',
};

export const OPTIONAL_LLAMA_BACKENDS = ['cuda', 'vulkan'];
export const LLAMA_BACKENDS_VARIABLE = 'STUFFBUCKET_LLAMA_BACKENDS';
export const LLAMA_WORKER_FILENAME = 'llama-worker.js';
export const LLAMA_SOURCE_INPUTS = [
  'node_modules/node-llama-cpp/llama/gitRelease.bundle',
];

export function parseLlamaBackends(value) {
  const wanted = (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (wanted.includes('all')) return [...OPTIONAL_LLAMA_BACKENDS];

  const unknown = wanted.filter(
    (name) => !OPTIONAL_LLAMA_BACKENDS.includes(name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `${LLAMA_BACKENDS_VARIABLE} names ${unknown.join(', ')}. ` +
        `Valid names are ${OPTIONAL_LLAMA_BACKENDS.join(', ')}, or all.`,
    );
  }
  return wanted;
}

export function parseLlamaPackage(name) {
  const [os, arch, ...rest] = name.split('-');
  if (!os || !arch) {
    throw new Error(
      `@node-llama-cpp/${name} is not named <os>-<arch>[-<backend>]. ` +
        'The scope layout has changed and this build cannot tell what it ships.',
    );
  }
  const backend = (
    rest.at(-1) === 'ext' ? rest.slice(0, -1) : rest
  ).join('-');
  return { os, arch, backend };
}

export function llamaPackagePlan(present, platform, arch, backends) {
  const os = LLAMA_PLATFORM[platform];
  if (os === undefined) {
    throw new Error(
      `No @node-llama-cpp package name is known for platform ${platform}.`,
    );
  }

  const arches = new Set(
    arch === 'universal' ? ['x64', 'arm64'] : [arch],
  );
  const enabled = new Set(backends);

  return [...present].sort().map((name) => {
    const target = parseLlamaPackage(name);
    if (target.os !== os) {
      return { name, keep: false, reason: `builds for ${target.os}, not ${os}` };
    }
    if (!arches.has(target.arch)) {
      return {
        name,
        keep: false,
        reason: `builds for ${target.arch}, not ${[...arches].join(' or ')}`,
      };
    }
    if (
      OPTIONAL_LLAMA_BACKENDS.includes(target.backend) &&
      !enabled.has(target.backend)
    ) {
      return {
        name,
        keep: false,
        reason: `the ${target.backend} backend is not in ${LLAMA_BACKENDS_VARIABLE}`,
      };
    }
    return {
      name,
      keep: true,
      reason:
        target.backend === ''
          ? 'the CPU build for this target'
          : `the ${target.backend} backend`,
    };
  });
}
