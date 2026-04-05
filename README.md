# TestPipe

A TypeScript library and CLI that ingests test results from any major testing framework, normalizes them into a single canonical schema, and outputs them as JSON, NDJSON, SQLite, or HTTP POST.

## Supported Formats

| Framework | Format | Detection |
|-----------|--------|-----------|
| pytest | JUnit XML (xunit2) | Auto |
| JUnit 4/5 (Maven Surefire) | JUnit XML | Auto |
| Jest | JSON (`--json`) | Auto |
| Vitest | JSON (`--reporter=json`) | Auto |
| Go test | NDJSON (`-json`) | Auto |

## Installation

```bash
# In your project
npm install testpipe

# Or run directly
npx testpipe <file>
```

## CLI Usage

```
testpipe <file> [options]
testpipe --stdin [options]

Options:
  -f, --format <format>    Force parser: junit-xml, jest-json, vitest-json, go-test-json
  -o, --output <format>    Output format: json (default), ndjson, summary, sqlite
  --db <path>              SQLite database path (required for -o sqlite)
  --push <url>             HTTP endpoint to push results to
  --token <token>          Bearer token for --push (or set TESTPIPE_TOKEN env var)
  --env                    Auto-detect CI environment from process.env
  --strict                 Fail on parse errors instead of partial results
  --exit-code              Exit with code 1 if any tests failed
  -v, --version            Print version
  -h, --help               Print help
```

### Examples

**Print a human-readable summary:**
```bash
testpipe results.xml -o summary
```

```
TestPipe Summary ──────────────────────────────────────
 Source:  pytest_xml     Framework: pytest
 File:    results.xml
──────────────────────────────────────────────────────
 ✓  Passed     142    (97.3%)
 ✗  Failed       3     (2.1%)
 ○  Skipped      1     (0.7%)
──────────────────────────────────────────────────────
 Total: 146 tests   Duration: 4.32s
```

**Output normalized JSON:**
```bash
testpipe results.xml -o json > normalized.json
```

**Stream one line per test case (NDJSON):**
```bash
testpipe results.xml -o ndjson
```

**Write to SQLite for further analysis:**
```bash
testpipe results.xml -o sqlite --db ./test-results.db
```

**Push results to an HTTP endpoint:**
```bash
testpipe results.xml --push https://api.example.com/runs --token $MY_TOKEN
```

**Exit with code 1 if any tests failed (useful in CI):**
```bash
testpipe results.xml --exit-code
```

**Auto-detect CI environment metadata:**
```bash
testpipe results.xml --env -o json
```

**Force a specific parser:**
```bash
testpipe output.xml --format junit-xml
```

## CI Integration

### GitHub Actions

```yaml
- name: Run tests
  run: pytest --junitxml=results.xml

- name: Push results to TestPipe
  run: npx testpipe results.xml --push ${{ secrets.TESTPIPE_URL }} --token ${{ secrets.TESTPIPE_TOKEN }} --env --exit-code
```

### GitLab CI

```yaml
test:
  script:
    - pytest --junitxml=results.xml
    - npx testpipe results.xml --push $TESTPIPE_URL --token $TESTPIPE_TOKEN --env --exit-code
  artifacts:
    reports:
      junit: results.xml
```

## Programmatic API

```typescript
import { detectParser } from '@testpipe/core';
import '@testpipe/parsers'; // registers all parsers

// Auto-detect and parse
const input = fs.readFileSync('results.xml', 'utf-8');
const parser = detectParser(input, 'results.xml');
const run = parser.parse(input);

console.log(run.summary);
// { total: 146, passed: 142, failed: 3, errored: 0, skipped: 1, durationMs: 4320 }
```

### Emitters

