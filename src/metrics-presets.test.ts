import { describe, expect, test } from 'bun:test'
import {
  deleteMetricsPreset,
  deserializeMetricsPresets,
  findMatchingPreset,
  findPresetByName,
  normalizePresetName,
  parseMetricsPresets,
  prunePresetToExisting,
  sortedMetricsPresets,
  upsertMetricsPreset,
  withPrunedSelection,
  type MetricsSelectionPreset,
} from './metrics-presets'

function preset(
  overrides: Partial<MetricsSelectionPreset> & Pick<MetricsSelectionPreset, 'id' | 'name'>,
): MetricsSelectionPreset {
  return {
    selectedPairKeys: ['a::b'],
    metricsTagFilter: [],
    ...overrides,
  }
}

describe('normalizePresetName', () => {
  test('trims and collapses inner whitespace', () => {
    expect(normalizePresetName('  Prod   west  ')).toBe('Prod west')
  })
})

describe('upsertMetricsPreset', () => {
  test('returns null for a blank name or empty selection', () => {
    expect(
      upsertMetricsPreset([], {
        name: '  ',
        selectedPairKeys: ['a::b'],
        metricsTagFilter: [],
      }),
    ).toBeNull()
    expect(
      upsertMetricsPreset([], {
        name: 'Prod',
        selectedPairKeys: [],
        metricsTagFilter: [],
      }),
    ).toBeNull()
  })

  test('adds a named selection and replaces the same name without changing its casing', () => {
    const created = upsertMetricsPreset(
      [],
      {
        name: '  Prod  ',
        selectedPairKeys: ['b::a', 'b::a'],
        metricsTagFilter: ['Gold', ' gold ', 'GOLD'],
      },
      () => 'id-1',
    )
    expect(created?.preset).toEqual({
      id: 'id-1',
      name: 'Prod',
      selectedPairKeys: ['b::a'],
      metricsTagFilter: ['gold'],
    })

    const replaced = upsertMetricsPreset(
      created?.presets ?? [],
      {
        name: 'prod',
        selectedPairKeys: ['c::d'],
        metricsTagFilter: [],
      },
      () => 'id-2',
    )
    expect(replaced?.preset.id).toBe('id-1')
    expect(replaced?.presets).toHaveLength(1)
    expect(replaced?.preset.selectedPairKeys).toEqual(['c::d'])
    expect(replaced?.preset.name).toBe('Prod')
  })

  test('keeps the first preset when two names collide', () => {
    const presets = [
      preset({ id: 'first', name: 'Prod' }),
      preset({ id: 'second', name: 'prod' }),
    ]
    const replaced = upsertMetricsPreset(
      presets,
      { name: 'PROD', selectedPairKeys: ['x::y'], metricsTagFilter: [] },
      () => 'id-3',
    )
    expect(replaced?.preset.id).toBe('first')
    expect(replaced?.presets[1]?.id).toBe('second')
  })
})

describe('findMatchingPreset', () => {
  test('matches selection and tag filter as sets', () => {
    const presets = [
      preset({
        id: 'one',
        name: 'One',
        selectedPairKeys: ['a::b', 'c::d'],
        metricsTagFilter: ['gold'],
      }),
    ]
    expect(
      findMatchingPreset(presets, ['c::d', 'a::b'], ['gold'])?.id,
    ).toBe('one')
    expect(findMatchingPreset(presets, ['a::b', 'c::d'], ['GOLD'])?.id).toBe('one')
    expect(findMatchingPreset(presets, ['a::b', 'c::d'], [])).toBeUndefined()
  })

  test('does not treat an empty selection as a match', () => {
    expect(
      findMatchingPreset(
        [preset({ id: 'one', name: 'One', selectedPairKeys: [] })],
        [],
        [],
      ),
    ).toBeUndefined()
  })
})

describe('findPresetByName', () => {
  test('matches a trimmed name without regard to case', () => {
    const presets = [preset({ id: 'one', name: 'Prod west' })]
    expect(findPresetByName(presets, '  prod WEST ')?.id).toBe('one')
  })

  test('ignores a blank name', () => {
    expect(findPresetByName([preset({ id: 'one', name: 'Prod' })], '   ')).toBeUndefined()
  })
})

