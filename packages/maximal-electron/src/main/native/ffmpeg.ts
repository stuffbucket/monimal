import { spawn } from 'node:child_process';

/**
 * Find `ffmpeg` and `ffprobe`, and say something useful when they are absent.
 *
 * The application does not ship them and does not download them. An encoder is
 * an executable, not data, and fetching one after install is a different risk
 * class from fetching model weights. A truncated model fails loudly on load. A
 * substituted binary does not.
 *
 * So the rule is: look for what the machine already has, and when it is not
 * there, name the one command that fixes it. Nothing is installed on the
 * user's behalf.
 *
 * This module imports no `electron`. It runs under plain Node, so the recorder
 * and the main process can share it, and so the pure parts can be mutation
 * tested.
 */

export type ToolName = 'ffmpeg' | 'ffprobe';

export interface FoundTool {
  name: ToolName;
  /** The path that answered, absolute or a bare name resolved through PATH. */
  path: string;
  /** First line of `-version`, trimmed. Empty when it could not be read. */
  version: string;
}

export type FfmpegStatus =
  | { state: 'ready'; tools: FoundTool[] }
  | { state: 'missing'; missing: ToolName[]; hint: string };

/** Environment variable that pins each tool. */
const OVERRIDE: Readonly<Record<ToolName, string>> = {
  ffmpeg: 'FFMPEG',
  ffprobe: 'FFPROBE',
};

/**
 * Directories worth looking in before falling back to PATH.
 *
 * A graphical application does not inherit the shell's PATH on macOS. It is
 * launched by the window server, so a `brew` install that works in a terminal
 * is invisible to the packaged app. That is the whole reason this list exists,
 * and it is why a bare name alone is not enough.
 */
const SEARCH_PATHS: Readonly<Record<string, readonly string[]>> = {
  // Apple Silicon Homebrew, Intel Homebrew, MacPorts, then the system.
  darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin'],
  linux: ['/usr/local/bin', '/usr/bin', '/bin', '/snap/bin'],
  win32: ['C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin'],
};

/**
 * Every place to try for one tool, in order.
 *
 * An explicit override wins outright: somebody who sets `FFMPEG` has said
 * where it is, and quietly searching past a bad value would hide their typo.
 * Otherwise the known directories come first, and the bare name last so that
 * PATH still works.
 */
export function candidatePaths(
  name: ToolName,
  platform: string,
  env: Record<string, string | undefined>,
): string[] {
  const override = env[OVERRIDE[name]];
  if (override !== undefined && override.trim().length > 0) return [override.trim()];

  const suffix = platform === 'win32' ? '.exe' : '';
  const dirs = SEARCH_PATHS[platform] ?? [];
  const separator = platform === 'win32' ? '\\' : '/';

  return [...dirs.map((dir) => `${dir}${separator}${name}${suffix}`), `${name}${suffix}`];
}

/**
 * How to get it, for this platform.
 *
 * One command, not a menu. Somebody blocked on a missing encoder wants the
 * line they can paste, and a list of four package managers makes them choose
 * before they can start.
 */
export function installHint(platform: string): string {
  if (platform === 'darwin') return 'brew install ffmpeg';
  if (platform === 'win32') return 'winget install Gyan.FFmpeg';
  if (platform === 'linux') return 'sudo apt install ffmpeg';
  return 'See https://ffmpeg.org/download.html';
}

/**
 * The message shown when something is absent.
 *
 * It names what is missing, how to get it, and that the answer is to run the
 * same thing again. The last part matters: without it the reader has to guess
 * whether the application is now in a broken state.
 */
export function missingMessage(missing: ToolName[], platform: string): string {
  const one = missing.length === 1;
  const subject = one
    ? `${String(missing[0])} is not installed`
    : `${missing.join(' and ')} are not installed`;

  return (
    `${subject}. Recording needs ${one ? 'it' : 'them'} to encode the video.\n\n` +
    `  ${installHint(platform)}\n\n` +
    'Then try again. Set FFMPEG and FFPROBE if they are somewhere unusual.'
  );
}

/**
 * Ask one candidate for its version.
 *
 * Running the binary is the check, rather than looking for a file. A path can
 * exist and still be unusable: a broken symlink, the wrong architecture, or a
 * missing execute bit all satisfy a stat and then fail inside the encode. The
 * only honest question is whether it runs.
 */
function askVersion(command: string, timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      // A malformed command throws here rather than emitting `error`. Without
      // this the promise would never settle, and the search would hang.
      resolve(undefined);
      return;
    }

    let out = '';

    // `resolve` is idempotent, so the only work worth guarding is the timer.
    const done = (value: string | undefined): void => {
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      done(undefined);
    }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    // This listener is not optional. A `ChildProcess` that emits `error` with
    // nothing listening throws it as an uncaught exception, which would take
    // the process down on a missing binary.
    //
    // Stryker disable next-line ArrowFunction: emptying the body cannot change
    // the outcome. Node emits `close` after `error` (verified: ENOENT gives
    // `error` then `close` with code -2), so the handler below settles the
    // search either way. Calling it here settles on the first of the two.
    child.on('error', () => done(undefined));
    child.on('close', (code) => {
      if (code !== 0) return done(undefined);
      done(firstLine(out));
    });
  });
}

/**
 * The first line of some output, trimmed.
 *
 * Written with `indexOf` rather than `split(...)[0]`. Indexing needs a
 * fallback that can never run, because `split` always yields at least one
 * element, and an unreachable branch reads as untested rather than impossible.
 */
export function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return (newline === -1 ? text : text.slice(0, newline)).trim();
}

/** Find one tool, or report that nothing answered. */
export async function findTool(
  name: ToolName,
  platform: string = process.platform,
  env: Record<string, string | undefined> = process.env,
  timeoutMs = 5_000,
): Promise<FoundTool | undefined> {
  for (const candidate of candidatePaths(name, platform, env)) {
    const version = await askVersion(candidate, timeoutMs);
    if (version !== undefined) return { name, path: candidate, version };
  }
  return undefined;
}

/**
 * Detect both tools.
 *
 * Never throws and never installs. The caller decides what to do about a
 * missing encoder, which for the recorder is to stop and say so.
 */
export async function detectFfmpeg(
  platform: string = process.platform,
  env: Record<string, string | undefined> = process.env,
): Promise<FfmpegStatus> {
  const names: ToolName[] = ['ffmpeg', 'ffprobe'];
  const found: FoundTool[] = [];
  const missing: ToolName[] = [];

  for (const name of names) {
    const tool = await findTool(name, platform, env);
    if (tool) found.push(tool);
    else missing.push(name);
  }

  if (missing.length > 0) {
    return { state: 'missing', missing, hint: missingMessage(missing, platform) };
  }
  return { state: 'ready', tools: found };
}

/**
 * Detect, and stop the run when either tool is absent.
 *
 * Returns the resolved paths, so a caller never has to search a second time.
 */
export async function requireFfmpeg(): Promise<Record<ToolName, string>> {
  const status = await detectFfmpeg();
  if (status.state === 'missing') throw new Error(status.hint);

  const paths = {} as Record<ToolName, string>;
  for (const tool of status.tools) paths[tool.name] = tool.path;
  return paths;
}
