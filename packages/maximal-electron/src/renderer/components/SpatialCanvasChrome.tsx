import {
  Frame,
  Hand,
  LayoutGrid,
  MessageCircle,
  MessagesSquare,
  Minus,
  MousePointer2,
  Plus,
  Search,
  Shapes,
  Share2,
  StickyNote,
  Workflow,
  X,
} from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button, IconButton } from "./controls/Button.js";

/** A page exposed by spatial canvas page controls. */
export interface SpatialCanvasPage {
  id: string;
  name: string;
}

export type SpatialCanvasToolKind =
  | "select"
  | "hand"
  | "sticky"
  | "shape"
  | "section"
  | "connector"
  | "comment";

function toolIcon(tool: SpatialCanvasToolKind) {
  const props = { size: 16 };
  if (tool === "select") return <MousePointer2 {...props} />;
  if (tool === "hand") return <Hand {...props} />;
  if (tool === "sticky") return <StickyNote {...props} />;
  if (tool === "shape") return <Shapes {...props} />;
  if (tool === "section") return <Frame {...props} />;
  if (tool === "connector") return <Workflow {...props} />;
  return <MessageCircle {...props} />;
}

/** Renders one compact icon action in the spatial editing toolbar. */
export function SpatialCanvasToolButton({
  tool,
  label,
  shortcut,
  active,
  onClick,
}: {
  tool: SpatialCanvasToolKind;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}) {
  const accessibleLabel = `${label} (${shortcut})`;
  return (
    <IconButton
      label={accessibleLabel}
      tooltip={accessibleLabel}
      active={active}
      onClick={onClick}
    >
      {toolIcon(tool)}
    </IconButton>
  );
}

export type SpatialCanvasHeaderActionKind =
  | "menu"
  | "comments"
  | "chat"
  | "share"
  | "search";

function headerActionIcon(kind: SpatialCanvasHeaderActionKind) {
  const props = { size: 16 };
  if (kind === "menu") return <LayoutGrid {...props} />;
  if (kind === "comments") return <MessageCircle {...props} />;
  if (kind === "chat") return <MessagesSquare {...props} />;
  if (kind === "search") return <Search {...props} />;
  return <Share2 {...props} />;
}

/** Renders a compact icon action in the spatial canvas header. */
export const SpatialCanvasHeaderAction = forwardRef<
  HTMLButtonElement,
  {
    kind: SpatialCanvasHeaderActionKind;
    label: string;
    active?: boolean;
  } & Omit<ComponentPropsWithoutRef<"button">, "children" | "aria-label">
>(function SpatialCanvasHeaderAction(
  { kind, label, active, ...props },
  ref,
) {
  return (
    <IconButton {...props} ref={ref} label={label} active={active}>
      {headerActionIcon(kind)}
    </IconButton>
  );
});

/** Positions primary spatial canvas actions across the top edge. */
export function SpatialCanvasTopBar({ children }: { children: ReactNode }) {
  return <header className="spatial-canvas__topbar">{children}</header>;
}

/** Groups controls within a spatial canvas corner. */
export function SpatialCanvasCorner({ children }: { children: ReactNode }) {
  return <div className="spatial-canvas__corner">{children}</div>;
}

