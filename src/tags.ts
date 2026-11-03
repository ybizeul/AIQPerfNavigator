const AUTOMATIC_TAG_PREFIX = '_'
export const METROCLUSTER_TAG = '_metrocluster'
const RESERVED_TAG_LABELS = ['aff', 'fas', 'cvo', 'metrocluster'] as const
const RESERVED_TAG_LABEL_SET = new Set<string>(RESERVED_TAG_LABELS)
const AUTOMATIC_MODEL_TAGS = [
  { modelPrefix: 'aff', tag: '_aff' },
  { modelPrefix: 'fas', tag: '_fas' },
  { modelPrefix: 'cdvm', tag: '_cvo' },
] as const

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

export function uniqueNormalizedTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const tag of tags) {
    const normalized = normalizeTag(tag)
    if (normalized.length === 0 || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

export function deserializeTagFilter(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try {
      return deserializeTagFilter(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return uniqueNormalizedTags(raw.filter((entry): entry is string => typeof entry === 'string'))
}

export function isAutomaticTag(tag: string) {
  return tag.startsWith(AUTOMATIC_TAG_PREFIX)
}

export function getTagLabel(tag: string) {
  return isAutomaticTag(tag) ? tag.slice(AUTOMATIC_TAG_PREFIX.length) : tag
}

function getReservedTagKey(tag: string) {
  let result = tag.trim()
  while (result.startsWith(AUTOMATIC_TAG_PREFIX)) {
    result = result.slice(AUTOMATIC_TAG_PREFIX.length)
  }
  return result.toLowerCase()
}

export function isReservedCustomTag(tag: string) {
  const trimmed = tag.trim()
  if (trimmed.length === 0) {
    return false
  }
  return (
    trimmed.startsWith(AUTOMATIC_TAG_PREFIX) ||
    RESERVED_TAG_LABEL_SET.has(getReservedTagKey(trimmed))
  )
}

export function getReservedTagHint(tag: string) {
  const trimmed = tag.trim()
  if (trimmed.startsWith(AUTOMATIC_TAG_PREFIX)) {
    return 'Names starting with "_" are reserved for automatic tags. Try a name without an underscore.'
  }
  return `"${getReservedTagKey(trimmed)}" is reserved for automatic tags. Try a different name.`
}

export function compareTags(left: string, right: string) {
  const labelComparison = getTagLabel(left).localeCompare(getTagLabel(right), undefined, {
    sensitivity: 'base',
  })
  if (labelComparison !== 0) {
    return labelComparison
  }
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

export function getAutomaticTagsForModel(modelName: string | null | undefined): string[] {
  const normalizedModelName = modelName?.trim().toLowerCase() ?? ''
  const matchingTag = AUTOMATIC_MODEL_TAGS.find(({ modelPrefix }) =>
    normalizedModelName.startsWith(modelPrefix),
  )
  return matchingTag ? [matchingTag.tag] : []
}

export function normalizeTags(tags: string[], automaticTags: string[] = []) {
  return Array.from(
    new Set([
      ...tags.map(normalizeTag).filter((tag) => tag.length > 0 && !isReservedCustomTag(tag)),
      ...automaticTags.map(normalizeTag).filter((tag) => tag.length > 0),
    ]),
  ).sort(compareTags)
}
