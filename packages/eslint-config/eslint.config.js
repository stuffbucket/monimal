import { base } from "./base.js"

// This package lints under `./base` rather than `./service`, and that is not
// an oversight: `./service` runs typescript-eslint, and there is no
// TypeScript here to point a project service at. What is left -- ESLint's
// recommended set over four plain ESM modules -- is the whole of what applies.
//
// It matters that this runs at all. These files decide what every other
// package's lint means, and a config package that is itself unlinted is the
// one place where a typo survives: an unused import or a shadowed binding
// here would not fail anywhere, it would quietly change which rules the
// workspace enforces.
export default [...base()]
