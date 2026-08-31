import { type CSSProperties, type UIEvent, useEffect, useState } from 'react'
import { AreaChart, type AreaChartProps } from '@mantine/charts'
import {
  CHART_LEGEND_GAP,
  FALLBACK_LEGEND_LAYOUT,
  deriveLegendLayout,
  isLegendScrollable,
  legendBandHeight,
  legendRowsHeight,
  type LegendLayout,
} from './chart-legend'

/* Set through Mantine's public legend slots, and read back from the rendered legend by the
   measurement below. Both ends of that live here so a Mantine upgrade that renames a slot
   breaks in one file. */
const LEGEND_CLASS = 'chart-legend'
const LEGEND_SCROLLABLE_CLASS = 'chart-legend-scrollable'
const LEGEND_AT_END_CLASS = 'chart-legend-at-end'
const LEGEND_ITEM_CLASS = 'chart-legend-item'
const LEGEND_ITEM_NAME_CLASS = 'chart-legend-item-name'

type MeasuredLegend = {
  // The series the measurement belongs to, so a chart never carries a band sized for the
  // legend it had before.
  seriesKey: string
  layout: LegendLayout
}

/* How the legend actually wrapped, read back from the rendered rows. Estimating it from
   label lengths cannot be trusted to the pixel, and being one row short would clip the
   legend the same way the legend used to clip the plot. */
function useLegendLayout(host: HTMLDivElement | null, seriesKey: string) {
  const [measured, setMeasured] = useState<MeasuredLegend | null>(null)

  useEffect(() => {
    if (!host) return

    let frame = 0
    let observedLegend: Element | null = null
    /* Watching boxes this measurement resizes, so the equality check below is what stops
       the observer from feeding itself. The legend is watched on top of the host because a
       scrollbar appearing narrows the rows without changing the host at all. */
    const observer = new ResizeObserver(() => schedule())
    observer.observe(host)

    const measure = () => {
      frame = 0

      const legend = host.querySelector(`.${LEGEND_CLASS}`)
      if (legend && legend !== observedLegend) {
        observedLegend = legend
        observer.observe(legend)
      }

      const items = Array.from(host.querySelectorAll<HTMLElement>(`.${LEGEND_ITEM_CLASS}`))
      const next = deriveLegendLayout(items)
      /* A legend that has mounted but not been laid out reports no height. Reserving a band
         from that would hand the plot back to recharts to shrink. */
      if (next.rowHeight <= 0) return

      setMeasured((current) =>
        current &&
        current.seriesKey === seriesKey &&
        current.layout.rowCount === next.rowCount &&
        current.layout.rowHeight === next.rowHeight
          ? current
          : { seriesKey, layout: next },
      )
    }

    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }

    schedule()

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [host, seriesKey])

  return measured?.seriesKey === seriesKey ? measured.layout : null
}

/* The fade marking rows below the band is the only cue on platforms whose scrollbars stay
   invisible until they move, so it has to go once there is nothing left to scroll to. Held
   as a class rather than state: this fires per scroll event and owes the chart no render. */
function handleLegendScroll(event: UIEvent<HTMLDivElement>) {
  const legend = event.currentTarget
  const isAtEnd = legend.scrollTop + legend.clientHeight >= legend.scrollHeight - 1
  legend.classList.toggle(LEGEND_AT_END_CLASS, isAtEnd)
}

/* A chart tall enough for its legend plus its plot. Recharts takes the legend's measured
   height out of the plot area, so a legend with one entry per node and metric would shrink
   the plot of a fixed-height chart to nothing. Reserving a band for the legend keeps the
   plot at `plotHeight`, and a legend with more rows than the band scrolls within it. */
export function AreaChartWithLegend({
  plotHeight,
  series,
  classNames,
  ...chartProps
}: { plotHeight: number } & Omit<
  AreaChartProps,
  'h' | 'height' | 'withLegend' | 'legendProps' | 'attributes'
>) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const seriesKey = JSON.stringify(series.map((item) => item.label ?? item.name))
  const layout = useLegendLayout(host, seriesKey) ?? FALLBACK_LEGEND_LAYOUT
  const isScrollable = isLegendScrollable(layout)
  const rowsHeight = legendRowsHeight(layout)

  return (
    <div
      ref={setHost}
      style={{ '--chart-legend-rows-height': `${rowsHeight}px` } as CSSProperties}
    >
      <AreaChart
        {...chartProps}
        series={series}
        h={plotHeight + legendBandHeight(layout)}
        withLegend
        legendProps={{
          verticalAlign: 'top',
          height: rowsHeight + CHART_LEGEND_GAP,
          wrapperStyle: { overflow: 'hidden' },
        }}
        /* Nothing inside Mantine's legend takes focus, so the rows out of view would be out
           of reach for anyone on a keyboard unless the scrolling box itself can be focused. */
        attributes={
          isScrollable
            ? {
                legend: {
                  tabIndex: 0,
                  role: 'region',
                  'aria-label': 'Chart series',
                  onScroll: handleLegendScroll,
                },
              }
            : undefined
        }
        classNames={(theme, resolverProps, ctx) => {
          const caller =
            typeof classNames === 'function' ? classNames(theme, resolverProps, ctx) : classNames
          return {
            ...caller,
            legend: [LEGEND_CLASS, isScrollable && LEGEND_SCROLLABLE_CLASS, caller?.legend]
              .filter(Boolean)
              .join(' '),
            legendItem: [LEGEND_ITEM_CLASS, caller?.legendItem].filter(Boolean).join(' '),
            legendItemName: [LEGEND_ITEM_NAME_CLASS, caller?.legendItemName]
              .filter(Boolean)
              .join(' '),
          }
        }}
      />
    </div>
  )
}
