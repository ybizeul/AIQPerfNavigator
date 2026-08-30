import type { BuildChange, BuildChangeType, BuildInfo } from '../src/build-info'

// Bun inlines AIQ_PUBLIC_* into the client bundle (see bunfig.toml and
// scripts/build.ts), which is how src/version.ts receives this payload.
export const BUILD_INFO_ENV_VAR = 'AIQ_PUBLIC_BUILD_INFO'

const SEMVER_TAG_PATTERN =
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const CHANGE_PATTERN = /^(feat|fix)(?:\([^)]*\))?!?:\s*(.+)$/

function runGit(args: string[]): string | null {
  const result = Bun.spawnSync(['git', ...args], {
    stdout: 'pipe',
    stderr: 'ignore',
  })

  if (result.exitCode !== 0) {
    return null
  }

  const output = result.stdout.toString().trim()
  return output.length > 0 ? output : null
}

/**
 * `git describe --long` prints `<tag>-<commits>-g<hash>`. Drop the hash so the
 * displayed version is `<tag>-<commits>` when HEAD is not a tag.
 */
export function versionFromGitDescribe(described: string) {
  const match = described.trim().match(/^(.*)-g[0-9a-f]+(?:-dirty)?$/i)
  return match ? match[1] : described.trim()
}

function describedVersion() {
  const described =
    runGit(['describe', '--tags', '--long', '--match', 'v[0-9]*']) ??
    runGit(['describe', '--tags', '--long'])

  return described ? versionFromGitDescribe(described) : null
}

export function getBuildInfo(): BuildInfo {
  const tags = (runGit(['tag', '--merged', 'HEAD', '--sort=-version:refname']) ?? '')
    .split('\n')
    .filter((tag) => SEMVER_TAG_PATTERN.test(tag))
  const headTags = new Set(
    (runGit(['tag', '--points-at', 'HEAD']) ?? '')
      .split('\n')
      .filter((tag) => SEMVER_TAG_PATTERN.test(tag)),
  )
  const currentTag = tags.find((tag) => headTags.has(tag))

  const releases = tags.flatMap((tag, index) => {
    const olderTag = tags[index + 1]
    if (!olderTag) {
      return []
    }

    const subjects = (runGit(['log', '--format=%s', '--reverse', `${olderTag}..${tag}`]) ?? '')
      .split('\n')
    const changes = subjects.flatMap((subject): BuildChange[] => {
      const match = subject.match(CHANGE_PATTERN)
      if (!match) {
        return []
      }

      return [
        {
          type: match[1] as BuildChangeType,
          description: match[2],
        },
      ]
    })

    return [{ version: tag, changes }]
  })

  const version = currentTag ?? describedVersion()
  if (!version) {
    throw new Error('Could not determine version from git tags or git describe.')
  }

  return {
    version,
    isTagged: currentTag !== undefined,
    releases,
  }
}
