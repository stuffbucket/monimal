# Roadmap

Work that is scoped but not built.

The design of what already works lives elsewhere: `docs/architecture.md` for
the shell, the terminal, and the windows, and `AGENTS.md` for the overlay
agent, the provider chain, and the approval gate. This file only records what
is missing, so it does not drift out of step with them.

## Terminals

Working. `coder/ghostty-web` in the renderer, `node-pty` in the main
process. See `docs/architecture.md`.

- Verified on macOS only. The prebuilt pty covers Windows and Linux, but no one
  has run it there.
- Reaping is checked against real processes on POSIX only. Both checks read the
  shell's own pid through `$$`, and `cmd.exe` has no equivalent, so
  `tests/terminal-host.test.ts` and `e2e/terminal-window.spec.ts` skip on
  Windows.
- No tab-level working directory. Every shell starts in the home directory.
- No flow control. A process that floods output will still outrun the batcher.

## The overlay

Working. Summon with the accelerator, or the sparkle button in the title bar.

**The summon is an accelerator, not a double tap of Ctrl.** `globalShortcut`
cannot bind a bare modifier, so it cannot see a double tap. That needs a native
monitor: either a small addon around `NSEvent.addGlobalMonitorForEvents`, or
`uiohook-napi`. Both need the Accessibility permission on macOS, which the
application must request and explain.

The accelerator exists so the feature is usable and testable before that lands.
It is a preference, so the native monitor can replace it without a redesign.

## The agent

Working, with tools, streaming, and an approval gate. See `AGENTS.md`.

- **No conversation.** Each summon starts a fresh transcript. `pi-agent-core`
  has session storage; wiring it is the next step.
- **No skills or compaction.** `pi-agent-core` ships both.
- **The prompt shows arguments, not effects.** An `edit` call names the file,
  not the diff. Reviewing a change needs the diff.

## Sequencing

1. Conversation history across summons.
2. A diff view in the approval prompt for `edit` and `write`.
3. The double-tap Ctrl monitor, which needs a permission prompt.
4. Windows and Linux verification for the terminal and the overlay.

## Measured, and not done

**The main process does not persist V8 bytecode between launches.** Node's
compile cache is available — Electron 43 bundles Node 24.18.0, and
`module.enableCompileCache` reports the cache as enabled in the packaged main
process, so this is a decision rather than a limitation. Issue #130 asked for
it and was closed on the numbers.

Thirty packaged launches per arm on macOS arm64, cache hits confirmed against
the 812 KB eager chunk: the module graph evaluated 4.7 ms sooner at the median
and the mean moved 2.0 ms, both inside a spread that overlaps almost entirely.
By `app.whenReady()` the median gained 1.2 ms and the mean lost 0.7 ms. A first
launch against an empty cache was consistently the slowest arm. The cost of
taking it anyway is 640 KB under `app.getPath('userData')` that nothing evicts.

Revisit only if the eager chunk grows several times over. The measurement lives
in the pull request for #130.

## Research

Work that has been argued for but not scoped lives in
[`docs/proposals/`](proposals/README.md), which carries an index and the
disposition of every document in it. That link is the only thing standing
between a proposal and nobody ever reading it: `scripts/verify-docs.mjs`
exempts the directory from name checking, so a proposal is reachable by a
reader rather than by a check.

A proposal is not a plan. Anything in there that this file does not repeat is
an argument somebody made, not work anybody committed to.
