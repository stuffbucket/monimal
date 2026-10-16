export type DataAttributes = {
  [Name in `data-${string}`]?: string | number | boolean | null | undefined
}
