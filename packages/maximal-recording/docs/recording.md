# Recording

## Runtime capability

`src/main.ts` MUST accept a host-selected BrowserWindow and output path.

`src/ffmpeg.ts` MUST verify `ffmpeg` and `ffprobe` by executing them before a
recording starts.

The desktop MUST own user consent, destination selection, window selection,
menu state, and shutdown coordination.

The recorder MUST stop when its selected window closes and MUST remove partial
output after capture failure.

## Offline composition

`e2e/demo/edit.ts` MUST validate edit pacing and clip references.

`e2e/demo/compose.ts` MUST compose an existing take without launching an
application.

`e2e/demo/encode.ts` MUST preserve full-range still input when producing the
video-range output.

`npm run test:rules` MUST verify pacing rules.

`npm run compose` MAY re-cut an existing local take and edit.

## Ownership boundary

This package MUST NOT contain a reference application, application build
script, Playwright Electron launcher, product timeline, or still-image harness.

Application-specific automated demonstrations MAY live under `apps/desktop`
when the product defines a maintained timeline.
