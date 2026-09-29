# Release

`@maximal/maximal-electron` MUST remain a private workspace package.

The package MUST publish no installer, application bundle, executable, update
channel, signing configuration, or application icon.

The package build MUST emit only the host APIs, renderer APIs, stylesheets, and
verification helpers declared by its export map.

`apps/desktop` MUST own application packaging, native-module placement, fuses,
icons, signing, notarization, and release validation.

Consumers that package terminal support MUST run
`@maximal/maximal-electron/verify` against their own artifact.
