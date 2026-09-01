const expectedEnvironment = {
  MAXIMAL_TEST_CONTAINER: '1',
  HOME: '/home/maximal',
  XDG_CACHE_HOME: '/home/maximal/.cache',
  XDG_CONFIG_HOME: '/home/maximal/.config',
  XDG_DATA_HOME: '/home/maximal/.local/share',
  XDG_STATE_HOME: '/home/maximal/.local/state',
};

for (const [name, expected] of Object.entries(expectedEnvironment)) {
  if (process.env[name] !== expected) {
    throw new Error(
      `Refusing to run inner tests: ${name} must be ${expected}.`
        + ' Run `pnpm test` to use the disposable Docker container.',
    );
  }
}

if (typeof process.getuid !== 'function' || process.getuid() === 0) {
  throw new Error('Refusing to run inner tests as root.');
}

const forbiddenEnvironment = [
  'ALL_PROXY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CONFIG_DIR',
  'COPILOT_API_HOME',
  'GITHUB_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'OPENAI_API_KEY',
];

const inherited = forbiddenEnvironment.filter((name) => process.env[name]);
if (inherited.length > 0) {
  throw new Error(
    `Refusing inherited host environment in test container: ${inherited.join(', ')}`,
  );
}
