// CSV for one performance graph. The chart draws a downsampled series with a
// year-less label; the file keeps every stored hour and writes ISO 8601 from
// `__epochMs`. Columns are the series the chart is showing, in that order.

const HIDDEN_POINT_KEYS = new Set(['timestamp', '__epochMs'])

type ChartCsvPoint = {
  __epochMs: number
  [series: string]: string | number
}

export function chartDataToCsv(
  points: readonly ChartCsvPoint[],
  seriesKeys: readonly string[],
): string {
  const columns = seriesKeys.filter((key) => !HIDDEN_POINT_KEYS.has(key))
  const header = ['timestamp', ...columns].map(escapeCsvField).join(',')
  const rows = points.map((point) => {
    const cells = [
      new Date(point.__epochMs).toISOString(),
      ...columns.map((key) => formatCsvValue(point[key])),
    ]
    return cells.map(escapeCsvField).join(',')
  })
  return [header, ...rows].join('\n')
}

// Excel opens a CSV as the system encoding unless the file starts with a UTF-8 BOM.
// On macOS that encoding is Mac Roman, which turns the en-dash in a series name
// ("hostname – CPU Utilization") into "‚Äì".
const UTF8_BOM = '\uFEFF'

export function downloadTextFile(filename: string, contents: string): void {
  const downloadUrl = URL.createObjectURL(csvDownloadBlob(contents))
  const downloadLink = document.createElement('a')
  downloadLink.href = downloadUrl
  downloadLink.download = filename
  downloadLink.click()
  URL.revokeObjectURL(downloadUrl)
}

export function csvDownloadBlob(contents: string): Blob {
  return new Blob([UTF8_BOM, contents], { type: 'text/csv;charset=utf-8' })
}

// The capacity chart plots the last 12 months in TiB. The file is that same
// series: one row per month, with the unit in the header.
type CapacityHistoryRow = {
  month: string
  Used: number
  Usable: number
}

export function capacityHistoryToCsv(rows: readonly CapacityHistoryRow[]): string {
  const header = ['month', 'Used (TiB)', 'Usable (TiB)'].map(escapeCsvField).join(',')
  const body = rows.map((row) =>
    [row.month, formatCsvValue(row.Used), formatCsvValue(row.Usable)]
      .map(escapeCsvField)
      .join(','),
  )
  return [header, ...body].join('\n')
}

function formatCsvValue(value: string | number | undefined): string {
  if (typeof value !== 'number' && typeof value !== 'string') return ''
  return String(value)
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}
