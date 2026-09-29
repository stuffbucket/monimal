# Signing

This package MUST NOT own signing credentials, entitlements, signing commands,
notarization, application bundle identifiers, or signed artifacts.

The consuming application MUST own signing and notarization.

`apps/desktop` MUST follow the repository release policy in `RELEASING.md`.

No credential or private key MAY be added to this package.
