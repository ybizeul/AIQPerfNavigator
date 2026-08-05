# mise Setup Guide

This project uses [mise](https://mise.jdx.dev/) for managing tool dependencies and task running.

## Quick Start

```bash
# 1. Install tools defined in .mise.toml
mise install

# 2. Install npm dependencies
mise run install

# 3. Start development
mise run dev
```

## Configuration Files

- `.mise.toml` - Main mise configuration with tools and tasks
- `.tool-versions` - Tool versions (compatible with asdf)

## Available Tools

### Node.js
- **Version**: 26.5.0
- **Location**: `~/.local/share/mise/installs/node/26.5.0/`
- **Check version**: `mise current`
- **Switch versions**: Edit `.mise.toml` and run `mise install`

### npm
- Bundled with Node.js (v11.17.0)
- Automatically available when Node.js is installed via mise

## Available Tasks

All tasks are defined in `.mise.toml` under `[tasks.*]`:

| Task | Command | Description |
|------|---------|-------------|
| `install` | `npm install` | Install project dependencies |
| `dev` | `npm run dev` | Start development server |
| `build` | `npm run build` | Build for production |
| `lint` | `npm run lint` | Run oxlint |
| `preview` | `npm run preview` | Preview production build |
| `typecheck` | `npx tsc -b` | Run TypeScript type checking |
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
mise use node@latest
mise install
```

## Adding New Tools

Edit `.mise.toml` and add tools under `[tools]`:

```toml
[tools]
node = "26.5.0"
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
run = "npm test"
```

## Troubleshooting

### Tool not found
```bash
# Reinstall all tools
mise install

# Install specific tool
mise install node@26.5.0
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
