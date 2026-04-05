# Contributing to testpipe

Thank you for your interest in contributing to testpipe! We welcome contributions from everyone. This guide will help you get started.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

## Getting Started

### Prerequisites

- Node.js 22+ 
- npm 11+

### Setup Development Environment

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/testpipe.git
cd testpipe
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Project Structure

This is a monorepo containing multiple packages:

- `packages/core` - Core parsing and detection logic
- `packages/parsers` - Test format parsers (go-test-json, jest-json, junit-xml, vitest-json)
- `packages/emitters` - Output emitters (json, ndjson, sqlite, http, summary)
- `packages/cli` - Command-line interface

Each package is independently publishable to npm.

## Development Workflow

### Running Scripts

```bash
# Build all packages
npm run build

# Type check without building
npm run lint

# Run tests
npm run test

# Build in watch mode (from packages/core)
cd packages/core && npx tsc --watch
```

### Making Changes

1. Create a feature branch:
```bash
git checkout -b feat/my-feature
```

2. Make your changes and ensure code quality:
```bash
npm run lint    # TypeScript type checking
npm run build   # Compile TypeScript
npm run test    # Run tests
```

3. Commit your changes (see [Commit Messages](#commit-messages) section)

4. Push to your fork and open a Pull Request

## Code Style & Standards

### TypeScript

- Use strict mode (enabled by default in tsconfig.json)
- Provide explicit type annotations for public APIs
- Use meaningful variable and function names
- Keep functions focused and testable

### File Organization

- Source files in `src/` directories
- Index files (`index.ts`) export public APIs
- Separate concerns into different modules
- Tests colocated with source files with `.test.ts` extension

### Example Structure

```
packages/my-package/
├── src/
│   ├── index.ts          # Public exports
│   ├── feature.ts        # Implementation
│   └── feature.test.ts   # Tests
└── dist/                 # Generated (ignored in git)
```

## Testing

- Write tests for new features and bug fixes
- Use Node.js built-in test runner
- Run `npm run test` before submitting PR
- Aim for good test coverage

Example test:
```typescript
import { test } from 'node:test';
import assert from 'node:assert';

test('my feature', () => {
  const result = myFunction();
  assert.strictEqual(result, expected);
});
```

## Commit Messages

Use conventional commits for clear, semantic commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring without feature/fix changes
- `test:` Adding or updating tests
- `chore:` Build, dependencies, or tooling changes

### Examples
```
feat(parsers): add support for custom test format

fix(core): handle null values correctly

docs(readme): update installation instructions

chore(deps): upgrade typescript to 5.4.0
```

## Pull Request Process

1. **Before submitting:**
   - Run `npm run build` to ensure TypeScript compiles
   - Run `npm run lint` for type checking
   - Run `npm run test` to verify tests pass
   - Update documentation if needed
   - Ensure your branch is up to date with main

2. **PR description should include:**
   - What change(s) does this PR make?
   - Why is this change needed?
   - How has this been tested?
   - Any breaking changes?

3. **We will:**
   - Review your code
   - Run automated checks
   - Provide feedback if needed
   - Merge when approved

## Adding New Features

### New Parser

To add a new test format parser:

1. Create new directory in `packages/parsers/src/`
2. Implement parser following existing parser patterns
3. Export from `packages/parsers/src/index.ts`
4. Add tests with sample fixtures in `fixtures/`
5. Update README with the new format

### New Emitter

To add a new output format:

1. Create new file in `packages/emitters/src/`
2. Implement emitter following existing patterns
3. Export from `packages/emitters/src/index.ts`
4. Add tests
5. Update `packages/emitters/package.json` exports if needed

## Documentation

- Keep README.md up to date
- Document public APIs with JSDoc comments
- Add examples for complex features
- Update this guide if process changes

Example JSDoc:
```typescript
/**
 * Parses test output in the given format
 * @param input - The test output string
 * @param format - The format type (e.g., 'jest', 'junit')
 * @returns Parsed test results
 */
export function parse(input: string, format: string): TestResults {
  // ...
}
```

## Release Process

Releases are automated via GitHub Actions:

1. Create and push a version tag:
```bash
git tag v0.1.0
git push origin v0.1.0
```

2. GitHub Actions will:
   - Build the project
   - Run linting
   - Publish all packages to npm
   - Create a GitHub release

**Note:** Only maintainers can create release tags. Ensure your version bumps follow [semver](https://semver.org/).

## Questions or Need Help?

- Check existing [issues](https://github.com/testpipe/testpipe/issues)
- Open a [discussion](https://github.com/testpipe/testpipe/discussions)
- Review existing PRs for similar work

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to testpipe! 🎉

