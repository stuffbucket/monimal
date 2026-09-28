import type { ReactNode } from 'react';

export interface RetainedTabPanelsProps<Item extends { id: string }> {
  items: readonly Item[];
  activeId: string;
  renderPanel: (item: Item) => ReactNode;
  className?: string;
}

/**
 * One mounted panel per tab, with the inactive ones hidden rather than
 * unmounted, so a panel's state survives switching away and back.
 */
export function RetainedTabPanels<Item extends { id: string }>({
  items,
  activeId,
  renderPanel,
  className,
}: RetainedTabPanelsProps<Item>) {
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className={className} hidden={item.id !== activeId}>
          {renderPanel(item)}
        </div>
      ))}
    </>
  );
}
