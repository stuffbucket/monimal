---
name: add-ipc-channel
description: Add a channel or event to the typed IPC contract, end to end
---

# Add an IPC channel

The most frequent structural change in this repository. The contract is
designed so that a half-finished change fails to compile, so follow the order.

## For a request and response channel

1. **Declare it** in `src/shared/ipc.ts`.
   - Add the entry to `IpcContract`. Use `void` for a channel with no argument.
   - Add the channel name to the `IPC_CHANNELS` array.
   - Add any new payload interface above `IpcContract`.

   Stop and run `npm run typecheck`. It must now fail in `src/main/ipc.ts`,
   because the handler map is missing an entry. That failure is the point.

2. **Handle it** in `src/main/ipc.ts`.
   - Add the entry to the `handlers` object.
   - A handler receives `(request, window)`. `window` is the sender's window,
     or `undefined` if it has gone.
   - Put real logic in a module under `src/main/native/`, and keep the handler
     a one-line call. `collectVersions` is the pattern.

3. **Use it** from the renderer through `bridge.invoke('your:channel', payload)`.
   The argument is required only when the request type is not `void`.

4. **Test it.** Add an assertion to `e2e/shell.spec.ts` that proves a real
   value crosses the boundary, not that a function was called.

## For a main-to-renderer event

1. Add the entry to `IpcEvents` and the name to `IPC_EVENTS`, both in
   `src/shared/ipc.ts`.
2. Send it with `sendEvent(window, 'your:event', payload)` from
   `src/main/ipc.ts`. Never use `webContents.send` directly.
3. Subscribe with `useBridgeEvent('your:event', handler)` in the renderer.
   It unsubscribes on unmount and does not resubscribe on every render.

## Rules

- Never expose `ipcRenderer` through `contextBridge`.
- Never accept a channel name from the renderer as data. Both `invoke` and `on`
  check the name against the contract, and that check is the security boundary.
- A channel that returns data the renderer could compute itself is a smell.
  Channels are for things only the main process can do.
- Validate anything that leaves the application. `shell:open-external` checks
  the protocol against an allow-list. Copy that shape.

## Check your work

```bash
npm run typecheck && npm run lint && npm test
npm run package && npm run test:e2e
```
