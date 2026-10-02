# Maximal Storybook

Workspace-owned Storybook integration for Maximal renderer packages.

Run commands from the repository root:

| Task | Command |
| --- | --- |
| Start Storybook | `pnpm storybook` |
| Build static Storybook | `pnpm storybook:build` |
| Render, play, and accessibility-check stories | `pnpm storybook:check` |

Configuration, preview decorators, shell modes, and browser checks live in this
package. Stories and deterministic fixtures remain beside the packages they
exercise.
