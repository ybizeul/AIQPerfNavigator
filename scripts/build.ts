import { BUILD_INFO_ENV_VAR, getBuildInfo } from './build-info'

const buildInfo = getBuildInfo()
const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  minify: true,
  // The dev server inlines this same expression from the environment (bunfig.toml),
  // so the app reads one name in both modes. Define values must be JSON, hence the
  // doubly encoded payload: the replacement has to be a string literal.
  define: {
    [`process.env.${BUILD_INFO_ENV_VAR}`]: JSON.stringify(JSON.stringify(buildInfo)),
  },
})

for (const log of result.logs) {
  console.error(log)
}

if (!result.success) {
  process.exit(1)
}

console.log(`Built AIQ Navigator ${buildInfo.version}`)
