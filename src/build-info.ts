export type BuildChangeType = 'feat' | 'fix'

export type BuildChange = {
  type: BuildChangeType
  description: string
}

export type BuildRelease = {
  version: string
  changes: BuildChange[]
}

export type BuildInfo = {
  version: string
  isTagged: boolean
  releases: BuildRelease[]
}

export function isBuildInfo(value: unknown): value is BuildInfo {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<BuildInfo>
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.isTagged === 'boolean' &&
    Array.isArray(candidate.releases)
  )
}
