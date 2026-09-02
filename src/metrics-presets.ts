export type MetricsSelectionPreset = {
  id: string
  name: string
  selectedPairKeys: string[]
  metricsTagFilter: string[]
}

export function normalizePresetName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size !== rightSet.size) return false
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false
  }
  return true
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const next: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || seen.has(entry)) continue
    seen.add(entry)
    next.push(entry)
  }
  return next
}

export function parseMetricsPresets(value: unknown): MetricsSelectionPreset[] {
  if (!Array.isArray(value)) return []
  const presets: MetricsSelectionPreset[] = []
  const seenIds = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue
    const name = normalizePresetName(record.name)
    if (!record.id || !name || seenIds.has(record.id)) continue
    const selectedPairKeys = parseStringArray(record.selectedPairKeys)
    if (selectedPairKeys.length === 0) continue
    seenIds.add(record.id)
    presets.push({
      id: record.id,
      name,
      selectedPairKeys,
      metricsTagFilter: parseStringArray(record.metricsTagFilter),
    })
  }
  return presets
}

export function deserializeMetricsPresets(raw: unknown): MetricsSelectionPreset[] {
  if (typeof raw !== 'string') return parseMetricsPresets(raw)
  try {
    return parseMetricsPresets(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function sortedMetricsPresets(
  presets: readonly MetricsSelectionPreset[],
): MetricsSelectionPreset[] {
  return [...presets].sort((left, right) => left.name.localeCompare(right.name))
}

export function findMatchingPreset(
  presets: readonly MetricsSelectionPreset[],
  selectedPairKeys: readonly string[],
  metricsTagFilter: readonly string[],
): MetricsSelectionPreset | undefined {
  if (selectedPairKeys.length === 0) return undefined
  return presets.find(
    (preset) =>
      sameStringSet(preset.selectedPairKeys, selectedPairKeys) &&
      sameStringSet(preset.metricsTagFilter, metricsTagFilter),
  )
}

export function findPresetByName(
  presets: readonly MetricsSelectionPreset[],
  name: string,
): MetricsSelectionPreset | undefined {
  const normalized = normalizePresetName(name).toLowerCase()
  if (!normalized) return undefined
  return presets.find((preset) => preset.name.toLowerCase() === normalized)
}

export function prunePresetToExisting(
  preset: MetricsSelectionPreset,
  existingPairKeys: ReadonlySet<string>,
  existingTags: ReadonlySet<string>,
  pairTagsByKey: ReadonlyMap<string, readonly string[]>,
): Pick<MetricsSelectionPreset, 'selectedPairKeys' | 'metricsTagFilter'> {
  const metricsTagFilter = preset.metricsTagFilter.filter((tag) => existingTags.has(tag))
  return {
    metricsTagFilter,
    selectedPairKeys: preset.selectedPairKeys.filter((key) => {
      if (!existingPairKeys.has(key)) return false
      if (metricsTagFilter.length === 0) return true
      const tags = pairTagsByKey.get(key)
      return !!tags && metricsTagFilter.every((tag) => tags.includes(tag))
    }),
  }
}

export function withPrunedSelection(
  preset: MetricsSelectionPreset,
  existingPairKeys: ReadonlySet<string>,
  existingTags: ReadonlySet<string>,
  pairTagsByKey: ReadonlyMap<string, readonly string[]>,
): MetricsSelectionPreset {
  return {
    ...preset,
    ...prunePresetToExisting(preset, existingPairKeys, existingTags, pairTagsByKey),
  }
}

export function upsertMetricsPreset(
  presets: readonly MetricsSelectionPreset[],
  input: {
    name: string
    selectedPairKeys: readonly string[]
    metricsTagFilter: readonly string[]
  },
  createId: () => string = () => crypto.randomUUID(),
): { presets: MetricsSelectionPreset[]; preset: MetricsSelectionPreset } | null {
  const name = normalizePresetName(input.name)
  const selectedPairKeys = [...new Set(input.selectedPairKeys)]
  if (!name || selectedPairKeys.length === 0) return null

  const existing = findPresetByName(presets, name)
  const preset: MetricsSelectionPreset = {
    id: existing?.id ?? createId(),
    name: existing?.name ?? name,
    selectedPairKeys,
    metricsTagFilter: [...new Set(input.metricsTagFilter)],
  }

  const existingIndex = presets.findIndex((entry) => entry.id === preset.id)
  if (existingIndex === -1) {
    return { presets: [...presets, preset], preset }
  }

  const next = [...presets]
  next[existingIndex] = preset
  return { presets: next, preset }
}

export function deleteMetricsPreset(
  presets: readonly MetricsSelectionPreset[],
  id: string,
): MetricsSelectionPreset[] {
  return presets.filter((preset) => preset.id !== id)
}
