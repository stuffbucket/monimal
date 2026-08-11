/**
 * The argument protocol of the packaged self check.
 *
 * `EnableNodeCliInspectArguments: false` keeps Playwright out of a packaged
 * build, so the installed application answers for itself instead:
 * `scripts/smoke-packaged.mjs` launches it with these arguments and reads the
 * result from its standard output. Issue #89.
 *
 * This half imports nothing, so it is unit tested and mutated.
 * `src/main/self-check.ts` is the half that owns the pty and the exit code.
 */

export const SELF_CHECK_FLAG = '--self-check=terminal';
export const SELF_CHECK_TOKEN_FLAG = '--self-check-token=';

export const SELF_CHECK_OK = 'self-check terminal: ok';
export const SELF_CHECK_FAILED = 'self-check terminal: failed';

/**
 * Sixteen hexadecimal characters.
 *
 * The token reaches a shell, so its shape is an allow-list rather than a hint.
 * Whoever passes it already owns the process, but a command assembled from an
 * unchecked argument is the wrong habit to leave in a shipped binary.
 */
const TOKEN_PATTERN = /^[0-9a-f]{16}$/;

export type SelfCheckResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

export function selfCheckRequested(argv: readonly string[]): boolean {
  return argv.includes(SELF_CHECK_FLAG);
}

export function selfCheckToken(argv: readonly string[]): string | undefined {
  for (const argument of argv) {
    if (!argument.startsWith(SELF_CHECK_TOKEN_FLAG)) continue;
    const token = argument.slice(SELF_CHECK_TOKEN_FLAG.length);
    if (TOKEN_PATTERN.test(token)) return token;
  }
  return undefined;
}

/**
 * The command the shell must run, with the token split in two.
 *
 * A pty echoes what is written to it. A command carrying the whole token would
 * satisfy the assertion from that echo alone, with no shell having run
 * anything, which is the false pass this check exists to avoid. Each command
 * joins the halves, so the joined string can only come from a process that ran.
 *
 * `cmd.exe` has no `printf`, and its `echo` puts a space between arguments.
 * The caret is what joins them: `cmd.exe` strips it while parsing the line, so
 * `echo` is handed one argument and the command text still carries the halves
 * apart.
 */
export function selfCheckCommand(token: string, platform: string): string {
  const half = token.length / 2;
  const first = token.slice(0, half);
  const second = token.slice(half);
  return platform === 'win32'
    ? `echo ${first}^${second}\r`
    : `printf '%s%s\\n' ${first} ${second}\r`;
}

export function selfCheckPassed(output: string, token: string): boolean {
  return output.includes(token);
}

export function selfCheckLine(result: SelfCheckResult): string {
  return result.ok
    ? `${SELF_CHECK_OK} ${result.token}`
    : `${SELF_CHECK_FAILED}: ${result.reason}`;
}
