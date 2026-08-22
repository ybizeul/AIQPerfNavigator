# AGENTS.md

This document provides guidelines for AI coding agents working on the **AIQ System Organizer** codebase.

## Project Overview

A React web tool for searching and organizing AIQ systems via GraphQL. The app stores bearer tokens and saved systems locally in browser storage, and allows tagging and filtering of systems.

- **Tech stack**: React 19, TypeScript 6, Bun, Mantine UI 9, oxlint

## Build & Development Commands

### Tool Management with mise

This project uses [mise](https://mise.jdx.dev/) to manage Bun and other tools.

**Setup** (first time):
```bash
mise install             # Install Bun and other tools defined in .mise.toml
```

**Check current versions**:
```bash
mise current             # Show active tool versions
mise list                # Show all installed versions
```

### Standard commands

**Using mise tasks** (recommended):
```bash
mise run install         # Install dependencies
mise run dev            # Start Bun HTML/React dev server
mise run build          # Build for production (tsc -b && bun build)
mise run preview        # Preview production build
mise run lint           # Run oxlint
mise run typecheck      # Run TypeScript type checking
mise run clean          # Clean build artifacts and dependencies
mise run reset          # Clean and reinstall dependencies
```

**Or using Bun directly**:
```bash
bun install              # Install dependencies
bun run dev             # Start Bun HTML/React dev server
bun run build           # Build for production (tsc -b && bun build)
bun run preview         # Preview production build
bun run lint            # Run oxlint
```

### Running type checks
```bash
mise run typecheck      # Run TypeScript type checking (recommended)
bunx tsc -b             # Type check all project references
bunx tsc -b --force     # Force rebuild type info
```

### Testing
⚠️ **No test framework is currently configured.** If tests are added:
- Use `bun test`
- Run a single file: `bun test <test-file-path>`

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2023
- **Module**: ESNext with bundler resolution
- **JSX**: react-jsx
- **Strict checks enabled**:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `erasableSyntaxOnly: true`

### Imports

**Order and grouping**:
1. React imports first
2. External library imports (grouped by library)
3. Local imports
4. Types last (if separate)

**Example** (from `App.tsx:1-34`):
```typescript
import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  AppShell,
  // ... other Mantine components alphabetically
} from '@mantine/core'
import { useDisclosure, useLocalStorage } from '@mantine/hooks'
import {
  IconDatabase,
  IconDeviceFloppy,
  // ... other icons
} from '@tabler/icons-react'
```

**Best practices**:
- Use named imports, avoid default imports for libraries with multiple exports
- Group related imports from the same package
- Sort Mantine UI components alphabetically for readability
- Use `.tsx` extension for files with JSX, `.ts` for plain TypeScript

### Formatting

- **No semicolons** at end of statements
- **Single quotes** for strings (except JSX attributes use double quotes)
- **2-space indentation**
- **Trailing commas** in multiline objects/arrays
- **Line length**: Keep under 100 characters when possible

### Types & Naming

**Type definitions** (`App.tsx:66-120`):
- Use `type` (not `interface`) for all type definitions
- Name types in PascalCase: `SearchForm`, `SystemSummary`, `SavedSystem`
- Define types near where they're used, or at top of file for shared types
- Use explicit return types for async functions
- Prefer type unions over enums

**Naming conventions**:
- **Variables/functions**: camelCase (`searchForm`, `handleFieldChange`)
- **Components**: PascalCase (`App`, `SystemCard`)
- **Constants**: SCREAMING_SNAKE_CASE for true constants (`API_URL`, `PAGE_SIZE`)
- **Boolean variables**: Use `is`, `has`, `should` prefixes (`isLoading`, `hasTags`)
- **Event handlers**: Prefix with `handle` (`handleSearch`, `handleTokenSave`)

**Type annotations**:
```typescript
// Good - explicit types for function parameters and return values
async function searchSystems(token: string, form: SearchForm): Promise<SearchResultState> {
  // ...
}

// Good - type inference for simple variables
const allTags = useMemo(
  () => Array.from(new Set(savedSystems.flatMap((system) => system.tags))),
  [savedSystems],
)

// Good - explicit generic types
const [savedSystems, setSavedSystems] = useLocalStorage<SavedSystem[]>({
  key: 'aiq-system-organizer-systems',
  defaultValue: [],
})
```

### Error Handling

**Pattern** (`App.tsx:207-244`):
```typescript
try {
  const nextResults = await searchSystems(token, searchForm)
  setResults(nextResults)
} catch (error) {
  setSearchError(error instanceof Error ? error.message : 'Search failed.')
  setResults({
    systems: [],
    totalCount: 0,
    siteFilterWasClientSide: false,
  })
} finally {
  setIsLoading(false)
}
```

**Guidelines**:
- Always type-check errors: `error instanceof Error`
- Provide fallback messages for unknown errors
- Reset state appropriately in catch blocks
- Use `finally` for cleanup (e.g., loading states)
- Throw descriptive errors: `throw new Error(\`AIQ request failed with HTTP ${response.status}.\`)`

### React Patterns

**State management**:
- Use `useState` for local component state
- Use `useLocalStorage` (Mantine hook) for persistent data
- Use `useMemo` for expensive computations
- Use `useDisclosure` (Mantine hook) for modal/drawer state

**Component structure** (`App.tsx:256-334`):
```typescript
function SystemCard({
  system,
  action,
  actionLabel,
  tagsEditor,
}: {
  system: SavedSystem | SystemSummary
  action?: () => void
  actionLabel?: string
  tagsEditor?: JSX.Element
}) {
  // Component logic
  return (
    <Card withBorder radius="md" shadow="sm">
      {/* JSX */}
    </Card>
  )
}
```

**Best practices**:
- Define prop types inline with destructuring
- Use optional props with `?` when appropriate
- Keep components pure when possible
- Extract reusable components into separate functions
- Use Mantine UI components for consistency

### CSS & Styling

**Approach**:
- Use Mantine UI's built-in styling props (no CSS modules needed for most cases)
- CSS files use modern CSS with nesting (`App.css:1-185`)
- Use CSS custom properties for theming: `var(--mantine-color-gray-0)`
- Use Mantine's `light-dark()` function for theme-aware colors

**Example**:
```css
body {
  background: light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8));
}
```

## Linting

**Configuration** (`.oxlintrc.json`):
- Uses oxlint (fast Rust-based linter)
- Plugins: `react`, `typescript`, `oxc`
- Key rules:
  - `react/rules-of-hooks: error` - Enforce React Hooks rules
  - `react/only-export-components: warn` - Warn on non-component exports

**Running lint**:
```bash
bun run lint                    # Lint entire project
bunx oxlint src/App.tsx         # Lint specific file
```

## Project Structure

```
consolidator/
├── src/
│   ├── App.tsx              # Main application component
│   ├── App.css              # App-specific styles
│   ├── main.tsx             # Application entry point
│   ├── index.css            # Global styles
│   └── assets/              # Static assets
├── public/                  # Public static files
├── scripts/
│   └── preview.ts           # Serve dist/ for production preview
├── docs/                    # Project documentation
│   ├── MISE.md             # mise setup and usage guide
│   └── REFACTORING_SUMMARY.md  # Refactoring history
├── dist/                    # Build output (generated)
├── graphql-schema.json      # AIQ GraphQL schema reference
├── index.html               # Bun HTML entrypoint
├── package.json
├── bun.lock                 # Bun lockfile
├── tsconfig.json            # Root TS config (references only)
├── tsconfig.app.json        # App TS config
├── .oxlintrc.json          # Linting configuration
├── .mise.toml              # mise tool version management
├── .gitignore              # Git ignore patterns
└── AGENTS.md               # This file - AI agent guidelines
```

## Common Patterns & Conventions

### Data transformation helpers
```typescript
function normalizeValue(value: string) {
  return value.trim()
}

function createSystemKey(system: Pick<SystemSummary, 'serialNumber' | 'systemId'>) {
  return `${system.serialNumber}::${system.systemId ?? ''}`
}
```

### Form handling
- Use controlled components with `value` and `onChange`
- Normalize input values with `trim()`
- Validate before submission

### API calls
- Always include `Authorization: Bearer ${token}` header
- Check `response.ok` before parsing JSON
- Handle both HTTP errors and GraphQL errors
- Type the response payload appropriately

## Git Workflow

- Repository is initialized with Git
- Use conventional commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, etc.
- Keep commits atomic and focused
- Check `.gitignore` for excluded files (node_modules, dist, etc.)

## Additional Notes

- **No testing infrastructure** currently configured
- **No CI/CD** pipeline currently configured
- **Local storage** is used for all persistence (tokens, saved systems, tags)
- **GraphQL schema** is provided as reference in `graphql-schema.json`
- **Customer site filtering** is applied client-side (schema limitation)
