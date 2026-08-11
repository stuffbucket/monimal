/**
 * The packaging assertions for the terminal, as a function.
 *
 * `scripts/verify-package.mjs` runs these against this repository's own build.
 * A consumer packaging `./host/terminal` and `./renderer` hits the same two
 * traps and has no equivalent, so the checks are exported rather than only
 * described. See issue #76 and `docs/architecture.md`.
 *
 * Plain ESM in `scripts/` rather than TypeScript in `src/`, because `dist/` is
 * ESM syntax in a package with no `"type": "module"`: a bundler reads it and
 * `node` does not. A packaging check runs in CI under plain `node`.
 *
 * Everything here is pure. The caller supplies two file lists, which is what
 * makes it work against electron-builder, Forge, or a hand-rolled layout.
 */

/**
 * @typedef {object} TerminalPackageCheck
 * @property {string} name
 * @property {boolean} ok
 */

/**
 * @typedef {object} TerminalPackageInput
 * @property {readonly string[]} packedFiles
 * @property {readonly string[]} unpackedFiles
 * @property {string} platform
 * @property {string} arch
 * @property {string} [contentSecurityPolicy]
 */

/** Prebuild directory `node-pty` looks in. `mas` is a darwin build. */
export function terminalPrebuildDirectory(platform, arch) {
  return `${platform === 'mas' ? 'darwin' : platform}-${arch}`;
}

/**
 * Files that must exist outside the archive.
 *
 * `spawn-helper` is the one that hides. `node-pty` `execvp`s it by an absolute
 * path rewritten from `app.asar` to `app.asar.unpacked`, so an `unpack` glob of
 * only `*.node` leaves it inside the archive and every shell fails to start.
 * It is a macOS detail: `pty.cc` takes the `posix_spawn` path under `__APPLE__`
 * and `forkpty` elsewhere, and the linux prebuilds carry no helper.
 *
 * On Windows `conpty.node` loads `conpty.dll`, which brings `OpenConsole.exe`.
 */
export function terminalNativeFiles(platform) {
  if (platform === 'win32') {
    return ['conpty.node', 'conpty_console_list.node', 'conpty/conpty.dll', 'conpty/OpenConsole.exe'];
  }
  return platform === 'darwin' || platform === 'mas'
    ? ['pty.node', 'spawn-helper']
    : ['pty.node'];
}

/** The two grants `ghostty-web` needs, each with the directive that governs it. */
export const TERMINAL_CONTENT_SECURITY_POLICY = [
  { directive: 'script-src', source: "'wasm-unsafe-eval'" },
  { directive: 'connect-src', source: 'data:' },
];

/**
 * Whether a directive grants a source, falling back to `default-src` as the
 * policy itself does. A directive that is present grants only what it lists.
 */
function grants(policy, directive, source) {
  let fallback;
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.split(/\s/).filter(Boolean);
    if (name === directive) return sources.includes(source);
    if (name === 'default-src') fallback = sources.includes(source);
  }
  return fallback ?? false;
}

/**
 * `ghostty-web` inlines its WebAssembly as a data URL and fetches it at
 * startup. Without both sources the terminal renders nothing and the only
 * symptom is a console message.
 */
export function contentSecurityPolicyChecks(policy) {
  return TERMINAL_CONTENT_SECURITY_POLICY.map(({ directive, source }) => ({
    name: `${directive} grants ${source}`,
    ok: grants(policy, directive, source),
  }));
}

/** Prebuild directory names any listed path passes through. */
function prebuildDirectories(files) {
  const found = new Set();
  for (const file of files) {
    const match = /(?:^|\/)prebuilds\/([^/]+)\//.exec(file);
    if (match) found.add(match[1]);
  }
  return found;
}

/**
 * @param {TerminalPackageInput} input
 * @returns {TerminalPackageCheck[]}
 */
export function terminalPackageChecks(input) {
  const { packedFiles, unpackedFiles, platform, arch, contentSecurityPolicy } = input;
  const directory = terminalPrebuildDirectory(platform, arch);
  const policy = contentSecurityPolicy ?? '';

  // The floor. Point either list at the wrong directory and it is empty, and
  // supply no policy and there is nothing to measure. In each case every
  // assertion over the missing input would otherwise report a pass, which is
  // what an optional policy did here for as long as it existed. Issue #92.
  const checks = [
    { name: 'the archive listing is not empty', ok: packedFiles.length > 0 },
    { name: 'the unpacked listing is not empty', ok: unpackedFiles.length > 0 },
    { name: 'a renderer content policy was supplied', ok: policy !== '' },
  ];

  checks.push({
    name: 'node-pty is packed as real files',
    ok: packedFiles.some((file) => /(?:^|\/)node-pty[^/]*\//.test(file)),
  });

  for (const file of terminalNativeFiles(platform)) {
    checks.push({
      name: `${file} is unpacked`,
      ok: unpackedFiles.some((entry) => entry.endsWith(`prebuilds/${directory}/${file}`)),
    });
  }

  const directories = prebuildDirectories([...packedFiles, ...unpackedFiles]);
  checks.push({
    name: 'a prebuild directory is present',
    ok: directories.size > 0,
  });
  checks.push({
    name: `only the ${directory} prebuild is present`,
    ok: directories.size > 0 && [...directories].every((entry) => entry === directory),
  });

  checks.push(...contentSecurityPolicyChecks(policy));

  return checks;
}
