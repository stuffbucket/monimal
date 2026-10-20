import type { ReactNode } from 'react'

export interface CompactControlClusterProps {
  label: string
  className?: string
  children: ReactNode
}

export function CompactControlCluster({
  label,
  className,
  children,
}: CompactControlClusterProps) {
  return (
    <div
      aria-label={label}
      className={['maximal-control-cluster', className]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
    >
      {children}
    </div>
  )
}

export interface CompactControlGroupProps {
  label: string
  children: ReactNode
}

export function CompactControlGroup({
  label,
  children,
}: CompactControlGroupProps) {
  return (
    <div
      aria-label={label}
      className="maximal-control-cluster__group"
      role="group"
    >
      {children}
    </div>
  )
}
