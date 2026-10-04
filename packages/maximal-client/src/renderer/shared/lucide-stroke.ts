import type { LucideProps } from 'lucide-react'

/* Glyphs at or above this size draw a 2px stroke; smaller glyphs draw 1px. */
export const HEAVY_STROKE_SIZE = 48

/* Lucide props that keep the stroke a fixed pixel width at any glyph size. */
export function lucideStroke(size: number): Pick<LucideProps, 'size' | 'strokeWidth' | 'absoluteStrokeWidth'> {
  return { size, strokeWidth: size >= HEAVY_STROKE_SIZE ? 2 : 1, absoluteStrokeWidth: true }
}
