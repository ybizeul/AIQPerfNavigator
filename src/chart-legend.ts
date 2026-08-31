// Recharts takes the legend's measured height out of the plot area, so one legend entry
// per node and metric can shrink a fixed-height chart's plot to nothing. Charts instead
// reserve a legend band computed here and grow by that much, keeping the plot intact.

// Rows the band shows at once. Beyond this the band scrolls instead of growing, so charts
// with many series stay the same height as the ones beside them.
export const CHART_LEGEND_MAX_ROWS = 3
// Breathing room between the legend and the plot. Kept out of the rows themselves so a row
// scrolled half out of the band cannot bleed into it.
export const CHART_LEGEND_GAP = 16
// Reserved until the rendered legend has been measured: the tallest band a legend can ask
// for, so the plot is never squeezed on the way to the real measurement.
export const CHART_LEGEND_FALLBACK_ROW_HEIGHT = 30

// How a rendered legend wrapped. Rows are uniform because legend names are kept on a
// single line, which is what lets the band cut cleanly between rows.
export type LegendLayout = {
  rowCount: number
  rowHeight: number
}

export const EMPTY_LEGEND_LAYOUT: LegendLayout = { rowCount: 0, rowHeight: 0 }

export const FALLBACK_LEGEND_LAYOUT: LegendLayout = {
  rowCount: CHART_LEGEND_MAX_ROWS,
  rowHeight: CHART_LEGEND_FALLBACK_ROW_HEIGHT,
}

export type MeasuredLegendItem = {
  offsetTop: number
  offsetHeight: number
}

// Items on the same row share a vertical offset, so the distinct offsets are the rows.
// Offsets are rounded because a subpixel difference within a row is not a row, and the
// tallest item sets the row height: a band built from a shorter one would clip.
export function deriveLegendLayout(items: readonly MeasuredLegendItem[]): LegendLayout {
  if (items.length === 0) return EMPTY_LEGEND_LAYOUT

  return {
    rowCount: new Set(items.map((item) => Math.round(item.offsetTop))).size,
    rowHeight: Math.max(...items.map((item) => item.offsetHeight)),
  }
}

export function visibleLegendRows(layout: LegendLayout): number {
  return Math.min(layout.rowCount, CHART_LEGEND_MAX_ROWS)
}

export function isLegendScrollable(layout: LegendLayout): boolean {
  return layout.rowCount > CHART_LEGEND_MAX_ROWS
}

// Height of the legend rows alone. Whole rows only: a band ending mid-row would show a
// sliver of the next one and read as a rendering fault rather than as more to scroll.
export function legendRowsHeight(layout: LegendLayout): number {
  if (layout.rowCount <= 0 || layout.rowHeight <= 0) return 0
  return visibleLegendRows(layout) * layout.rowHeight
}

// Height a chart must add to its plot to carry the legend.
export function legendBandHeight(layout: LegendLayout): number {
  const rowsHeight = legendRowsHeight(layout)
  if (rowsHeight === 0) return 0
  return rowsHeight + CHART_LEGEND_GAP
}

// What a chart adds to its plot before its legend has been measured. Loading skeletons use
// it so a card keeps its size when the chart arrives.
export const CHART_LOADING_LEGEND_HEIGHT = legendBandHeight(FALLBACK_LEGEND_LAYOUT)
