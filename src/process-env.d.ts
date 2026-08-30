// Bun inlines `process.env.AIQ_PUBLIC_*` literals into the client bundle. The app
// project takes no Node or Bun globals, so declare only what src/version.ts reads.
declare const process: { env: { AIQ_PUBLIC_BUILD_INFO?: string } }
