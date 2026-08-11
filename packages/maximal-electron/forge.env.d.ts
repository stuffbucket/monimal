/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

/**
 * The plugin's own declaration file hard-codes `MAIN_WINDOW_*` and nothing
 * else, so a second renderer entry gets working globals at run time and no
 * types. These are the pair Forge derives from `demo_window` in
 * `forge.config.ts`.
 *
 * `DEMO_WINDOW_VITE_DEV_SERVER_URL` is only defined while a dev server is
 * running; in a production build it is a falsy literal, which is what the
 * branch in `src/main/windows/main-window.ts` reads.
 */
declare const DEMO_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const DEMO_WINDOW_VITE_NAME: string;
