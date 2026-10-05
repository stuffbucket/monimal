#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_CATALOG_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const FIRST_PORT = 6006;
const PORT_COUNT = 94;
const LOOPBACK_IPV4_HOSTNAME = [127, 0, 0, 1].join('.');
const USAGE = [
  'Usage:',
  '  storybook-server.mjs start --catalog <name> [--catalog-root <path>]',
  '  storybook-server.mjs list',
  '  storybook-server.mjs stop <id|branch|worktree|port|catalog>',
].join('\n');

export function parseArguments(arguments_) {
  const [command, ...rest] = arguments_.filter((argument) => argument !== '--');
  if (command === 'list' && rest.length === 0) return { command };
  if (command === 'stop' && rest.length === 1) {
    return { command, selector: rest[0] };
  }
  if (command !== 'start') throw new Error(USAGE);

  let catalog;
  let catalogRoot = DEFAULT_CATALOG_ROOT;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    const value = rest[index + 1];
    if ((option === '--catalog' || option === '--catalog-root') && value) {
      if (option === '--catalog') catalog = value;
      else catalogRoot = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(USAGE);
  }
  if (!catalog) throw new Error(USAGE);
  return { command, catalog, catalogRoot };
}

function git(arguments_, cwd) {
  return execFileSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function readGitIdentity(cwd) {
  const worktree = git(['rev-parse', '--show-toplevel'], cwd);
  const commonDirectory = git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd,
  );
  const commit = git(['rev-parse', '--short=12', 'HEAD'], cwd);
  let branch;
  try {
    branch = git(['symbolic-ref', '--short', 'HEAD'], cwd);
  } catch {
    branch = `detached@${commit}`;
  }
  return {
    worktree,
    commonDirectory,
    commit,
    branch,
    worktreeName: path.basename(worktree),
  };
}

export function serverId(worktree, catalog) {
  return createHash('sha256')
    .update(worktree)
    .update('\0')
    .update(catalog)
    .digest('hex')
    .slice(0, 12);
}

export function candidatePorts(worktree, catalog) {
  const offset =
    Number.parseInt(
      createHash('sha256')
        .update(worktree)
        .update('\0')
        .update(catalog)
        .digest('hex')
        .slice(0, 8),
      16,
    ) % PORT_COUNT;
  return Array.from(
    { length: PORT_COUNT },
    (_, index) => FIRST_PORT + ((offset + index) % PORT_COUNT),
  );
}

function portIsAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen(port, LOOPBACK_IPV4_HOSTNAME, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

export async function selectPort(worktree, catalog, available = portIsAvailable) {
  for (const port of candidatePorts(worktree, catalog)) {
    if (await available(port)) return port;
  }
  throw new Error(
    `No free Storybook port exists between ${String(FIRST_PORT)} and ${String(FIRST_PORT + PORT_COUNT - 1)}.`,
  );
}

export function registryDirectory(commonDirectory) {
  return path.join(commonDirectory, 'monimal', 'storybook');
}

export function recordPath(directory, id) {
  return path.join(directory, `${id}.json`);
}

export function writeRecord(directory, record) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = recordPath(directory, record.id);
  const temporary = `${target}.${String(process.pid)}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, target);
}

function processCommand(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function isOwnedServerProcess(record) {
  const command = processCommand(record.wrapperPid);
  return (
    command !== null &&
    command.includes('storybook-server.mjs') &&
    command.includes('start') &&
    command.includes(record.catalog)
  );
}

function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.version === 1 &&
    typeof value.id === 'string' &&
    typeof value.catalog === 'string' &&
    typeof value.worktree === 'string' &&
    typeof value.branch === 'string' &&
    typeof value.commit === 'string' &&
    typeof value.port === 'number' &&
    typeof value.url === 'string' &&
    typeof value.wrapperPid === 'number' &&
    typeof value.serverPid === 'number' &&
    typeof value.startedAt === 'string'
  );
}

export function readLiveRecords(
  directory,
  { ownsProcess = isOwnedServerProcess, remove = fs.unlinkSync } = {},
) {
  if (!fs.existsSync(directory)) return [];
  const records = [];
  for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const file = path.join(directory, name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      remove(file);
      continue;
    }
    if (!isRecord(record) || !ownsProcess(record)) {
      remove(file);
      continue;
    }
    records.push(record);
  }
  return records.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function matchesSelector(record, selector) {
  return (
    record.id === selector ||
    record.id.startsWith(selector) ||
    record.branch === selector ||
    record.worktree === path.resolve(selector) ||
    path.basename(record.worktree) === selector ||
    record.catalog === selector ||
    String(record.port) === selector
  );
}

function removeOwnedRecord(directory, id, wrapperPid) {
  const file = recordPath(directory, id);
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record.wrapperPid === wrapperPid) fs.unlinkSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function printRecords(records) {
  if (records.length === 0) {
    console.log('No Storybook servers are registered.');
    return;
  }
  console.table(
    records.map((record) => ({
      id: record.id,
      catalog: record.catalog,
      branch: record.branch,
      worktree: record.worktree,
      commit: record.commit,
      url: record.url,
      pid: record.wrapperPid,
      started: record.startedAt,
    })),
  );
}

function list() {
  const identity = readGitIdentity(process.cwd());
  printRecords(readLiveRecords(registryDirectory(identity.commonDirectory)));
}

function stop(selector) {
  const identity = readGitIdentity(process.cwd());
  const directory = registryDirectory(identity.commonDirectory);
  const matches = readLiveRecords(directory).filter((record) =>
    matchesSelector(record, selector),
  );
  if (matches.length === 0) {
    throw new Error(`No live Storybook server matches "${selector}".`);
  }
  for (const record of matches) {
    process.kill(record.wrapperPid, 'SIGTERM');
    console.log(
      `Stopping ${record.catalog} for ${record.branch} at ${record.url} (PID ${String(record.wrapperPid)}).`,
    );
  }
}

export function reportExistingServer(existing, catalog, branch, log = console.log) {
  if (!existing) return false;
  log(
    `${catalog} is already running for ${branch} at ${existing.url} (PID ${String(existing.wrapperPid)}).`,
  );
  return true;
}

async function start({ catalog, catalogRoot }) {
  const identity = readGitIdentity(catalogRoot);
  const id = serverId(identity.worktree, catalog);
  const directory = registryDirectory(identity.commonDirectory);
  const existing = readLiveRecords(directory).find((record) => record.id === id);
  if (reportExistingServer(existing, catalog, identity.branch)) return;

  const port = await selectPort(identity.worktree, catalog);
  const cli = path.join(catalogRoot, 'node_modules/storybook/dist/bin/dispatcher.js');
  if (!fs.existsSync(cli)) {
    throw new Error(`Storybook CLI not found at ${cli}. Run pnpm install first.`);
  }

  const label = `${identity.branch} · ${identity.worktreeName}`;
  const child = spawn(
    process.execPath,
    [cli, 'dev', '-p', String(port), '--no-open'],
    {
      cwd: catalogRoot,
      env: {
        ...process.env,
        STORYBOOK_IDENTITY_LABEL: label,
        STORYBOOK_WORKTREE: identity.worktree,
        STORYBOOK_BRANCH: identity.branch,
        STORYBOOK_COMMIT: identity.commit,
      },
      stdio: 'inherit',
    },
  );
  const record = {
    version: 1,
    id,
    catalog,
    worktree: identity.worktree,
    branch: identity.branch,
    commit: identity.commit,
    port,
    url: `http://${LOOPBACK_IPV4_HOSTNAME}:${String(port)}`,
    wrapperPid: process.pid,
    serverPid: child.pid,
    startedAt: new Date().toISOString(),
  };
  writeRecord(directory, record);

  console.log(
    [
      '',
      `Storybook: ${catalog}`,
      `Branch:    ${identity.branch}`,
      `Worktree:  ${identity.worktree}`,
      `Commit:    ${identity.commit}`,
      `URL:       ${record.url}`,
      `PID:       ${String(process.pid)} (server ${String(child.pid)})`,
      '',
    ].join('\n'),
  );

  let stopping = false;
  const forward = (signal) => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
    const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
    force.unref();
  };
  process.once('SIGINT', () => forward('SIGINT'));
  process.once('SIGTERM', () => forward('SIGTERM'));

  child.once('error', (error) => {
    removeOwnedRecord(directory, id, process.pid);
    console.error(`Storybook failed to start: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    removeOwnedRecord(directory, id, process.pid);
    if (signal) {
      process.exitCode = signal === 'SIGINT' ? 130 : 143;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.command === 'list') {
    list();
    return;
  }
  if (options.command === 'stop') {
    stop(options.selector);
    return;
  }
  await start(options);
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
