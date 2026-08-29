type BuildChangeType = 'feat' | 'fix'

type BuildChange = {
  type: BuildChangeType
  description: string
}

type BuildRelease = {
  version: string
  changes: BuildChange[]
}

type BuildInfo = {
  version: string
  isTagged: boolean
  releases: BuildRelease[]
}

declare const __AIQ_BUILD_INFO__: BuildInfo
