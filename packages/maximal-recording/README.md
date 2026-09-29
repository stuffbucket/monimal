# Maximal recording

`@maximal/maximal-recording` provides a window-video capability to
`apps/desktop` and owns the optional reference-shell demo recorder. The desktop
host chooses the window and output path; the renderer never supplies a file
path or starts a capture on its own.

In the desktop application's **File** menu, choose **Record Window…**, select
a new `.mp4` file, then choose **Stop Window Recording** to save it. Only the
main window's image is captured (no desktop, microphone, or system audio).
Recording runs at 10 frames per second and requires `ffmpeg` and `ffprobe` on
`PATH`, or `FFMPEG` and `FFPROBE` pointing to them. Missing tools are reported
before recording begins. The capability also stops on window close or app
shutdown.

The reference-shell timeline and stills are separate developer tools. From
the repository root:

```sh
pnpm --filter @maximal/maximal-recording run build:app
pnpm --filter @maximal/maximal-recording run record
pnpm --filter @maximal/maximal-recording run stills
pnpm --filter @maximal/maximal-recording run compose -- pipeline-check
```

To supply the encoder with mise:

```sh
mise exec conda:ffmpeg@8.0.1 -- pnpm --filter @maximal/maximal-recording run record
```

`demo/edits/pipeline-check.json` is the tracked cut; raw takes and generated
video are produced on demand. See [recording.md](docs/recording.md) for the
capture and compose pipeline.
