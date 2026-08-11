import * as Tabs from '@radix-ui/react-tabs';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { FileText, Folder, Plus, Settings, SquareTerminal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import {
  adornmentLabel,
  tabSlot,
  type TabAdornment,
  type TabIconName,
} from '../lib/tab-adornment.js';

/**
 * One tab. What it tabs is the caller's business.
 *
 * This carried a `kind` of `library | terminal | run` and a `state` union
 * copied by hand from the capture fixture's `RunStatus`. Neither belonged to a
 * tab strip: `kind` only ever selected an icon, and `run` was a concept from a
 * fixture that the product had no idea about.
 *
 * `TabAdornment` carries the status dot, the sourced icon and the emphasis.
 * `src/renderer/lib/tab-adornment.ts` holds the rules for all three.
 */
export interface Tab extends TabAdornment {
  id: string;
  title: string;
}

/** The glyph behind each name in `TAB_ICON_NAMES`. */
const TAB_ICON_GLYPHS: Record<TabIconName, ComponentType<{ size?: number }>> = {
  document: FileText,
  folder: Folder,
  settings: Settings,
  terminal: SquareTerminal,
};

/**
 * Everything needed to drive a tab strip.
 *
 * Declared once because three components in a row forward it: `ShellLayout`
 * takes it, hands it to `TitleBar`, which hands it to `TabBar`.
 */
export interface TabStripProps<T extends Tab> {
  /** Stable namespace shared by the triggers and the consumer's tabpanels. */
  tabIdBase: string;
  tabs: T[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onNewTab?: () => void;
  /** Only one tab strip on a page can be the primary one. */
  tabsLabel?: string;
  newTabLabel?: string;
  /** A component for the slot, overriding whatever `tab.icon` names. */
  tabIcon?: (tab: T) => ComponentType<{ size?: number }> | undefined;
}

function safeIdPart(value: string) {
  return encodeURIComponent(value);
}

/** The ID applied to a tab trigger for a consumer-rendered panel. */
export function getTabTriggerId(tabIdBase: string, tabId: string) {
  return `${tabIdBase}-tab-${safeIdPart(tabId)}`;
}

/** The ID applied to the panel controlled by a tab trigger. */
export function getTabPanelId(tabIdBase: string, tabId: string) {
  return `${tabIdBase}-tabpanel-${safeIdPart(tabId)}`;
}

/**
 * Whether a label is wider than the room it has.
 *
 * The fade has to be measured, not assumed. A mask applied unconditionally
 * fades any text that happens to end near the right edge, so `Terminal 1`
 * rendered as `Terminal` in a tab with room to spare — the mask cannot tell
 * "reaches the edge" from "overflows it".
 *
 * Re-measured on resize, because a tab shrinks as the strip fills.
 */
function useTruncated(): [
  (element: HTMLElement | null) => void,
  boolean,
] {
  const [truncated, setTruncated] = useState(false);
  const node = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const element = node.current;
    if (element) setTruncated(element.scrollWidth > element.clientWidth);
  }, []);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      node.current = element;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const element = node.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  return [ref, truncated];
}

/** One tab's label, faded only when it does not fit. */
function TabLabel({ title }: { title: string }) {
  const [ref, truncated] = useTruncated();
  return (
    <span className="tab__label" ref={ref} data-truncated={truncated || undefined}>
      {title}
    </span>
  );
}

/**
 * A document tab strip.
 *
 * `ShellLayout` renders one into the title bar from its own tab props, so a
 * caller composing the frame does not reach for this directly. It is exported
 * for a document surface that is not the shell.
 *
 * A tab carries an icon by name rather than by component, because a tab
 * crosses a process boundary in this application and a component does not
 * serialise.
 */