function EditableSpatialCanvasName({
  value,
  label,
  placement = "trigger",
  onCommit,
  onCancel,
}: {
  value: string;
  label: string;
  placement?: "trigger" | "popover";
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    input.current?.select();
  }, []);

  const commit = () => {
    const name = draft.trim();
    if (name) onCommit(name);
    else onCancel();
  };

  return (
    <input
      ref={input}
      className={`spatial-canvas__name-input spatial-canvas__name-input--${placement}`}
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

/** Renders editable project and page navigation for a spatial canvas. */
export function SpatialCanvasPages({
  projectName = "Projects",
  onProjectRename,
  pages,
  activePageId,
  panelId,
  onPageChange,
  onAddPage,
  onPageRename,
  onPageMove,
}: {
  projectName?: string;
  onProjectRename?: (name: string) => void;
  pages: ReadonlyArray<SpatialCanvasPage>;
  activePageId: string;
  panelId: string;
  onPageChange: (pageId: string) => void;
  onAddPage: () => void;
  onPageRename?: (pageId: string, name: string) => void;
  onPageMove?: (pageId: string, targetPageId: string) => void;
}) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const wasFocused = useRef<string | undefined>(undefined);
  const [focusedControl, setFocusedControl] = useState<string | undefined>(
    undefined,
  );
  const [open, setOpen] = useState<"project" | "pages" | undefined>(undefined);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [editingInTrigger, setEditingInTrigger] = useState(false);
  const [draggingPageId, setDraggingPageId] = useState<string | undefined>(
    undefined,
  );
  const activePage = pages.find((page) => page.id === activePageId);

  const beginProjectEdit = () => {
    if (onProjectRename) {
      setEditingInTrigger(true);
      setEditing("project");
    }
  };
  const beginPageEdit = (pageId: string, inTrigger = false) => {
    if (onPageRename) {
      setEditingInTrigger(inTrigger);
      setEditing(pageId);
    }
  };
  const toggle = (target: "project" | "pages") => {
    setEditing(undefined);
    setEditingInTrigger(false);
    setOpen((current) => current === target ? undefined : target);
  };
  const prepareFocusedClick = (
    target: "project" | "pages",
    element: HTMLButtonElement,
  ) => {
    wasFocused.current = focusedControl === target ? target : undefined;
    element.focus();
  };
  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % pages.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + pages.length) % pages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = pages.length - 1;
    else return;

    event.preventDefault();
    const page = pages[next];
    if (page === undefined) return;
    onPageChange(page.id);
    tabs.current[next]?.focus();
  };

  return (
    <div className="spatial-canvas__pages" data-open={open ?? "false"}>
      {editing === "project" ?
        <EditableSpatialCanvasName
          value={projectName}
          label="Project name"
          onCommit={(name) => {
            onProjectRename?.(name);
            setEditing(undefined);
            setEditingInTrigger(false);
          }}
          onCancel={() => {
            setEditing(undefined);
            setEditingInTrigger(false);
          }}
        />
      : <button
          type="button"
          className="spatial-canvas__project-trigger"
          aria-expanded={open === "project"}
          aria-controls={open === "project" ? `${panelId}-projects` : undefined}
          data-focused={focusedControl === "project"}
          onPointerDown={(event) => {
            prepareFocusedClick("project", event.currentTarget);
          }}
          onFocus={() => setFocusedControl("project")}
          onBlur={() => setFocusedControl(undefined)}
          onClick={() => {
            if (wasFocused.current === "project" && open === "project") {
              beginProjectEdit();
            } else {
              toggle("project");
            }
          }}
        >
          <span className="spatial-canvas__project-title">{projectName}</span>
        </button>
      }
      <span className="spatial-canvas__pages-divider" aria-hidden="true" />
      {editingInTrigger && activePage && editing === activePage.id ?
        <EditableSpatialCanvasName
          value={activePage.name}
          label={`Rename ${activePage.name}`}
          onCommit={(name) => {
            onPageRename?.(activePage.id, name);
            setEditing(undefined);
            setEditingInTrigger(false);
          }}
          onCancel={() => {
            setEditing(undefined);
            setEditingInTrigger(false);
          }}
        />
      : <button
          type="button"
          className="spatial-canvas__page-trigger"
          aria-label={`Pages: ${activePage?.name ?? "Untitled"}`}
          aria-expanded={open === "pages"}
          aria-controls={open === "pages" ? `${panelId}-pages` : undefined}
          data-focused={focusedControl === "pages"}
          onPointerDown={(event) => {
            prepareFocusedClick("pages", event.currentTarget);
          }}
          onFocus={() => setFocusedControl("pages")}
          onBlur={() => setFocusedControl(undefined)}
          onClick={() => {
            if (
              wasFocused.current === "pages"
              && open === "pages"
              && activePage
            ) {
              beginPageEdit(activePage.id, true);
            } else {
              toggle("pages");
            }
          }}
        >
          <span
            className="spatial-canvas__page-count"
            aria-label={`${String(pages.length)} pages`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="6.5" y="2.5" width="15" height="17" rx="2" />
              <rect x="2.5" y="6.5" width="15" height="15" rx="2" />
              <text
                className="spatial-canvas__page-count-value"
                x="10"
                y="14"
              >
                {pages.length > 9 ? "…" : pages.length}
              </text>
            </svg>
          </span>
          <span className="spatial-canvas__page-title">
            {activePage?.name ?? "Untitled"}
          </span>
        </button>
      }
      {open === "project" ?
        <aside
          id={`${panelId}-projects`}
          className="spatial-canvas__pages-popover"
          aria-label="Projects"
        >
          <header>
            <strong>Projects</strong>
          </header>
          <div role="listbox" aria-label="Projects">
            <button
              type="button"
              role="option"
              aria-selected="true"
              className="spatial-canvas__navigation-row"
              onPointerDown={(event) => {
                wasFocused.current =
                  document.activeElement === event.currentTarget
                    ? "project-row"
                    : undefined;
              }}
              onClick={() => {
                if (wasFocused.current === "project-row") beginProjectEdit();
              }}
            >
              {projectName}
              <span>{pages.length}</span>
            </button>
          </div>
        </aside>
      : null}
      {open === "pages" ?
        <aside
          id={`${panelId}-pages`}
          className="spatial-canvas__pages-popover"
          aria-label="Pages"
        >
          <header>
            <strong>Pages</strong>
            <IconButton label="Add page" onClick={onAddPage}>
              <Plus size={16} />
            </IconButton>
          </header>
          <div role="tablist" aria-label="Map pages">
            {pages.map((page, index) =>
              editing === page.id && !editingInTrigger ?
                <EditableSpatialCanvasName
                  key={page.id}
                  value={page.name}
                  label={`Rename ${page.name}`}
                  placement="popover"
                  onCommit={(name) => {
                    onPageRename?.(page.id, name);
                    setEditing(undefined);
                    setEditingInTrigger(false);
                  }}
                  onCancel={() => {
                    setEditing(undefined);
                    setEditingInTrigger(false);
                  }}
                />
              : <button
                  type="button"
                  role="tab"
                  className="spatial-canvas__navigation-row"
                  draggable={Boolean(onPageMove)}
                  key={page.id}
                  ref={(element) => {
                    tabs.current[index] = element;
                  }}
                  id={`${panelId}-tab-${String(index)}`}
                  aria-controls={panelId}
                  aria-selected={page.id === activePageId}
                  tabIndex={page.id === activePageId ? 0 : -1}
                  data-dragging={draggingPageId === page.id}
                  onKeyDown={(event) => moveFocus(event, index)}
                  onPointerDown={(event) => {
                    wasFocused.current =
                      document.activeElement === event.currentTarget
                        ? page.id
                        : undefined;
                  }}
                  onClick={() => {
                    if (wasFocused.current === page.id) {
                      beginPageEdit(page.id);
                    } else {
                      onPageChange(page.id);
                    }
                  }}
                  onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                    setDraggingPageId(page.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", page.id);
                  }}
                  onDragOver={(event) => {
                    if (draggingPageId && draggingPageId !== page.id) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const source =
                      draggingPageId || event.dataTransfer.getData("text/plain");
                    if (source) onPageMove?.(source, page.id);
                    setDraggingPageId(undefined);
                  }}
                  onDragEnd={() => setDraggingPageId(undefined)}
                >
                  <span>{page.name}</span>
                </button>,
            )}
          </div>
        </aside>
      : null}
    </div>
  );
}

