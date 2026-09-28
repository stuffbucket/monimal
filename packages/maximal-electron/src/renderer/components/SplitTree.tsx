import type { ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

/** A binary layout tree: a leaf, or two subtrees split right or down. */
export interface SplitTreeBranch<Leaf extends object> {
  direction: 'right' | 'down';
  first: SplitTreeNode<Leaf>;
  second: SplitTreeNode<Leaf>;
}

export type SplitTreeNode<Leaf extends object> = Leaf | SplitTreeBranch<Leaf>;

export interface SplitTreeProps<Leaf extends object> {
  node: SplitTreeNode<Leaf>;
  /** Prefixes every panel id, so sibling trees keep separate layouts. */
  id: string;
  renderLeaf: (leaf: Leaf) => ReactNode;
  className?: string;
  panelClassName?: string;
}

function isBranch<Leaf extends object>(
  node: SplitTreeNode<Leaf>,
): node is SplitTreeBranch<Leaf> {
  return 'direction' in node;
}

/**
 * Renders a split tree as nested resizable panel groups, each split starting
 * at half.
 */
export function SplitTree<Leaf extends object>({
  node,
  id,
  renderLeaf,
  className,
  panelClassName,
}: SplitTreeProps<Leaf>): ReactNode {
  if (!isBranch(node)) return renderLeaf(node);
  const orientation = node.direction === 'right' ? 'horizontal' : 'vertical';
  const first = `${id}-first`;
  const second = `${id}-second`;
  const child = (subtree: SplitTreeNode<Leaf>, path: string) => (
    <SplitTree
      node={subtree}
      id={path}
      renderLeaf={renderLeaf}
      className={className}
      panelClassName={panelClassName}
    />
  );
  return (
    <Group
      orientation={orientation}
      className={className}
      defaultLayout={{ [first]: 50, [second]: 50 }}
      resizeTargetMinimumSize={{ coarse: 20, fine: 9 }}
    >
      <Panel className={panelClassName} id={first} minSize="10%">
        {child(node.first, first)}
      </Panel>
      <Separator
        className={orientation === 'vertical'
          ? 'resize-handle resize-handle--horizontal'
          : 'resize-handle'}
      />
      <Panel className={panelClassName} id={second} minSize="10%">
        {child(node.second, second)}
      </Panel>
    </Group>
  );
}
