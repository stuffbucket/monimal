---
name: record-demo
description: Record a video of the application driving itself, or re-cut one that exists
---

# Record a demo video

Use this to produce an mp4 of the running application, or to change one that
exists. Full reference is `docs/recording.md`.

## When to use it

- The interface changed and a video in `demo/` now shows the old one.
- A new capability needs to be shown rather than described.
- A release needs an asset that proves the application works.

Do not use it to capture a still. `e2e/demo-stills.stills.ts` does that, and it
is far quicker.

## Run it

```bash
npm run package                     # the recorder drives .vite/, not the package
npm run record                      # capture and cut every timeline
npm run record -- --grep workflow   # one of them

npm run compose -- workflow         # re-cut from frames already captured
```

**Reach for `compose` first.** Changing a hold, an order, a freeze, or a card is
an edit to `demo/edits/<name>.json` and takes about six seconds. Only capture
again when the interface itself changed.

Requires `ffmpeg` and `ffprobe`. Nothing installs them for you. When either is
absent the run stops before it launches anything, names the one command that
fixes it, and tells you to try again.

`src/main/native/ffmpeg.ts` owns that search, and it is the only copy of the
rules. Do not add a second check anywhere. There used to be one in
`scripts/record.mjs`, and it was the weaker of the two: it asked whether a file
existed rather than whether it ran.

A run takes minutes and drives a real application. It parks its windows off the
display, so it does not take the desktop. Set `STUFFBUCKET_E2E_VISIBLE=1` to
watch it.

## Add a sequence

Edit a `*.demo.ts` timeline. A sequence is a card and the actions the viewer
watches. Its hold lives in the edit, not here.

```ts
sequence({
  id: 'library',
  name: 'The caption in the lower third',
  note: 'An optional second line',
  drive: async ({ shell, mark }) => {
    await shell.click('[data-testid="nav-library"]');
    mark('library-open');
  },
});
```

Then add a clip to `demo/edits/<name>.json`. The hold lives there, not here.

Use `sequence()`. An object literal skips the id checks.

Five rules, in the order they catch people:

1. **Make the visible change early in `drive`.** The hold sits on whatever was
   on screen when `drive` returned. `freezeAt` can rescue a badly timed one, but
   only if a frame of the right moment exists.
2. **Call `mark()`** the moment something becomes true. An edit freezes by name,
   which survives the next capture being slower.
3. **Do not lower a pacing constant to fit.** Cut a clip instead.
   `MIN_HOLD_SECONDS` is 5 because 2.5 read as a slideshow.
4. **Move the card to the top** when the page draws along its bottom edge. The
   overlay does. Pass `caption: 'top'`.
5. **Set `target`** when the sequence records a window other than the shell. It
   runs before the clock starts, so setup stays out of the video.

## Add a timeline

Copy an existing `*.demo.ts`. Keep three things:

- `launchDemoApp()` from `./launch.js`, so the theme and the profile start from
  a known state.
- `closeApp(harness)` from `../harness.js`, **not** `app.close()`. A crash
  during teardown lands after the last frame, and a plain close reports a clean
  recording over a process that aborted.
- `record({ app, shell, name, sequences })`, plus an edit at
  `demo/edits/<name>.json` naming the output.

## When a recording looks wrong

| Symptom | Cause |
| --- | --- |
| Blank or white frames | The window is not compositing. Check `backgroundThrottling: false`. |
| Slow motion, longer than the timeline | Somebody replaced the numbered sequence with a concat list. See `docs/recording.md`. |
| Washed out or crushed colour | The `in_range=full:out_range=tv` conversion was dropped from the filter graph. |
| A caption in a later screenshot | `clearCaption` did not run. It belongs in a `finally`. |
| `ffmpeg` reported missing when it is installed | It is somewhere unusual, or it does not run. Set `FFMPEG`, and check the binary matches the architecture. |
| The run rejects the edit before launching | Correct behaviour. It cannot reach 30 seconds. Add clips. |
| A dark box around a card | The card image lost its alpha. See the Cards section of `docs/recording.md`. |
| A card sitting a few pixels off | Its capture rectangle was clamped at the page edge. It must be inset by its margin. |

## Verify

The recorder probes its own output and fails on a short duration or the wrong
codec. That is not enough on its own.

**Watch the result.** Or pull frames at the moments that matter:

```bash
ffmpeg -ss 44 -i demo/stuffbucket-workflow.mp4 -frames:v 1 /tmp/at-44.png
```

A green run with a video that shows the wrong thing is the failure mode here.
It has happened.
