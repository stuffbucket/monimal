import { resolve } from 'node:path';

export const MAIN_RENDERER_CACHE = resolve(import.meta.dirname, '.vite/cache/main_window');
export const DEMO_RENDERER_CACHE = resolve(import.meta.dirname, '.vite/cache/demo_window');
export const TERMINAL_LAB_RENDERER_CACHE = resolve(import.meta.dirname, '.vite/cache/terminal_lab_window');