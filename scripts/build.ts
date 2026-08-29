const SEMVER_TAG_PATTERN =
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const CHANGE_PATTERN = /^(feat|fix)(?:\([^)]*\))?!?:\s*(.+)$/

type BuildChangeType = 'feat' | 'fix'

type BuildChange = {
  type: BuildChangeType
  description: string
}

type BuildInfo = {
  version: string
  isTagged: boolean
  releases: Array<{
    version: string
    changes: BuildChange[]
  }>
}

function runGit(args: string[]): string | null {
  const result = Bun.spawnSync(['git', ...args], {
    stdout: 'pipe',
    stderr: 'ignore',
  })

  if (result.exitCode !== 0) {
    return null
  }

  return result.stdout.toString().trim()
}

function getBuildInfo(): BuildInfo {
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

  return {
    version: currentTag ?? '0.0.0-dev',
    isTagged: currentTag !== undefined,
    releases,
  }
}

const buildInfo = getBuildInfo()
const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  minify: true,
  define: {
    __AIQ_BUILD_INFO__: JSON.stringify(buildInfo),
  },
})

for (const log of result.logs) {
  console.error(log)
}

if (!result.success) {
  process.exit(1)
}

console.log(`Built AIQ Navigator ${buildInfo.version}`)
