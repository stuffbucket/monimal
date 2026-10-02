# Consuming this package

`@maximal/maximal-electron` is private to this monorepo. Consumers are
workspace packages that depend on it through the workspace graph and import the
exported subpaths described below.

## What you may depend on

Three things, and class names are not among them.

**The components** exported from `./renderer`, and their props. **The tokens**
in `docs/shell-variables.md`, which is derived from the stylesheet rather than
written by hand. **The content catalogue**, `SHELL_CONTENT`, which is data you
spread and replace.

The class names in `./renderer/styles.css` are an implementation detail. They
are how the package's own rules find its own elements, and they change when the
markup changes. Writing `.sb-shell .model-card { … }` in your application is
depending on something nobody promised.

This is a fair thing to ask because the package now ships the whole structural
ramp with values, so a consumer never has to reach past a token to get a size,
and because the rules sit in a cascade layer, so a rule of yours outside a
layer beats ours whatever its specificity. Before the layer, a colliding
selector was decided by source order and ours arrived last —
`packages/maximal-client/src/renderer` declared `.inspector__title` against this package's
`.sb-shell .inspector__title`, at (0,1,0) against (0,2,0), and its rule had
never once applied. Nothing reported an error, because a losing rule is not an
error. Atom shipped the same failure as issue #13019.

So if you find yourself needing a selector or an `!important` to get the result
you want, that is a missing token rather than a licence to reach in. Say which
one and it can be added; a token substitutes a value and cannot break the way a
selector can.

## Workbar navigation

Consumers MUST route each visible workbar item to a functional destination.

Consumers MUST map terminal and browser document tabs to their owning workbar
destination rather than use document IDs as workbar selection IDs.

The shell MUST own the `home`, `overview`, and `traffic` glyphs.

## Document tabs

Explicitly closable document tabs MUST retain their close affordance when they
are the last tab. Tabs with an unspecified `closable` value MUST retain the
last-tab protection.

Document transfers MUST carry their consumer-owned snapshot in the optional
`document` metadata rather than terminal session fields.

## Spatial camera

Consumers MUST pass the same world-to-viewport `camera` to
`SpatialCanvasViewport` and the corresponding coordinates to `SpatialCanvasScene`.

Hosts MAY override `--shell-spatial-grid-dot-light`,
`--shell-spatial-grid-dot-dark`, and `--shell-spatial-grid-background-light`
on their shell root to select the spatial canvas palette.

`SpatialCanvasPages` MUST expose the current page title and Pages icon as one
button that toggles the page picker through pointer, Enter, or Space activation.

## Why `dist/` is not committed

Committing it would make workspace imports work without a build, and #70
removed it for two reasons that have not gone away. A tracked build artifact is
rewritten by any build, silently, because `.gitignore` stops applying once a
file is tracked. And the exported output can then disagree with the source it
was built from, which it did: the `./renderer` export shipped one merged pull
request behind `src/`.
