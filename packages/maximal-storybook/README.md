# Maximal Storybook

Workspace-owned Storybook integration for Maximal renderer packages.

Run commands from the repository root:

| Task | Command |
| --- | --- |
| Start Storybook | `pnpm storybook` |
| List live Storybook servers | `pnpm storybook:list` |
| Stop a server | `pnpm storybook:stop -- <id\|branch\|worktree\|port\|catalog>` |
| Build static Storybook | `pnpm storybook:build` |
| Render, play, and accessibility-check stories | `pnpm storybook:check` |

Configuration, preview decorators, shell modes, and browser checks live in this
package. Stories and deterministic fixtures remain beside the packages they
exercise.

The development launcher assigns a worktree-specific port from `6006` through
`6099`, displays the branch and worktree in the browser, and registers the
server under the repository's shared Git directory. Registry records are
removed on shutdown; list operations remove stale records left by abrupt exits.
