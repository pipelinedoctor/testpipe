#!/usr/bin/env node
import { parseArgs } from "util";
import { runParseCommand } from "./commands/parse.js";
import { runPushCommand } from "./commands/push.js";

// Register all parsers
import "@testpipe/parsers";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    format: { type: "string", short: "f" },
    output: { type: "string", short: "o" },
    db: { type: "string" },
    push: { type: "string" },
    token: { type: "string" },
    stdin: { type: "boolean" },
    env: { type: "boolean" },
    strict: { type: "boolean" },
    "exit-code": { type: "boolean" },
    version: { type: "boolean", short: "v" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help) {
  process.stdout.write(`
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
`);
  process.exit(0);
}

if (values.version) {
  process.stdout.write("0.1.0\n");
  process.exit(0);
}

const file = positionals[0];

if (values.push) {
  const token = values.token ?? process.env["TESTPIPE_TOKEN"] ?? "";
  runPushCommand(file, values.push, token, values.format, values.strict);
} else {
  runParseCommand({
    file,
    stdin: values.stdin,
    format: values.format,
    output: values.output as "json" | "ndjson" | "summary" | "sqlite" | undefined,
    db: values.db,
    strict: values.strict,
    env: values.env,
    exitCode: values["exit-code"],
  });
}
