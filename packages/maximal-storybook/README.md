# Maximal Storybook

Shared Storybook authoring types, test helpers, manager identity utilities, and
the multi-catalog development server launcher for Maximal renderer packages.

The Storybook catalog, preview configuration, browser checks, and developer
commands are owned by `@maximal/maximal-design-system`.

Run commands from the repository root:

| Task | Command |
| --- | --- |
| Start Storybook | `pnpm storybook` |
| List live Storybook servers | `pnpm storybook:list` |
| Stop a server | `pnpm storybook:stop -- <id\|branch\|worktree\|port\|catalog>` |
| Build static Storybook | `pnpm storybook:build` |
| Render, play, and accessibility-check stories | `pnpm storybook:check` |

Stories and deterministic fixtures remain beside the packages they exercise.

The design-system development launcher assigns a worktree-specific port from `6006` through
`6099`, displays the branch and worktree in the browser, and registers the
server under the repository's shared Git directory. Registry records are
removed on shutdown; list operations remove stale records left by abrupt exits.
