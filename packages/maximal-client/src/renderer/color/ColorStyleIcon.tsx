import { useId, type ReactElement } from 'react'

/* The half-filled drop that marks a colour style. */
export function ColorStyleIcon({ color }: { color: string }): ReactElement {
  const clip = useId()
  const drop = 'M8 1.75C8 1.75 3.25 6.9 3.25 10.1a4.75 4.75 0 0 0 9.5 0C12.75 6.9 8 1.75 8 1.75Z'
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      <clipPath id={clip}><rect x={0} y={0} width={8} height={16} /></clipPath>
      <path d={drop} fill={color} clipPath={`url(#${clip})`} />
      <path d={drop} fill="none" stroke={color} strokeWidth={1.25} />
    </svg>
  )
}
