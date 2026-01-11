# Contributing to opencode-plugin-langfuse

Thank you for your interest in contributing! 🎉

## Development Setup

```bash
# Clone the repo
git clone https://github.com/omercnet/opencode-plugin-langfuse.git
cd opencode-plugin-langfuse

# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

## Testing Locally

### Option 1: Link in Another Project

```bash
# In plugin directory
bun link

# In your project
cd /path/to/your-opencode-project
bun link opencode-plugin-langfuse
```

Then configure in `.opencode/opencode.json`:

```json
{
  "plugin": ["opencode-plugin-langfuse"]
}
```

### Option 2: Use Relative Path

In your `.opencode/opencode.json`:

```json
{
  "plugin": ["file:../opencode-plugin-langfuse"]
}
```

## Code Style

- TypeScript strict mode
- ESLint + Prettier
- 2 spaces indentation
- Semicolons required
- Single quotes for strings (except in JSON)

## Commit Messages

Follow conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Build/tooling changes
- `refactor:` - Code refactoring

Examples:

```
feat: add support for custom metadata per trace
fix: prevent memory leak in trace cleanup
docs: update README with self-hosting guide
```

## Pull Request Process

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `bun test` (when tests exist)
5. Type check: `bun run typecheck`
6. Lint: `bun run lint`
7. Format: `bun run format`
8. Commit with conventional commits
9. Push and open a PR

## Release Process (Maintainers Only)

```bash
# Update version in package.json
npm version patch|minor|major

# Build
bun run build

# Publish
npm publish
```

## Questions?

Open an issue or discussion on GitHub!