describe('prunePresetToExisting', () => {
  test('treats tag case variants as the same tag', () => {
    const pruned = prunePresetToExisting(
      preset({
        id: 'one',
        name: 'One',
        selectedPairKeys: ['keep'],
        metricsTagFilter: ['Gold', ' gold '],
      }),
      new Set(['keep']),
      new Set(['GOLD']),
      new Map([['keep', ['gold']]]),
    )
    expect(pruned).toEqual({
      selectedPairKeys: ['keep'],
      metricsTagFilter: ['gold'],
    })
  })

  test('drops pair keys and tags that no longer exist', () => {
    const pruned = prunePresetToExisting(
      preset({
        id: 'one',
        name: 'One',
        selectedPairKeys: ['keep', 'gone'],
        metricsTagFilter: ['gold', 'old'],
      }),
      new Set(['keep']),
      new Set(['gold']),
      new Map([['keep', ['gold']]]),
    )
    expect(pruned).toEqual({
      selectedPairKeys: ['keep'],
      metricsTagFilter: ['gold'],
    })
  })

  test('drops keys that no longer match the restored tag filter', () => {
    const pruned = prunePresetToExisting(
      preset({
        id: 'one',
        name: 'One',
        selectedPairKeys: ['keep', 'untagged'],
        metricsTagFilter: ['gold'],
      }),
      new Set(['keep', 'untagged']),
      new Set(['gold']),
      new Map([
        ['keep', ['gold']],
        ['untagged', ['silver']],
      ]),
    )
    expect(pruned.selectedPairKeys).toEqual(['keep'])
  })

  test('clears a tag filter whose tags are all gone, keeping remaining pairs', () => {
    const pruned = prunePresetToExisting(
      preset({
        id: 'one',
        name: 'One',
        selectedPairKeys: ['keep'],
        metricsTagFilter: ['old'],
      }),
      new Set(['keep']),
      new Set(['gold']),
      new Map([['keep', ['gold']]]),
    )
    expect(pruned).toEqual({
      selectedPairKeys: ['keep'],
      metricsTagFilter: [],
    })
  })

  test('can prune a selection down to nothing', () => {
    const pruned = prunePresetToExisting(
      preset({
        id: 'one',
        name: 'One',
        selectedPairKeys: ['gone'],
        metricsTagFilter: [],
      }),
      new Set(['keep']),
      new Set(),
      new Map(),
    )
    expect(pruned.selectedPairKeys).toEqual([])
  })
})

describe('withPrunedSelection', () => {
  test('lets a restored selection match after stale keys are dropped', () => {
    const stored = preset({
      id: 'one',
      name: 'One',
      selectedPairKeys: ['keep', 'gone'],
      metricsTagFilter: [],
    })
    const pruned = withPrunedSelection(
      stored,
      new Set(['keep']),
      new Set(),
      new Map([['keep', []]]),
    )
    expect(findMatchingPreset([stored], ['keep'], [])).toBeUndefined()
    expect(findMatchingPreset([pruned], ['keep'], [])?.id).toBe('one')
  })
})

describe('parseMetricsPresets', () => {
  test('copies only known string fields and drops junk', () => {
    expect(
      parseMetricsPresets([
        {
          id: 'one',
          name: ' Prod ',
          selectedPairKeys: ['a::b', 'a::b', 12],
          metricsTagFilter: ['Gold', ' gold ', 'silver'],
          extra: { __proto__: { polluted: true } },
        },
        { id: 2, name: 'nope', selectedPairKeys: ['a::b'] },
        { id: 'empty', name: 'Empty', selectedPairKeys: [] },
        null,
        'string',
      ]),
    ).toEqual([
      {
        id: 'one',
        name: 'Prod',
        selectedPairKeys: ['a::b'],
        metricsTagFilter: ['gold', 'silver'],
      },
    ])
  })

  test('returns nothing for a non-array or broken JSON', () => {
    expect(parseMetricsPresets({ id: 'one' })).toEqual([])
    expect(deserializeMetricsPresets('{')).toEqual([])
    expect(deserializeMetricsPresets('"not-an-array"')).toEqual([])
    expect(deserializeMetricsPresets([{ id: 'one', name: 'Prod', selectedPairKeys: ['a::b'] }])).toEqual([
      { id: 'one', name: 'Prod', selectedPairKeys: ['a::b'], metricsTagFilter: [] },
    ])
  })
})

describe('deleteMetricsPreset and sortedMetricsPresets', () => {
  test('removes by id and sorts remaining names', () => {
    const presets = [
      preset({ id: 'b', name: 'Beta' }),
      preset({ id: 'a', name: 'Alpha' }),
    ]
    expect(sortedMetricsPresets(presets).map((entry) => entry.name)).toEqual([
      'Alpha',
      'Beta',
    ])
    expect(deleteMetricsPreset(presets, 'a').map((entry) => entry.id)).toEqual(['b'])
  })
})
