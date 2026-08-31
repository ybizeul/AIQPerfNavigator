import { describe, expect, test } from 'bun:test'
import {
  CHART_LEGEND_GAP,
  CHART_LEGEND_MAX_ROWS,
  CHART_LOADING_LEGEND_HEIGHT,
  EMPTY_LEGEND_LAYOUT,
  FALLBACK_LEGEND_LAYOUT,
  deriveLegendLayout,
  isLegendScrollable,
  legendBandHeight,
  legendRowsHeight,
  visibleLegendRows,
  type LegendLayout,
  type MeasuredLegendItem,
} from './chart-legend'

const ROW_HEIGHT = 28

function layout(rowCount: number): LegendLayout {
  return { rowCount, rowHeight: ROW_HEIGHT }
}

// Items laid out `perRow` to a row, in the order a flex-wrap legend would place them.
function measured(count: number, perRow: number): MeasuredLegendItem[] {
  return Array.from({ length: count }, (_, index) => ({
    offsetTop: Math.floor(index / perRow) * ROW_HEIGHT,
    offsetHeight: ROW_HEIGHT,
  }))
}

describe('deriveLegendLayout', () => {
  test('measures nothing for a legend without items', () => {
    expect(deriveLegendLayout([])).toEqual(EMPTY_LEGEND_LAYOUT)
  })

  test('counts items sharing a vertical offset as one row', () => {
    expect(deriveLegendLayout(measured(3, 3))).toEqual(layout(1))
  })

  test('counts each distinct vertical offset as a row', () => {
    expect(deriveLegendLayout(measured(5, 2))).toEqual(layout(3))
    expect(deriveLegendLayout(measured(10, 2))).toEqual(layout(5))
  })

  test('counts offsets a pixel apart as the same row', () => {
    const noisy = [
      { offsetTop: 0, offsetHeight: ROW_HEIGHT },
      { offsetTop: 0.4, offsetHeight: ROW_HEIGHT },
      { offsetTop: ROW_HEIGHT + 0.2, offsetHeight: ROW_HEIGHT },
    ]
    expect(deriveLegendLayout(noisy).rowCount).toBe(2)
  })

  test('takes the row height from the tallest rendered item', () => {
    const uneven = [
      { offsetTop: 0, offsetHeight: 20 },
      { offsetTop: 0, offsetHeight: 42 },
    ]
    expect(deriveLegendLayout(uneven).rowHeight).toBe(42)
  })

  test('reports a legend that has mounted without being laid out as height-less', () => {
    const unlaidOut = [
      { offsetTop: 0, offsetHeight: 0 },
      { offsetTop: 0, offsetHeight: 0 },
    ]
    expect(deriveLegendLayout(unlaidOut)).toEqual({ rowCount: 1, rowHeight: 0 })
  })

  test('counts every row of a long legend, leaving the cap to the band', () => {
    expect(deriveLegendLayout(measured(40, 1)).rowCount).toBe(40)
  })
})

describe('visibleLegendRows', () => {
  test('shows every row of a legend that fits', () => {
    expect(visibleLegendRows(layout(2))).toBe(2)
  })

  test('caps the band, leaving the rest to scroll', () => {
    expect(visibleLegendRows(layout(9))).toBe(CHART_LEGEND_MAX_ROWS)
  })
})

describe('isLegendScrollable', () => {
  test('is false for a legend with no rows', () => {
    expect(isLegendScrollable(EMPTY_LEGEND_LAYOUT)).toBe(false)
  })

  test('is false while every row fits in the band', () => {
    expect(isLegendScrollable(layout(CHART_LEGEND_MAX_ROWS))).toBe(false)
  })

  test('is true once a row falls outside the band', () => {
    expect(isLegendScrollable(layout(CHART_LEGEND_MAX_ROWS + 1))).toBe(true)
  })
})

describe('legendRowsHeight', () => {
  test('is nothing for a legend with no rows', () => {
    expect(legendRowsHeight(layout(0))).toBe(0)
  })

  test('is nothing before a row height has been measured', () => {
    expect(legendRowsHeight({ rowCount: 4, rowHeight: 0 })).toBe(0)
  })

  test('covers whole rows only', () => {
    expect(legendRowsHeight(layout(2))).toBe(2 * ROW_HEIGHT)
    expect(legendRowsHeight(layout(9))).toBe(CHART_LEGEND_MAX_ROWS * ROW_HEIGHT)
  })
})

describe('legendBandHeight', () => {
  test('reserves nothing when there is no legend to carry', () => {
    expect(legendBandHeight(layout(0))).toBe(0)
  })

  test('adds the gap to the plot on top of the rows', () => {
    expect(legendBandHeight(layout(2))).toBe(2 * ROW_HEIGHT + CHART_LEGEND_GAP)
    expect(legendBandHeight(layout(9))).toBe(CHART_LEGEND_MAX_ROWS * ROW_HEIGHT + CHART_LEGEND_GAP)
  })

  // Skeletons add this to their plot height, so a card that jumps when the chart arrives
  // means these two have drifted apart.
  test('is what a loading chart reserves', () => {
    expect(CHART_LOADING_LEGEND_HEIGHT).toBe(legendBandHeight(FALLBACK_LEGEND_LAYOUT))
  })
})
