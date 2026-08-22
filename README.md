# AIQ performance browser

Small React web tool built on top of the repository GraphQL schema for:

- storing an AIQ bearer token locally in the browser
- searching systems by customer, cluster, serial number, system name, and customer site
- saving selected systems locally
- organizing saved systems with tags
- browsing saved systems by selected tags

## API

- Base endpoint: `https://gql.aiq.netapp.com/graphql`
- Auth: `Authorization: Bearer <token>`

The app uses the schema-backed `systems(searchFilters: ...)` query for customer, cluster, serial number, and system name. Customer-site filtering is applied client-side against the `site` data returned on each system because the schema does not expose a dedicated site-name search field on `systems`.

## Setup

### Prerequisites

This project uses [mise](https://mise.jdx.dev/) to manage Bun and other tools.

**Install mise** (if not already installed):
```bash
curl https://mise.run | sh
```

Or via Homebrew:
```bash
brew install mise
```

### Initial setup

1. Install project tools (Bun):
   ```bash
   mise install
   ```

2. Install dependencies:
   ```bash
   mise run install
   # or directly: bun install
   ```

## Development

### Run locally

```bash
mise run dev
# or directly: bun run dev
```

### Build

```bash
mise run build
# or directly: bun run build
```

### Lint

```bash
mise run lint
# or directly: bun run lint
```

### Type checking

```bash
mise run typecheck
# or directly: bunx tsc -b
```

### Available mise tasks

Run `mise tasks` to see all available tasks:
- `mise run install` - Install project dependencies
- `mise run dev` - Start development server
- `mise run build` - Build for production
- `mise run lint` - Run oxlint
- `mise run preview` - Preview production build
- `mise run typecheck` - Run TypeScript type checking
- `mise run clean` - Clean build artifacts and dependencies
- `mise run reset` - Clean and reinstall dependencies
