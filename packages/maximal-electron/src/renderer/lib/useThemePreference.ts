import { useEffect } from 'react';

/**
 * The one field this hook reads.
 *
 * Structural rather than an import of `src/shared/ipc.ts`: that contract is
 * this application's, and a consumer's preferences are their own. `theme` is
 * optional so a partial object is a no-op rather than a type error.
 */
export interface ThemePreference {
  theme?: 'system' | 'light' | 'dark';
}

/**
 * Applies the theme preference to the document.
 *
 * It writes `data-theme` on `document.documentElement`, so a consumer's own
 * palette selects on `[data-theme='light']`. `system` removes the attribute
 * rather than setting a third value, so the stylesheet's own
 * `prefers-color-scheme` query decides. Any shell that reads preferences needs
 * this, and there is exactly one correct way to write it.
 *
 * It observes nothing. The value is the caller's to keep current, so a hook
 * that expects the operating system's theme to arrive here waits forever.
 */
export function useThemePreference(prefs: ThemePreference | undefined): void {
  useEffect(() => {
    const theme = prefs?.theme;
    if (!theme) return;
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [prefs]);
}
