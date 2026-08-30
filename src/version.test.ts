import { describe, expect, test } from 'bun:test'
import type { BuildInfo } from './build-info'
import { isNewerVersion, parseBuildInfo, releasesSince } from './version'

function taggedBuild(version: string, releaseVersions: string[]): BuildInfo {
  return {
    version,
    isTagged: true,
    releases: releaseVersions.map((releaseVersion) => ({
      version: releaseVersion,
      changes: [{ type: 'feat', description: `Something new in ${releaseVersion}` }],
    })),
  }
}

const BUILD = taggedBuild('v1.4.0', ['v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0'])

describe('isNewerVersion', () => {
  test('compares release numbers by precedence, not lexically', () => {
    expect(isNewerVersion('v1.2.0', 'v1.1.9')).toBe(true)
    expect(isNewerVersion('v1.10.0', 'v1.9.0')).toBe(true)
    expect(isNewerVersion('v2.0.0', 'v1.99.99')).toBe(true)
    expect(isNewerVersion('v1.1.9', 'v1.2.0')).toBe(false)
  })

  test('treats identical versions as not newer', () => {
    expect(isNewerVersion('v1.2.3', 'v1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.3', 'v1.2.3')).toBe(false)
  })

  test('ranks a prerelease below its final release', () => {
    expect(isNewerVersion('v1.2.3', 'v1.2.3-rc.1')).toBe(true)
    expect(isNewerVersion('v1.2.3-rc.1', 'v1.2.3')).toBe(false)
  })

  test('orders prerelease identifiers numerically then alphabetically', () => {
    expect(isNewerVersion('v1.2.3-rc.10', 'v1.2.3-rc.2')).toBe(true)
    expect(isNewerVersion('v1.2.3-rc.1', 'v1.2.3-beta.9')).toBe(true)
    expect(isNewerVersion('v1.2.3-rc.1.1', 'v1.2.3-rc.1')).toBe(true)
    expect(isNewerVersion('v1.2.3-1', 'v1.2.3-alpha')).toBe(false)
  })

  test('ignores build metadata', () => {
    expect(isNewerVersion('v1.2.3+build.9', 'v1.2.3+build.1')).toBe(false)
    expect(isNewerVersion('v1.2.3+build.9', 'v1.2.3')).toBe(false)
    expect(isNewerVersion('v1.2.3', 'v1.2.3+build.9')).toBe(false)
    expect(isNewerVersion('v1.2.3-rc.1+build', 'v1.2.3-rc.1')).toBe(false)
    expect(isNewerVersion('v1.2.4+build.1', 'v1.2.3+build.9')).toBe(true)
  })

  test('tolerates surrounding whitespace', () => {
    expect(isNewerVersion('  v1.2.4  ', 'v1.2.3')).toBe(true)
  })

  test('returns false when either version is unparsable', () => {
    expect(isNewerVersion('v1.2.3', '')).toBe(false)
    expect(isNewerVersion('v1.2.3', 'not-a-version')).toBe(false)
    expect(isNewerVersion('nightly', 'v1.2.3')).toBe(false)
    expect(isNewerVersion('v1.2', 'v1.1.0')).toBe(false)
  })
})

function versionsSince(buildInfo: BuildInfo, seenVersion: string | null) {
  return releasesSince(buildInfo, seenVersion).map((release) => release.version)
}

describe('releasesSince', () => {
  test('returns every release published after the stored version', () => {
    expect(versionsSince(BUILD, 'v1.2.0')).toEqual(['v1.4.0', 'v1.3.0'])
  })

  test('returns nothing when the stored version matches or leads the build', () => {
    expect(versionsSince(BUILD, 'v1.4.0')).toEqual([])
    expect(versionsSince(BUILD, 'v1.5.0')).toEqual([])
  })

  test('returns nothing on a first visit with nothing stored', () => {
    expect(versionsSince(BUILD, null)).toEqual([])
    expect(versionsSince(BUILD, '')).toEqual([])
  })

  test('returns nothing for untagged development builds', () => {
    const developmentBuild: BuildInfo = { version: 'v1.0.0-2', isTagged: false, releases: [] }
    expect(versionsSince(developmentBuild, 'v1.3.9')).toEqual([])
  })

  test('returns nothing when the stored value is corrupt or oversized', () => {
    expect(versionsSince(BUILD, '{}')).toEqual([])
    expect(versionsSince(BUILD, `v1.0.0-${'x'.repeat(200)}`)).toEqual([])
  })

  test('skips newer releases that have no feature or fix entries', () => {
    const buildWithEmptyRelease: BuildInfo = {
      version: 'v2.0.0',
      isTagged: true,
      releases: [
        { version: 'v2.0.0', changes: [] },
        { version: 'v1.9.0', changes: [{ type: 'fix', description: 'Fix a thing' }] },
      ],
    }
    expect(versionsSince(buildWithEmptyRelease, 'v1.8.0')).toEqual(['v1.9.0'])
    expect(versionsSince(buildWithEmptyRelease, 'v1.9.0')).toEqual([])
  })
})

describe('parseBuildInfo', () => {
  test('reads an injected payload', () => {
    expect(parseBuildInfo(JSON.stringify(BUILD))).toEqual(BUILD)
  })

  test('falls back to a blank version when nothing was injected', () => {
    expect(parseBuildInfo(undefined)).toEqual({ version: '', isTagged: false, releases: [] })
    expect(parseBuildInfo('')).toEqual({ version: '', isTagged: false, releases: [] })
  })

  test('fails loudly when the payload is broken, rather than hiding the version', () => {
    expect(() => parseBuildInfo('not json')).toThrow()
    expect(() => parseBuildInfo('null')).toThrow()
    expect(() => parseBuildInfo('{"version":"v1.0.0"}')).toThrow()
  })
})
