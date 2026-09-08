import { spawn } from 'node:child_process';

/** Detect ffmpeg/ffprobe and suggest an install command when they are missing. */

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

/** Search common install directories before falling back to PATH. */
const SEARCH_PATHS: Readonly<Record<string, readonly string[]>> = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin'],
  linux: ['/usr/local/bin', '/usr/bin', '/bin', '/snap/bin'],
  win32: ['C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin'],
};

/** Try each candidate in order, honoring explicit overrides first. */
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

/** One install command for the current platform. */
export function installHint(platform: string): string {
  if (platform === 'darwin') return 'brew install ffmpeg';
  if (platform === 'win32') return 'winget install Gyan.FFmpeg';
  if (platform === 'linux') return 'sudo apt install ffmpeg';
  return 'See https://ffmpeg.org/download.html';
}

/** Explain which tool is missing and how to fix it. */
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

/** Ask one candidate for its version. */
function askVersion(command: string, timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(undefined);
      return;
    }

    let out = '';

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
    child.on('error', () => done(undefined));
    child.on('close', (code) => {
      if (code !== 0) return done(undefined);
      done(firstLine(out));
    });
  });
}

/** Trim the first line of some output. */
export function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return (newline === -1 ? text : text.slice(0, newline)).trim();
}

/** Find one tool or report that none answered. */
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

/** Detect both tools without throwing. */
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

/** Detect and throw when a tool is absent. */
export async function requireFfmpeg(): Promise<Record<ToolName, string>> {
  const status = await detectFfmpeg();
  if (status.state === 'missing') throw new Error(status.hint);

  const paths = {} as Record<ToolName, string>;
  for (const tool of status.tools) paths[tool.name] = tool.path;
  return paths;
}
