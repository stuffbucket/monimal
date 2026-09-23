# Shutdown lifecycle

`ShutdownLifecycle` follows Visual Studio Code's lifecycle ordering:

1. `onBeforeShutdown` listeners may register synchronous or asynchronous vetos.
2. A veto stops shutdown before cleanup commits.
3. `onWillShutdown` listeners join the committed shutdown with named operations.
4. Default joiners settle before `last` joiners start.
5. `onDidShutdown` fires after every joiner settles.

The model is adapted from VS Code's [`ILifecycleService`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/lifecycle/common/lifecycle.ts) and native [`LifecycleService`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/lifecycle/electron-browser/lifecycleService.ts). The `report` method and observable `ShutdownSnapshot` are this package's extension for product-owned progress UI.

Electron supplies the process boundary. `runMain` prevents every [`before-quit`](https://www.electronjs.org/docs/latest/api/app#event-before-quit) event while one lifecycle request is active. A veto leaves the application running. Completed or explicitly forced work causes one second `app.quit()` pass, which `runMain` lets through. Consumers MUST NOT call `app.exit()` after joined cleanup because it bypasses Electron's remaining quit events and window unload handlers.

A joiner MUST resolve from completion evidence owned by the operation. Elapsed time MUST NOT count as completion. A product MAY offer an explicit force action. `force()` aborts the lifecycle signal and stops waiting; it does not mark pending joiners complete.

Listeners MUST use stable IDs and user-facing labels. Progress surfaces MUST derive pending work from snapshots rather than maintain a second timer or counter.
