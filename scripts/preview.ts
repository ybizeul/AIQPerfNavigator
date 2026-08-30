import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const PORT = Number(process.env.PORT) || 4173
const HOST = '127.0.0.1'

function filePathUnderDist(pathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }

  const relative = decoded.replace(/^\/+/, '') || 'index.html'
  const resolved = path.resolve(DIST, relative)
  const fromDist = path.relative(DIST, resolved)
  if (
    fromDist === '..' ||
    fromDist.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromDist)
  ) {
    return null
  }

  return resolved
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const filePath = filePathUnderDist(url.pathname)
    if (!filePath) {
      return new Response('Forbidden', { status: 403 })
    }

    const file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file)
    }

    const index = Bun.file(path.join(DIST, 'index.html'))
    if (await index.exists()) {
      return new Response(index)
    }

    return new Response('Run bun run build first.', { status: 404 })
  },
})

console.log(`Preview http://127.0.0.1:${server.port}`)
