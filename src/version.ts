import { type BuildInfo, isBuildInfo } from './build-info'

const SEEN_VERSION_STORAGE_KEY = 'aiq-system-organizer-seen-version'
// Imported backup files can write this key, so refuse absurd values before parsing.
const MAX_SEEN_VERSION_LENGTH = 64

const UNINJECTED_BUILD_INFO: BuildInfo = {
  version: '',
  isTagged: false,
  releases: [],
}

// scripts/build.ts and scripts/dev.ts put the git-derived build info here, and Bun
// inlines it into the client bundle. It is absent when the bundler is bypassed.
function injectedPayload() {
  try {
    // Bun rewrites this exact member access to a string literal, so the browser
    // never touches `process`. Reaching it unrewritten throws a ReferenceError.
    return process.env.AIQ_PUBLIC_BUILD_INFO
  } catch (error) {
    if (error instanceof ReferenceError) {
      return undefined
    }

    throw error
  }
}

export function parseBuildInfo(payload: string | undefined): BuildInfo {
  if (!payload) {
    return UNINJECTED_BUILD_INFO
  }

  const parsed = JSON.parse(payload) as unknown
  if (!isBuildInfo(parsed)) {
    throw new Error('Injected build info does not match the expected shape.')
  }

  return parsed
}

export const BUILD_INFO = parseBuildInfo(injectedPayload())

if (!BUILD_INFO.version) {
  // Usually means the server was started as `bun ./index.html` instead of through
  // scripts/dev.ts, which is the only place the version variable is set.
  console.warn('No build version was injected. Start the app with `bun run dev`.')
}

type ParsedVersion = {
  release: number[]
  prerelease: string[]
}

function parseVersion(value: string): ParsedVersion | null {
  if (value.length > MAX_SEEN_VERSION_LENGTH) {
    return null
  }

  const match = value
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) {
    return null
  }

  return {
    release: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function comparePrereleaseIdentifiers(a: string, b: string) {
  const isANumeric = /^\d+$/.test(a)
  const isBNumeric = /^\d+$/.test(b)
  if (isANumeric && isBNumeric) return Number(a) - Number(b)
  // Semver ranks numeric identifiers below alphanumeric ones.
  if (isANumeric !== isBNumeric) return isANumeric ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

function compareVersions(a: ParsedVersion, b: ParsedVersion) {
  for (let index = 0; index < a.release.length; index += 1) {
    const difference = a.release[index] - b.release[index]
    if (difference !== 0) return difference
  }

  // A release without a prerelease suffix outranks the same release with one.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length
  }

  const sharedLength = Math.min(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = comparePrereleaseIdentifiers(a.prerelease[index], b.prerelease[index])
    if (difference !== 0) return difference
  }

  return a.prerelease.length - b.prerelease.length
}

export function isNewerVersion(candidate: string, baseline: string) {
  const parsedCandidate = parseVersion(candidate)
  const parsedBaseline = parseVersion(baseline)
  if (!parsedCandidate || !parsedBaseline) {
    return false
  }

  return compareVersions(parsedCandidate, parsedBaseline) > 0
}

/**
 * Releases with changelog entries that shipped after the version the browser
 * recorded on the last visit. Empty on a first visit (nothing to catch up on)
 * and for untagged development builds (no changelog to show).
 */
export function releasesSince(buildInfo: BuildInfo, seenVersion: string | null) {
  if (!buildInfo.isTagged || !seenVersion) {
    return []
  }

  return buildInfo.releases.filter(
    (release) => release.changes.length > 0 && isNewerVersion(release.version, seenVersion),
  )
}

function readSeenVersion() {
  try {
    return window.localStorage.getItem(SEEN_VERSION_STORAGE_KEY)
  } catch {
    return null
  }
}

// Read once per page load so that recording the current version cannot change
// the answer for a component that remounts (React StrictMode does this).
const seenVersionAtBoot = readSeenVersion()

export function unseenReleaseVersions() {
  return new Set(releasesSince(BUILD_INFO, seenVersionAtBoot).map((release) => release.version))
}

export function rememberCurrentVersion() {
  if (!BUILD_INFO.isTagged) {
    return
  }

  try {
    window.localStorage.setItem(SEEN_VERSION_STORAGE_KEY, BUILD_INFO.version)
  } catch {
    // A full or blocked storage quota should not break the app.
  }
}