export function TabBar<T extends Tab>({
  tabIdBase,
  tabs,
  active,
  onSelect,
  onClose,
  onNew,
  icon,
  label = 'Open documents',
  newLabel = 'New tab',
}: {
  tabIdBase: string;
  tabs: T[];
  active: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onNew?: () => void;
  /** A component for the slot, overriding whatever `tab.icon` names. */
  icon?: (tab: T) => ComponentType<{ size?: number }> | undefined;
  label?: string;
  newLabel?: string;
}) {
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  const activeItem = tabs[activeIndex];
  // Closing the last tab is refused, so every close affordance hangs off this
  // rather than repeating the condition.
  const closeTab = tabs.length > 1 ? onClose : undefined;

  /*
   * Which trigger to focus once the caller has dropped a tab.
   *
   * Closing unmounts the element that held focus, and focus then falls to the
   * document body, which costs the user the strip's single tab stop. The
   * neighbour is chosen before the close and claimed after the list changes,
   * because the neighbour cannot be identified once the tab is gone.
   */
  const focusAfterClose = useRef<string | null>(null);

  useEffect(() => {
    const id = focusAfterClose.current;
    if (id === null) return;
    focusAfterClose.current = null;
    document.getElementById(getTabTriggerId(tabIdBase, id))?.focus();
  }, [tabs, tabIdBase]);

  /*
   * Only for a close the keyboard started. A pointer close leaves focus where
   * it was, because the pointer never took it: the marker cancels its own
   * `pointerdown`, and pulling focus into the strip would take it from
   * whatever the closed tab was sitting beside, such as a live terminal.
   */
  const closeAndRefocus = (index: number) => {
    const tab = tabs[index];
    if (!closeTab || !tab) return;
    focusAfterClose.current = (tabs[index + 1] ?? tabs[index - 1])?.id ?? null;
    closeTab(tab.id);
  };

  return (
    <Tabs.Root
      value={active}
      onValueChange={onSelect}
      className="tabs"
      activationMode="manual"
    >
      <Tabs.List className="tabbar" aria-label={label}>
        {tabs.map((tab, index) => {
          const Custom = icon?.(tab);
          const slot = tabSlot(tab, Custom !== undefined);
          const Named = tab.icon === undefined ? undefined : TAB_ICON_GLYPHS[tab.icon];
          const Glyph = slot === 'custom' ? Custom : slot === 'icon' ? Named : undefined;
          const words = adornmentLabel(tab);
          return (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="tab"
              data-emphasis={tab.emphasis}
              id={getTabTriggerId(tabIdBase, tab.id)}
              /*
               * The caller renders one panel, for the active tab. Naming a
               * panel that no tab is showing points `aria-controls` at an ID
               * that is not in the document.
               */
              aria-controls={
                tab.id === active ? getTabPanelId(tabIdBase, tab.id) : undefined
              }
              aria-keyshortcuts={closeTab ? 'Delete' : undefined}
              onKeyDown={(event) => {
                if (!closeTab) return;
                // The key macOS prints as "delete" sends Backspace, so both
                // close. Neither has a default action worth keeping on a tab.
                if (event.key !== 'Delete' && event.key !== 'Backspace') return;
                event.preventDefault();
                closeAndRefocus(index);
              }}
            >
              {Glyph && <Glyph size={13} />}
              {slot === 'status' && (
                <span className="dot" data-status={tab.status} aria-hidden="true" />
              )}
              {tab.emphasis && <span className="tab__emphasis" aria-hidden="true" />}
              <TabLabel title={tab.title} />
              {/* After the label, so the tab reads "Terminal 1, Working". */}
              {words !== undefined && <VisuallyHidden>{words}</VisuallyHidden>}
              {closeTab && (
                <span
                  aria-hidden="true"
                  className="tab__close"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    closeTab(tab.id);
                  }}
                >
                  <X size={12} />
                </span>
              )}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      {closeTab && activeItem && (
        <button
          type="button"
          className="tab__close-keyboard"
          aria-label={`Close ${activeItem.title}`}
          onClick={() => closeAndRefocus(activeIndex)}
        >
          <X size={12} />
        </button>
      )}
      {onNew && (
        <button
          type="button"
          className="tab__new"
          onClick={onNew}
          aria-label={newLabel}
          data-testid="tab-new"
        >
          <Plus size={14} />
        </button>
      )}
    </Tabs.Root>
  );
}
