# @maximal/maximal-react-component

Owns Maximal's development-time connection between rendered React components
and their source locations.

Call `maximalReactComponent(command)` from a Vite configuration and spread the
returned plugins into its plugin list. The package enables its inspector only
for Vite development servers and returns no plugins for production builds.

The package owns the React 19 source-metadata transform, React Fiber source
discovery, Option-hover outline, Option-right-click component-stack card, and
Vite editor-opening handoff.

Option-right-click opens a persistent component-stack card beside the selected
element. Owners are ordered from the outer window-level component toward the
targeted host component and appear as a clickable, indented vertical stack in
the card's name area. Previous and next controls, Left/Right/Home/End, or the mouse
wheel choose an owner and move the element overlay to its host boundary. Clicking any
component name selects that owner, while double-clicking its name opens its
source in the editor. Pressing Enter or using the source icon opens the selected
owner. The chevron beside the owner names switches between the full indented
stack and only the selected owner. Holding Control switches to a compact name preview;
Control-click drills inward, and releasing Control restores the full card at
the selected boundary. Escape or clicking outside the card dismisses it.
Releasing Option does not dismiss it.

Drag the card from any non-interactive surface. Its top grabber and bottom edge
resize vertically, while its left and right edges retain a custom width.
Crossing the vertical expansion threshold reveals CSS and Box tools as icon
tabs in the bottom action row without changing the selected owner. CSS
separates effective, non-default assigned
declarations from the complete computed-value list and opens local stylesheet
sources when CSSOM exposes a usable path. Each owner remembers independent
Assigned and Computed scroll positions. Box renders the selected host's
margin, border, padding, and content measurements on the card and page; its
page boundaries remain anchored while the DOM target moves or the viewport
changes. Hovering or selecting an owner name renders the full margin, border,
padding, and content overlay for that owner's host element using translucent
DevTools-style regions and an element-name and border-box-size badge.

`pnpm storybook` runs this package's isolated component catalog on port 6011;
`pnpm storybook:build` validates the static catalog. Inspector semantic tokens
live in `tokens/inspector.json` and `pnpm tokens:build` compiles their typed
runtime module with the workspace-pinned Style Dictionary release. Motion
duration and easing curves are package-local DTCG tokens so this package can
retain the same interaction when distributed independently.

The parity suite records the observable behavior of
`vite-plugin-react-click-to-component` 4.2.3 as an oracle without retaining it
as a dependency. Run `pnpm test` for the contract suite and `pnpm mutate` for
the enforced mutation-quality gate.
