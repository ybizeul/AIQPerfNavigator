import { describe, expect, test } from 'bun:test'
import { capacityHistoryToCsv, chartDataToCsv, csvDownloadBlob } from './chart-csv'

const SIX_AM = Date.parse('2026-07-12T06:00:00.000Z')
const SEVEN_AM = Date.parse('2026-07-12T07:00:00.000Z')

describe('chartDataToCsv', () => {
  test('writes the timestamp column, then series in the given order', () => {
    const csv = chartDataToCsv(
      [
        { __epochMs: SEVEN_AM, Headroom: 1, 'CPU Utilization': 2 },
        { __epochMs: SIX_AM, Headroom: 3, 'CPU Utilization': 4 },
      ],
      ['CPU Utilization', 'Headroom'],
    )

    expect(csv).toBe(
      [
        'timestamp,CPU Utilization,Headroom',
        '2026-07-12T07:00:00.000Z,2,1',
        '2026-07-12T06:00:00.000Z,4,3',
      ].join('\n'),
    )
  })

  test('leaves an empty cell where a series has no value', () => {
    const csv = chartDataToCsv(
      [
        {
          __epochMs: SIX_AM,
          'cluster1-01 – CPU Utilization': 42.1,
          'cluster1-01 – Headroom': 57.9,
        },
        {
          __epochMs: SEVEN_AM,
          'cluster1-01 – CPU Utilization': 40.2,
        },
        {
          __epochMs: SEVEN_AM + 3_600_000,
          'cluster1-01 – Headroom': 50,
        },
      ],
      ['cluster1-01 – CPU Utilization', 'cluster1-01 – Headroom'],
    )

    expect(csv).toBe(
      [
        'timestamp,cluster1-01 – CPU Utilization,cluster1-01 – Headroom',
        '2026-07-12T06:00:00.000Z,42.1,57.9',
        '2026-07-12T07:00:00.000Z,40.2,',
        '2026-07-12T08:00:00.000Z,,50',
      ].join('\n'),
    )
  })

  test('quotes fields that contain a comma, quote, or newline', () => {
    const csv = chartDataToCsv(
      [
        {
          __epochMs: SIX_AM,
          'host,1 – "CPU"': 'line1\nline2',
          plain: 1,
        },
      ],
      ['host,1 – "CPU"', 'plain'],
    )

    expect(csv).toBe(
      [
        'timestamp,"host,1 – ""CPU""",plain',
        '2026-07-12T06:00:00.000Z,"line1\nline2",1',
      ].join('\n'),
    )
  })

  test('writes ISO 8601 from __epochMs and ignores the chart label', () => {
    const csv = chartDataToCsv(
      [
        {
          timestamp: 'Jul 12, 02:00 AM',
          __epochMs: SIX_AM,
          'CPU Utilization': 42.1,
        },
      ],
      ['CPU Utilization'],
    )

    expect(csv).toBe(
      ['timestamp,CPU Utilization', '2026-07-12T06:00:00.000Z,42.1'].join('\n'),
    )
  })

  test('omits hidden keys, including __epochMs when it is listed as a series', () => {
    const csv = chartDataToCsv(
      [
        {
          timestamp: 'Jul 12, 02:00 AM',
          __epochMs: SIX_AM,
          'CPU Utilization': 42.1,
          Headroom: 57.9,
        },
      ],
      ['__epochMs', 'timestamp', 'CPU Utilization'],
    )

    expect(csv).toBe(
      ['timestamp,CPU Utilization', '2026-07-12T06:00:00.000Z,42.1'].join('\n'),
    )
  })

  test('keeps a numeric zero', () => {
    const csv = chartDataToCsv([{ __epochMs: SIX_AM, 'CPU Utilization': 0 }], ['CPU Utilization'])

    expect(csv).toBe(
      ['timestamp,CPU Utilization', '2026-07-12T06:00:00.000Z,0'].join('\n'),
    )
  })
})

describe('capacityHistoryToCsv', () => {
  test('writes one row per month with used and usable in TiB', () => {
    const csv = capacityHistoryToCsv([
      { month: '2025-12', Used: 10.5, Usable: 20 },
      { month: '2026-01', Used: 0, Usable: 21.25 },
    ])

    expect(csv).toBe(
      ['month,Used (TiB),Usable (TiB)', '2025-12,10.5,20', '2026-01,0,21.25'].join('\n'),
    )
  })
})

describe('csvDownloadBlob', () => {
  test('starts with a UTF-8 BOM so Excel keeps the en-dash in series names', async () => {
    const csv = chartDataToCsv(
      [{ __epochMs: SIX_AM, 'CMONYCSOMNAS121D – CPU Utilization': 42.1 }],
      ['CMONYCSOMNAS121D – CPU Utilization'],
    )
    const bytes = new Uint8Array(await csvDownloadBlob(csv).arrayBuffer())

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      [
        'timestamp,CMONYCSOMNAS121D – CPU Utilization',
        '2026-07-12T06:00:00.000Z,42.1',
      ].join('\n'),
    )
  })
})
