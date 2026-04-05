import { randomUUID } from "crypto";
import type { TestRun, TestSuite, TestCase, FailureInfo } from "@testpipe/core";
import { computeSummary } from "@testpipe/core";
import type { ParseOptions } from "@testpipe/core";

interface VitestTestCase {
  name?: string;
  title?: string;
  ancestorTitles?: string[];
  status?: string;
  duration?: number | null;
  failureMessages?: string[];
  mode?: string;
}

interface VitestTestResult {
  testFilePath?: string;
  name?: string;
  startTime?: number;
  endTime?: number;
  testResults?: VitestTestCase[];
  tests?: VitestTestCase[];
}

interface VitestJson {
  numTotalTests?: number;
  testResults?: VitestTestResult[];
  config?: unknown;
  typecheck?: unknown;
}

function normalizeStatus(status: string | undefined): TestCase["status"] {
  switch (status) {
    case "passed": return "passed";
    case "failed": return "failed";
    case "skipped":
    case "pending":
    case "todo": return "skipped";
    default: return "skipped";
  }
}

function normalizeTestCase(tc: VitestTestCase): TestCase | null {
  if (tc.mode === "benchmark") return null;

  const title = tc.title ?? tc.name ?? "";
  const ancestors = tc.ancestorTitles ?? [];
  const name = [...ancestors, title].join(" > ");
  const status = normalizeStatus(tc.status);
  let failure: FailureInfo | null = null;

  if (status === "failed" && tc.failureMessages && tc.failureMessages.length > 0) {
    const body = tc.failureMessages.join("\n---\n");
    const firstLine = tc.failureMessages[0].split("\n")[0];
    failure = {
      type: "assertion_failure",
      message: firstLine,
      body,
      sourceType: null,
    };
  }

  return {
    name,
    classname: null,
    status,
    durationMs: tc.duration ?? 0,
    failure,
    properties: {},
    attachments: [],
    systemOut: null,
    systemErr: null,
    retries: 0,
  };
}

function normalizeSuite(result: VitestTestResult): TestSuite {
  const rawCases = result.testResults ?? result.tests ?? [];
  const cases = rawCases
    .map(normalizeTestCase)
    .filter((tc): tc is TestCase => tc !== null);

  return {
    name: result.testFilePath ?? result.name ?? "unknown",
    timestamp: result.startTime ? new Date(result.startTime).toISOString() : null,
    durationMs: (result.endTime ?? 0) - (result.startTime ?? 0),
    properties: {},
    cases,
    systemOut: null,
    systemErr: null,
  };
}

export function normalizeVitest(input: string, options?: ParseOptions): TestRun {
  const parseErrors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    if (options?.strict) throw e;
    parseErrors.push(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      id: randomUUID(),
      sourceFormat: "vitest_json",
      sourceFramework: options?.framework ?? "vitest",
      timestamp: null,
      durationMs: 0,
      environment: options?.environment ?? null,
      metadata: { parseErrors },
      suites: [],
      summary: { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: 0 },
    };
  }

  const data = parsed as VitestJson;
  const suites = (data.testResults ?? []).map(normalizeSuite);

  return {
    id: randomUUID(),
    sourceFormat: "vitest_json",
    sourceFramework: options?.framework ?? "vitest",
    timestamp: null,
    durationMs: suites.reduce((sum, s) => sum + s.durationMs, 0),
    environment: options?.environment ?? null,
    metadata: {
      parseErrors,
      typecheck: data.typecheck ?? null,
      config: data.config ?? null,
    },
    suites,
    summary: computeSummary(suites),
  };
}
