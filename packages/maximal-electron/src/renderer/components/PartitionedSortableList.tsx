import {
  useEffect,
  useId,
  useState,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

import { useComponentStyles } from '../lib/component-styles.js';
import { IconButton } from './controls/Button.js';
import { Switch } from './controls/Fields.js';

export interface PartitionedSortableItem {
  id: string;
  label: string;
  description?: string;
  toggleDisabled?: boolean;
  toggleBlocked?: boolean;
  toggleTooltip?: ReactNode;
}

export interface PartitionedSortableListProps {
  enabledItems: readonly PartitionedSortableItem[];
  disabledItems: readonly PartitionedSortableItem[];
  disabled?: boolean;
  requestedExpandedItemId?: string | null;
  renderDetails?: (item: PartitionedSortableItem, enabled: boolean) => ReactNode;
  onChange: (
    enabledItems: PartitionedSortableItem[],
    disabledItems: PartitionedSortableItem[],
  ) => void;
}

type Partition = 'enabled' | 'disabled';

function moveItem(
  enabledItems: readonly PartitionedSortableItem[],
  disabledItems: readonly PartitionedSortableItem[],
  itemId: string,
  target: Partition,
  targetIndex: number,
): [PartitionedSortableItem[], PartitionedSortableItem[]] {
  const item = [...enabledItems, ...disabledItems].find(({ id }) => id === itemId);
  if (item === undefined) return [[...enabledItems], [...disabledItems]];

  const nextEnabled = enabledItems.filter(({ id }) => id !== itemId);
  const nextDisabled = disabledItems.filter(({ id }) => id !== itemId);
  const targetItems = target === 'enabled' ? nextEnabled : nextDisabled;
  targetItems.splice(Math.min(Math.max(targetIndex, 0), targetItems.length), 0, item);
  return [nextEnabled, nextDisabled];
}

const STYLES = `
.sb-shell .partitioned-sortable {
  --shell-partitioned-sortable-drag-opacity: 0.5;
  --shell-partitioned-sortable-grip-width: 16px;
  min-width: 0;
}
.sb-shell .partitioned-sortable__list {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1);
  min-height: calc(var(--shell-control-lg) * 3);
  margin: 0;
  padding: var(--shell-space-2);
  border: 1px solid var(--shell-border-strong, var(--shell-border));
  border-radius: var(--shell-radius);
  background: transparent;
  list-style: none;
}
.sb-shell .partitioned-sortable__item {
  display: flex;
  flex-direction: column;
  border: 1px solid transparent;
  border-radius: var(--shell-radius);
  background: var(--shell-hover);
}
.sb-shell .partitioned-sortable__item[data-enabled='false'] {
  border-color: var(--shell-border-strong, var(--shell-border));
  background: transparent;
}
.sb-shell .partitioned-sortable__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--shell-space-2);
  min-height: var(--shell-control-lg);
  padding: var(--shell-space-2);
}
.sb-shell .partitioned-sortable__row[data-has-details='true'] {
  grid-template-columns: auto auto minmax(0, 1fr) auto;
}
.sb-shell .partitioned-sortable__item[data-dragging='true'] { opacity: var(--shell-partitioned-sortable-drag-opacity); }
.sb-shell .partitioned-sortable__grip { color: var(--shell-text-subtle); cursor: grab; }
.sb-shell .partitioned-sortable__content {
  display: flex; flex-direction: column; min-width: 0;
}
.sb-shell .partitioned-sortable__label { font-size: var(--shell-text-base); font-weight: var(--shell-weight-lg); }
.sb-shell .partitioned-sortable__item[data-enabled='false'] .partitioned-sortable__label {
  color: var(--shell-text-muted);
}
.sb-shell .partitioned-sortable__description {
  overflow: hidden;
  color: var(--shell-text-subtle);
  font-size: var(--shell-text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-shell .partitioned-sortable__actions {
  display: flex; align-items: center; gap: var(--shell-space-1);
}
.sb-shell .partitioned-sortable__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--shell-control-lg);
  height: var(--shell-control-lg);
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius);
  color: var(--shell-text-muted);
  background: transparent;
  cursor: pointer;
}
.sb-shell .partitioned-sortable__action:hover:not(:disabled) {
  color: var(--shell-text); background: var(--shell-active);
}
.sb-shell .partitioned-sortable__action:focus-visible {
  outline: var(--shell-focus-ring-width) solid var(--shell-focus, var(--shell-accent)); outline-offset: var(--shell-focus-ring-offset);
}
.sb-shell .partitioned-sortable__action:disabled {
  opacity: var(--shell-partitioned-sortable-drag-opacity); cursor: default;
}
.sb-shell .partitioned-sortable__disclosure svg {
  transition: transform 120ms ease-out;
}
.sb-shell .partitioned-sortable__disclosure[aria-expanded='true'] svg {
  transform: rotate(90deg);
}
.sb-shell .partitioned-sortable__toggle.switch {
  width: auto;
}
.sb-shell .partitioned-sortable__details {
  padding:
    var(--shell-space-3)
    var(--shell-space-3)
    var(--shell-space-4)
    calc(
      var(--shell-space-2) + var(--shell-partitioned-sortable-grip-width) + var(--shell-space-2) +
      var(--shell-control-lg) + var(--shell-space-2)
    );
  border-top: 1px solid var(--shell-border);
}
.sb-shell .partitioned-sortable__empty {
  display: grid; flex: 1; place-items: center;
  min-height: calc(var(--shell-control-lg) * 2);
  color: var(--shell-text-subtle);
  font-size: var(--shell-text-sm);
}
.sb-shell .partitioned-sortable__announcement {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
`;
export function PartitionedSortableList({
  enabledItems,
  disabledItems,
  disabled = false,
  requestedExpandedItemId,
  renderDetails,
  onChange,
}: PartitionedSortableListProps): ReactElement {
  useComponentStyles('partitioned-sortable', STYLES);
  const listId = useId();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (requestedExpandedItemId !== undefined && requestedExpandedItemId !== null) {
      setExpandedId(requestedExpandedItemId);
    }
  }, [requestedExpandedItemId]);

  const move = (
    item: PartitionedSortableItem,
    target: Partition,
    targetIndex: number,
  ): void => {
    const [nextEnabled, nextDisabled] = moveItem(
      enabledItems,
      disabledItems,
      item.id,
      target,
      targetIndex,
    );
    onChange(nextEnabled, nextDisabled);
    const position = (target === 'enabled' ? nextEnabled : nextDisabled)
      .findIndex(({ id }) => id === item.id) + 1;
    setAnnouncement(`${item.label} moved to ${target}, position ${position}.`);
  };

  const drop = (
    event: DragEvent,
    target: Partition,
    targetIndex: number,
  ): void => {
    event.preventDefault();
    const itemId = draggedId ?? event.dataTransfer.getData('text/plain');
    const item = [...enabledItems, ...disabledItems].find(({ id }) => id === itemId);
    const source = enabledItems.some(({ id }) => id === itemId) ? 'enabled' : 'disabled';
    if (item !== undefined && source === target) move(item, target, targetIndex);
    setDraggedId(null);
  };

  const items = [
    ...enabledItems.map((item, index) => ({ item, index, partition: 'enabled' as const })),
    ...disabledItems.map((item, index) => ({ item, index, partition: 'disabled' as const })),
  ];

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="partitioned-sortable">
      <ol
        className="partitioned-sortable__list"
        aria-label="Provider order"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const itemId = draggedId ?? event.dataTransfer.getData('text/plain');
          const partition = enabledItems.some(({ id }) => id === itemId)
            ? 'enabled'
            : 'disabled';
          drop(
            event,
            partition,
            partition === 'enabled' ? enabledItems.length : disabledItems.length,
          );
        }}
      >
        {items.map(({ item, index, partition }) => {
          const enabled = partition === 'enabled';
          const expanded = expandedId === item.id;
          const detailsId = `${listId}-${item.id}-details`;
          const partitionItems = enabled ? enabledItems : disabledItems;
          return (
          <li
            className="partitioned-sortable__item"
            data-enabled={enabled}
            data-dragging={draggedId === item.id || undefined}
            draggable={!disabled}
            key={item.id}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', item.id);
              setDraggedId(item.id);
            }}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.stopPropagation();
              drop(event, partition, index);
            }}
          >
            <div
              className="partitioned-sortable__row"
              data-has-details={renderDetails ? 'true' : undefined}
            >
            <GripVertical aria-hidden="true" className="partitioned-sortable__grip" size={16} />
            {renderDetails ? (
              <IconButton
                className="partitioned-sortable__action partitioned-sortable__disclosure"
                label={`${expanded ? 'Collapse' : 'Configure'} ${item.label}`}
                tooltip={expanded ? 'Collapse' : 'Configure'}
                aria-expanded={expanded}
                aria-controls={detailsId}
                disabled={disabled}
                onClick={() => setExpandedId(expanded ? null : item.id)}
              >
                <ChevronRight aria-hidden="true" size={15} />
              </IconButton>
            ) : null}
            <div className="partitioned-sortable__content">
              <span className="partitioned-sortable__label">{item.label}</span>
              {item.description ? (
                <span className="partitioned-sortable__description">{item.description}</span>
              ) : null}
            </div>
            <div className="partitioned-sortable__actions">
              <IconButton
                className="partitioned-sortable__action"
                label={`Move ${item.label} up`}
                tooltip="Move up"
                disabled={disabled || index === 0}
                onClick={() => move(item, partition, index - 1)}
              >
                <ArrowUp aria-hidden="true" size={15} />
              </IconButton>
              <IconButton
                className="partitioned-sortable__action"
                label={`Move ${item.label} down`}
                tooltip="Move down"
                disabled={disabled || index === partitionItems.length - 1}
                onClick={() => move(item, partition, index + 1)}
              >
                <ArrowDown aria-hidden="true" size={15} />
              </IconButton>
              <Switch
                label={`${partition === 'enabled' ? 'Disable' : 'Enable'} ${item.label}`}
                displayLabel={null}
                tooltip={item.toggleTooltip ?? (enabled ? 'Enabled' : 'Disabled')}
                className="partitioned-sortable__toggle"
                checked={enabled}
                disabled={disabled || item.toggleDisabled}
                onChange={(nextEnabled) => {
                  if (nextEnabled && item.toggleBlocked) {
                    setExpandedId(item.id);
                    setAnnouncement(`${item.label} needs valid settings before it can be enabled.`);
                    return;
                  }
                  move(
                    item,
                    nextEnabled ? 'enabled' : 'disabled',
                    nextEnabled ? enabledItems.length : disabledItems.length,
                  );
                }}
              />
            </div>
            </div>
            {expanded && renderDetails ? (
              <div className="partitioned-sortable__details" id={detailsId}>
                {renderDetails(item, enabled)}
              </div>
            ) : null}
          </li>
          );
        })}
        {items.length === 0 ? (
          <li className="partitioned-sortable__empty">Drop items here</li>
        ) : null}
      </ol>
        <span className="partitioned-sortable__announcement" aria-live="polite">
          {announcement}
        </span>
      </div>
    </Tooltip.Provider>
  );
}