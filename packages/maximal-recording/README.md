# Maximal recording

`@maximal/maximal-recording` provides the window-recording capability used by
`apps/desktop`.

The desktop MUST choose the BrowserWindow and output path. The renderer MUST
NOT supply an arbitrary destination path or start capture without a
host-mediated user action.

In the desktop **File** menu, choose **Record Window…**, select a new `.mp4`
file, then choose **Stop Window Recording**. Recording captures the selected
window without desktop, microphone, or system audio.

The capability requires `ffmpeg` and `ffprobe` on `PATH`, or `FFMPEG` and
`FFPROBE` pointing to executable overrides. Missing tools MUST be reported
before recording begins.

The package retains pure offline composition helpers and pacing-rule tests.
It MUST NOT own an Electron application, application launch harness, product
timeline, or reference-shell still capture.

See [recording architecture](docs/recording.md).