/** Groups participant presence and sharing controls. */
export function SpatialCanvasPresence({ children }: { children: ReactNode }) {
  return (
    <div
      className="spatial-canvas__presence"
      role="group"
      aria-label="People in this project map"
    >
      {children}
    </div>
  );
}

/** Renders a compact participant avatar with a dynamic presence color. */
export function SpatialCanvasAvatar({
  initials,
  color,
  title,
}: {
  initials: string;
  color: string;
  title: string;
}) {
  return (
    <span
      className="spatial-canvas__avatar"
      title={title}
      role="img"
      aria-label={title}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}

/** Positions the primary spatial editing tools. */
export function SpatialCanvasControlGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav className="spatial-canvas__controls" aria-label={label}>
      {children}
    </nav>
  );
}

/** Renders a compact floating inspector over the spatial canvas. */
export function SpatialCanvasFloatingPanel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <aside className="spatial-canvas__floating-panel" aria-label={label}>
      {children}
    </aside>
  );
}

/** Renders a dismissible side panel over the spatial canvas. */
export function SpatialCanvasSidePanel({
  label,
  title,
  onClose,
  children,
  footer,
  header,
  edge = false,
}: {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  edge?: boolean;
}) {
  return (
    <aside
      className="spatial-canvas__side-panel"
      aria-label={label}
      data-edge={edge}
    >
      <header>
        {header ?? <strong>{title}</strong>}
        <IconButton label={`Close ${title}`} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="spatial-canvas__side-panel-body">{children}</div>
      {footer}
    </aside>
  );
}

/** Renders zoom in, reset, and zoom out controls. */
export function SpatialCanvasZoomControls({
  zoom,
  onZoomOut,
  onReset,
  onZoomIn,
}: {
  zoom: number;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
}) {
  return (
    <div
      className="spatial-canvas__zoom"
      role="group"
      aria-label="Zoom controls"
    >
      <IconButton label="Zoom out" onClick={onZoomOut}>
        <Minus size={16} />
      </IconButton>
      <Button size="sm" onClick={onReset}>
        {Math.round(zoom * 100)}%
      </Button>
      <IconButton label="Zoom in" onClick={onZoomIn}>
        <Plus size={16} />
      </IconButton>
    </div>
  );
}
