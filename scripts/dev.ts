import { BUILD_INFO_ENV_VAR, getBuildInfo } from './build-info'

const buildInfo = getBuildInfo()
const bun = Bun.spawn({
  cmd: ['bun', './index.html'],
  env: { ...process.env, [BUILD_INFO_ENV_VAR]: JSON.stringify(buildInfo) },
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
})

process.exitCode = await bun.exited
