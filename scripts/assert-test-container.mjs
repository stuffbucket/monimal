import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const expectedEnvironment = {
  MAXIMAL_TEST_CONTAINER: '1',
  MAXIMAL_TEST_ROOT: '/home/maximal',
  HOME: '/home/maximal',
  XDG_CACHE_HOME: '/home/maximal/.cache',
  XDG_CONFIG_HOME: '/home/maximal/.config',
  XDG_DATA_HOME: '/home/maximal/.local/share',
  XDG_STATE_HOME: '/home/maximal/.local/state',
};

const forbiddenEnvironment = [
  'ALL_PROXY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CONFIG_DIR',
  'COPILOT_API_HOME',
  'GITHUB_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'MAXIMAL_SHELL_KEY',
  'NO_PROXY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
];

export function assertTestContainer({
  environment = process.env,
  existsSync = fs.existsSync,
  getuid = process.getuid,
  networkInterfaces = os.networkInterfaces,
} = {}) {
  for (const [name, expected] of Object.entries(expectedEnvironment)) {
    if (environment[name] !== expected) {
      throw new Error(
        `Refusing to run inner tests: ${name} must be ${expected}.`
          + ' Run `pnpm test` to use the disposable Docker container.',
      );
    }
  }

  if (typeof getuid !== 'function' || getuid() === 0) {
    throw new Error('Refusing to run inner tests as root.');
  }

  const inherited = forbiddenEnvironment.filter((name) => name in environment);
  if (inherited.length > 0) {
    throw new Error(
      `Refusing inherited host environment in test container: ${inherited.join(', ')}`,
    );
  }

  if (existsSync('/var/run/docker.sock')) {
    throw new Error('Refusing test container with access to /var/run/docker.sock.');
  }

  const exposedInterfaces = Object.entries(networkInterfaces())
    .filter(([, addresses]) => addresses?.some((address) => !address.internal))
    .map(([name]) => name);
  if (exposedInterfaces.length > 0) {
    throw new Error(
      `Refusing networked test container: non-loopback interfaces ${exposedInterfaces.join(', ')}.`,
    );
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) assertTestContainer();
