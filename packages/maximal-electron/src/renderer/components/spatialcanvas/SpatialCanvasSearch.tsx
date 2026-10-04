import { FolderGit2 } from "lucide-react";
import { Children, type ReactNode } from "react";

/** Lists project matches within spatial canvas chrome. */
export function SpatialCanvasSearchResults({
  children,
  emptyMessage,
}: {
  children: ReactNode;
  emptyMessage: string;
}) {
  return (
    <div className="spatial-canvas__search-results" role="list">
      {Children.count(children) > 0 ? children : (
        <span className="spatial-canvas__search-empty">{emptyMessage}</span>
      )}
    </div>
  );
}

/** Renders one compact project match in a spatial search panel. */
export function SpatialCanvasSearchResult({
  title,
  description,
  disabled = false,
  onSelect,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <div role="listitem">
      <button
        type="button"
        className="spatial-canvas__search-result"
        disabled={disabled}
        onClick={onSelect}
      >
        <FolderGit2 size={16} aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </button>
    </div>
  );
}
