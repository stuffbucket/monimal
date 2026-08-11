import { useCallback, useState } from 'react';

import type { Tab } from '../components/TabBar.js';

/**
 * The tab strip's state.
 *
 * "Shell" here is the window frame this package draws, not a command
 * interpreter. The hook knows nothing about terminals and takes no transport.
 *
 * Two operations, each with a rule that is not obvious from the call site:
 * `makeTab` sees the current tabs so it can number the new one however it
 * counts, and closing the last tab is refused rather than leaving an empty
 * document area.
 *
 * Generic over the tab type, because what a tab points at is the caller's. It
 * supplies `makeTab`, so the shape it wants back is the shape it gets.
 * `setTabs` and `setActiveTab` stay exposed for the same reason: the
 * application renames its library tab when the view changes, and the capture
 * fixture selects a run when its tab is activated.
 */
export function useShellTabs<T extends Tab>(
  initial: T[],
  makeTab: (existing: T[]) => T,
) {
  const [tabs, setTabs] = useState<T[]>(initial);
  const [activeTab, setActiveTab] = useState(initial[0]?.id ?? '');

  const openTab = useCallback(() => {
    setTabs((prev) => {
      const next = makeTab(prev);
      setActiveTab(next.id);
      return [...prev, next];
    });
  }, [makeTab]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.id !== id);
        if (next.length === 0) return prev;
        const last = next[next.length - 1];
        if (id === activeTab && last) setActiveTab(last.id);
        return next;
      });
    },
    [activeTab],
  );

  return { tabs, setTabs, activeTab, setActiveTab, openTab, closeTab };
}
