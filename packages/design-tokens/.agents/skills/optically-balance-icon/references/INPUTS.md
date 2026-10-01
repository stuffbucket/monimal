# Input reference

The configuration file MUST conform to `assets/config.schema.json`.

## Required choices

- `role` MUST identify one product use, such as `workbar`, `toolbar`, or
  `settings-provider`.
- `candidate.path` and each `references[].path` MUST resolve relative to the
  configuration file unless absolute.
- `slots` MUST contain the actual rendered CSS-pixel sizes.
- `densities` SHOULD be `[1, 2]`.
- `states` SHOULD cover normal, muted, selected, light, and dark appearances
  used by the product. A state records CSS colors as `#RGB`, `#RRGGBB`, or
  `#RRGGBBAA`.
- `references` MUST contain 5–10 approved icons from the same family and role.
- `referenceFamily` MUST be `brand` for brand-mark candidates and references.

## Shape hints

Use only hints supported by visible geometry:

- `curved`
- `pointed`
- `diagonal-heavy`
- `open`
- `dense`
- `asymmetric`
- `brand`

Hints influence the proposal and the required review cues. They MUST NOT be
added merely to force a preferred result.

## Search controls

The defaults constrain scale to 0.85–1.15 and translation to ±1 CSS pixel.
`translationSnap` defaults to 0.25 CSS pixel. Keep these defaults unless the
owning design system already has stricter limits.

Reaching a search limit is a diagnostic. It is not evidence that the limit
should be expanded.
## Source expectations

Inputs MUST be monochrome SVG icons with a `viewBox`. `currentColor` is resolved
from each configured state. Fixed SVG colors are measured as authored, so a
fixed-color icon that is intended to respond to state colors MUST be corrected
at its source before analysis.
