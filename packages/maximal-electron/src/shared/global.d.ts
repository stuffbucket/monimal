import type { RendererApi } from './ipc.js';

declare global {
  interface Window {
    /** Written by `src/preload/index.ts` via `contextBridge`. */
    stuffbucket: RendererApi;
  }
}

export {};
