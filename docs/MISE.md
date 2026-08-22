# mise Setup Guide

This project uses [mise](https://mise.jdx.dev/) for managing tool dependencies and task running.

## Quick Start

```bash
# 1. Install tools defined in .mise.toml
mise install

# 2. Install dependencies
mise run install

# 3. Start development
mise run dev
```

## Configuration Files

- `.mise.toml` - Main mise configuration with tools and tasks
- `.tool-versions` - Tool versions (compatible with asdf)

## Available Tools

### Bun
- **Version**: 1.4.0
- **Check version**: `mise current`
- **Switch versions**: Edit `.mise.toml` and run `mise install`

Bun is the package manager, script runtime, and HTML/React bundler for this project.

## Available Tasks

All tasks are defined in `.mise.toml` under `[tasks.*]`:

| Task | Command | Description |
|------|---------|-------------|
| `install` | `bun install` | Install project dependencies |
| `dev` | `bun run dev` | Start development server |
| `build` | `bun run build` | Build for production |
| `lint` | `bun run lint` | Run oxlint |
| `preview` | `bun run preview` | Preview production build |
| `typecheck` | `bunx tsc -b` | Run TypeScript type checking |
| `clean` | Remove dist/ and node_modules/ | Clean build artifacts |
| `reset` | `clean` + `install` | Clean and reinstall |

## Usage Examples

```bash
# Run a task
mise run build

# Run multiple tasks
mise run lint && mise run build

# Check what tools are active
mise current

# List all installed tools
mise list

# Update a tool
mise use bun@latest
mise install
```

## Adding New Tools

Edit `.mise.toml` and add tools under `[tools]`:

```toml
[tools]
bun = "1.4.0"
python = "3.12"  # Example
```

Then run:
```bash
mise install
```

## Adding New Tasks

Edit `.mise.toml` and add tasks under `[tasks.*]`:

```toml
[tasks.test]
description = "Run tests"
run = "bun test"
```

## Troubleshooting

### Tool not found
```bash
# Reinstall all tools
mise install

# Install specific tool
mise install bun@1.4.0
```

### Wrong version active
```bash
# Check what's active
mise current

# Ensure you're in the project directory
cd /path/to/project
mise current
```

### Tasks not working
```bash
# List available tasks
mise tasks

# Run with verbose output
mise run -v taskname
```

## Resources

- [mise documentation](https://mise.jdx.dev/)
- [mise tasks guide](https://mise.jdx.dev/tasks/)
- [mise configuration](https://mise.jdx.dev/configuration.html)
