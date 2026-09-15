import {
  LLAMA_SOURCE_INPUTS,
  LLAMA_WORKER_FILENAME,
  llamaPackagePlan,
} from './llama-packaging.mjs';

const LLAMA_SCOPE = 'node_modules/@node-llama-cpp';
const LIBRARY_EXTENSIONS = ['.dylib', '.so', '.dll'];

function normalize(file) {
  return file.replaceAll('\\', '/').replace(/^\//, '');
}

function extension(file) {
  // Stryker disable next-line StringLiteral: callers accept only fixed extensions.
  return /\.[^./]+$/u.exec(file)?.[0] ?? '';
}

export function llamaPackageChecks(input) {
  const packedFiles = input.packedFiles.map(normalize);
  const unpackedFiles = input.unpackedFiles.map(normalize);
  const packed = new Set(packedFiles);
  const unpacked = new Set(unpackedFiles);
  const installed = input.prebuilds.map(({ name }) => name);
  const plan = llamaPackagePlan(
    installed,
    input.platform,
    input.arch,
    // Stryker disable next-line ArrayDeclaration: an unknown backend cannot enable a package.
    input.backends ?? [],
  );
  const kept = plan.filter(({ keep }) => keep).map(({ name }) => name);
  const keptNames = new Set(kept);
  const workerPath = `.vite/build/${LLAMA_WORKER_FILENAME}`;

  const checks = [
    { name: 'the archive listing is not empty', ok: packedFiles.length > 0 },
    { name: 'the unpacked listing is not empty', ok: unpackedFiles.length > 0 },
    { name: 'the llama worker bundle is packed', ok: packed.has(workerPath) },
    {
      name: 'node-llama-cpp is packed',
      ok: packedFiles.some((file) =>
        file.startsWith('node_modules/node-llama-cpp/'),
      ),
    },
    {
      name: 'the llama.cpp addon is unpacked',
      ok: unpackedFiles.some(
        (file) => file.includes('node-llama-cpp') && extension(file) === '.node',
      ),
    },
    {
      name: 'the dependency installs llama.cpp prebuild packages',
      ok: installed.length > 0,
    },
    {
      name: 'the plan keeps a llama.cpp prebuild package for this target',
      ok: kept.length > 0,
    },
  ];

  const libraries = input.prebuilds
    .filter(({ name }) => keptNames.has(name))
    .flatMap(({ name, files }) =>
      files
        .map(normalize)
        .filter((file) => LIBRARY_EXTENSIONS.includes(extension(file)))
        .map((file) => `${name}/${file}`),
    );
  checks.push({
    name: 'the shipped prebuilds carry llama.cpp shared libraries',
    ok: libraries.length > 0,
  });
  for (const library of libraries) {
    checks.push({
      name: `${library} is unpacked`,
      ok: unpacked.has(`${LLAMA_SCOPE}/${library}`),
    });
  }

  const scopeEntries = unpackedFiles.filter((file) =>
    file.startsWith(`${LLAMA_SCOPE}/`),
  );
  checks.push({
    name: 'the package carries the @node-llama-cpp scope',
    ok: scopeEntries.length > 0,
  });
  const strays = scopeEntries.filter(
    (file) =>
      !keptNames.has(file.slice(LLAMA_SCOPE.length + 1).split('/')[0]),
  );
  checks.push({
    name:
      strays.length === 0
        ? `all ${String(scopeEntries.length)} scope entries belong to a shipped package`
        : `${String(strays.length)} scope entries belong to a dropped package, first ${strays[0]}`,
    ok: scopeEntries.length > 0 && strays.length === 0,
  });

  for (const file of LLAMA_SOURCE_INPUTS) {
    checks.push({
      name: `${file} is not packaged`,
      ok: !packed.has(file) && !unpacked.has(file),
    });
  }
  checks.push({
    name: 'the built worker asks getLlama for build: never',
    ok:
      // Stryker disable next-line ConditionalExpression,EqualityOperator: an empty string cannot match.
      input.workerSource.length > 0 &&
      /build\s*:\s*["'`]never["'`]/u.test(input.workerSource),
  });

  return checks;
}