```typescript
import { emitJson, emitNdjson, emitSummary, emitSqlite, emitHttp } from '@testpipe/emitters';

// JSON string
const json = emitJson(run);

// NDJSON — one line per test case
for (const line of emitNdjson(run)) {
  process.stdout.write(line + '\n');
}

// Terminal summary table
emitSummary(run, 'results.xml');

// SQLite database
emitSqlite(run, './test-results.db');

// HTTP POST with retry
await emitHttp(run, 'https://api.example.com/runs', process.env.TOKEN);
```

### Using a specific parser directly

```typescript
import { junitXmlParser } from '@testpipe/parsers';

const run = junitXmlParser.parse(xml, {
  framework: 'pytest',              // override detected framework name
  environment: { branch: 'main' }, // attach CI metadata
  strict: true,                     // throw on any parse error
});
```

### Writing a custom parser

```typescript
import { registerParser } from '@testpipe/core';
import type { TestPipeParser } from '@testpipe/core';

const myParser: TestPipeParser = {
  id: 'my-format',
  name: 'My Custom Format',
  fileExtensions: ['.json'],

  detect(input, filename) {
    // Return 0–1 confidence score. Must be fast (no full parse).
    try {
      const obj = JSON.parse(input);
      return obj.myFormatKey ? 0.95 : 0.0;
    } catch {
      return 0.0;
    }
  },

  parse(input, options) {
    // Return a canonical TestRun. Never throw unless options.strict.
    // ...
  }
};

registerParser(myParser);
```

## Canonical Schema

All parsers normalize to the same `TestRun` type:

```typescript
interface TestRun {
  id: string;                          // UUID
  sourceFormat: SourceFormat;          // "junit_xml" | "jest_json" | ...
  sourceFramework: string | null;      // "pytest" | "jest" | "go" | ...
  timestamp: string | null;            // ISO 8601
  durationMs: number;
  environment: Record<string, string> | null;
  metadata: Record<string, unknown>;   // framework-specific extras
  suites: TestSuite[];
  summary: RunSummary;
}

interface TestSuite {
  name: string;
  timestamp: string | null;
  durationMs: number;
  properties: Record<string, string>;
  cases: TestCase[];
  systemOut: string | null;
  systemErr: string | null;
}

interface TestCase {
  name: string;
  classname: string | null;
  status: 'passed' | 'failed' | 'errored' | 'skipped';
  durationMs: number;
  failure: FailureInfo | null;
  properties: Record<string, string>;
  attachments: Attachment[];
  systemOut: string | null;
  systemErr: string | null;
  retries: number;
}
```

## SQLite Schema

When using `-o sqlite`, TestPipe writes to two tables:

```sql
-- One row per test run
SELECT * FROM runs;
-- id, source_format, source_framework, timestamp, duration_ms,
-- total, passed, failed, errored, skipped, environment

-- One row per test case
SELECT * FROM test_cases;
-- id, run_id, suite_name, name, classname, status, duration_ms,
-- failure_type, failure_message, failure_body, retries
```

Useful queries:

```sql
-- Flaky tests: passed sometimes, failed other times
SELECT name, COUNT(*) as runs,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
FROM test_cases
GROUP BY name
HAVING failures > 0 AND failures < runs;

-- Slowest tests across all runs
SELECT suite_name, name, duration_ms
FROM test_cases
ORDER BY duration_ms DESC
LIMIT 20;

-- Failure rate by suite
SELECT suite_name,
       COUNT(*) as total,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM test_cases
GROUP BY suite_name;
```

## Monorepo Structure

```
testpipe/
├── packages/
│   ├── core/        # Zero-dependency canonical schema + parser interface
│   ├── parsers/     # All framework parsers (JUnit XML, Jest, Vitest, Go)
│   ├── emitters/    # Output writers (JSON, NDJSON, summary, SQLite, HTTP)
│   └── cli/         # testpipe CLI entry point
├── fixtures/        # Real test output files used in tests
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Type-check without emitting
npm run lint
```

## Requirements

- Node.js 22.5+ (uses built-in `node:sqlite`)
- No native dependencies
