import { describe, expect, test } from 'bun:test'
import {
  deserializeTagFilter,
  normalizeTags,
  uniqueNormalizedTags,
} from './tags'

describe('normalizeTags', () => {
  test('collapses case variants into one lowercase tag', () => {
    expect(normalizeTags(['Prod', ' prod ', 'PROD'])).toEqual(['prod'])
  })

  test('keeps distinct tags and sorts them', () => {
    expect(normalizeTags(['west', 'East'])).toEqual(['east', 'west'])
  })

  test('drops reserved custom tags and keeps automatic tags', () => {
    expect(normalizeTags(['AFF', '_aff', 'Prod'], ['_aff', '_metrocluster'])).toEqual([
      '_aff',
      '_metrocluster',
      'prod',
    ])
  })

  test('drops a reserved label even when its casing differs from the automatic tag', () => {
    expect(normalizeTags(['MetroCluster'], ['_metrocluster'])).toEqual(['_metrocluster'])
  })

  test('drops blank tags', () => {
    expect(normalizeTags(['  ', ''])).toEqual([])
  })
})

describe('uniqueNormalizedTags', () => {
  test('lowercases, trims, and keeps the first occurrence order', () => {
    expect(uniqueNormalizedTags([' Gold ', 'gold', 'silver', 'SILVER', '  '])).toEqual([
      'gold',
      'silver',
    ])
  })
})

describe('deserializeTagFilter', () => {
  test('reads a stored filter as lowercase tags', () => {
    expect(deserializeTagFilter('["Gold"," gold ","silver"]')).toEqual(['gold', 'silver'])
  })

  test('returns nothing for a broken or non-array value', () => {
    expect(deserializeTagFilter('{')).toEqual([])
    expect(deserializeTagFilter('{"tag":"gold"}')).toEqual([])
    expect(deserializeTagFilter(null)).toEqual([])
  })
})
