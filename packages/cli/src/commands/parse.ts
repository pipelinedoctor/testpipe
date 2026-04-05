import { readFileSync } from "fs";
import { detectParser, getParser } from "@testpipe/core";
import type { ParseOptions } from "@testpipe/core";
import { emitJson } from "@testpipe/emitters/json";
import { emitNdjson } from "@testpipe/emitters/ndjson";
import { emitSummary } from "@testpipe/emitters/summary";
import { emitSqlite } from "@testpipe/emitters/sqlite";

export interface ParseCommandOptions {
  file?: string;
  stdin?: boolean;
  format?: string;
  output?: "json" | "ndjson" | "summary" | "sqlite";
  db?: string;
  strict?: boolean;
  env?: boolean;
  exitCode?: boolean;
}

function detectCiEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env["GITHUB_ACTIONS"] === "true") env["ci_platform"] = "github-actions";
  else if (process.env["GITLAB_CI"] === "true") env["ci_platform"] = "gitlab-ci";
  else if (process.env["CIRCLECI"] === "true") env["ci_platform"] = "circleci";

  const branch =
    process.env["GITHUB_REF_NAME"] ??
    process.env["CI_COMMIT_REF_NAME"] ??
    process.env["CIRCLE_BRANCH"];
  if (branch) env["branch"] = branch;

  const sha =
    process.env["GITHUB_SHA"] ??
    process.env["CI_COMMIT_SHA"] ??
    process.env["CIRCLE_SHA1"];
  if (sha) env["commit_sha"] = sha;

  if (process.env["RUNNER_OS"]) env["runner_os"] = process.env["RUNNER_OS"];

  return env;
}

export async function runParseCommand(opts: ParseCommandOptions): Promise<void> {
  let input: string;
  let filename: string | undefined;

  if (opts.stdin) {
    input = readFileSync(0, "utf-8");
  } else if (opts.file) {
    try {
      input = readFileSync(opts.file, "utf-8");
      filename = opts.file;
    } catch {
      process.stderr.write(`Error: File not found: ${opts.file}\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write("Error: No input file specified. Use <file> or --stdin.\n");
    process.exit(1);
  }

  let parser = opts.format ? getParser(opts.format) : null;
  if (!parser) {
    parser = detectParser(input, filename);
  }

  if (!parser) {
    process.stderr.write(
      "Error: Could not detect test result format. Use --format to specify.\n"
    );
    process.exit(1);
  }

  const parseOptions: ParseOptions = {
    strict: opts.strict,
    environment: opts.env ? detectCiEnvironment() : undefined,
  };

  const run = parser.parse(input, parseOptions);

  const outputFormat = opts.output ?? "json";

  switch (outputFormat) {
    case "json":
      process.stdout.write(emitJson(run) + "\n");
      break;
    case "ndjson":
      for (const line of emitNdjson(run)) {
        process.stdout.write(line + "\n");
      }
      break;
    case "summary":
      emitSummary(run, filename);
      break;
    case "sqlite":
      if (!opts.db) {
        process.stderr.write("Error: --db <path> is required for SQLite output.\n");
        process.exit(1);
      }
      emitSqlite(run, opts.db);
      break;
  }

  if (opts.exitCode && (run.summary.failed > 0 || run.summary.errored > 0)) {
    process.exit(1);
  }
}
