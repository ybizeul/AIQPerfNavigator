const DIST = new URL('../dist', import.meta.url).pathname
const PORT = Number(process.env.PORT) || 4173

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const file = Bun.file(`${DIST}${pathname}`)

    if (await file.exists()) {
      return new Response(file)
    }

    const index = Bun.file(`${DIST}/index.html`)
    if (await index.exists()) {
      return new Response(index)
    }

    return new Response('Run bun run build first.', { status: 404 })
  },
})

console.log(`Preview http://localhost:${server.port}`)
