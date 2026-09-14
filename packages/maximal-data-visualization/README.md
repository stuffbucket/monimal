# @stuffbucket/maximal-data-visualization

Renderer-only primitives shared by Maximal data visualizations. The package
owns chart viewports, legends, segmented chart controls, meters, hover
tooltips, and their structural styles. Feature packages continue to own data
derivation, labels, accessible table equivalents, and visualization-specific
geometry.

Import `@stuffbucket/maximal-data-visualization/styles.css` once through the
feature stylesheet. The host must provide the normal `--shell-*` typography and
surface contract plus `--data-viz-series-1` through
`--data-viz-series-8`. These categorical colors are separate from status
colors, and the host supplies coordinated values for each supported color
scheme.
