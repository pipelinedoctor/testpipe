import { randomUUID } from "crypto";
import type { TestRun, TestSuite, TestCase, FailureInfo } from "@testpipe/core";
import { computeSummary } from "@testpipe/core";
import type { ParseOptions } from "@testpipe/core";

interface JestTestResult {
  testFilePath: string;
  status: string;
  startTime: number;
  endTime: number;
  testResults: JestTestCase[];
}

interface JestTestCase {
  ancestorTitles: string[];
  title: string;
  status: string;
  duration: number | null;
  failureMessages?: string[];
}

interface JestJson {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
  snapshot?: unknown;
}

function normalizeStatus(status: string): TestCase["status"] {
  switch (status) {
    case "passed": return "passed";
    case "failed": return "failed";
    case "pending":
    case "todo":
    case "skipped": return "skipped";
    default: return "skipped";
  }
}

function normalizeTestCase(tc: JestTestCase): TestCase {
  const nameParts = [...tc.ancestorTitles, tc.title];
  const name = nameParts.join(" > ");
  const status = normalizeStatus(tc.status);
  let failure: FailureInfo | null = null;

  if (status === "failed" && tc.failureMessages && tc.failureMessages.length > 0) {
    const body = tc.failureMessages.join("\n---\n");
    const firstLine = tc.failureMessages[0].split("\n")[0];
    const isSnapshot =
      tc.failureMessages[0].includes("toMatchSnapshot") ||
      tc.failureMessages[0].includes("toMatchInlineSnapshot");
    failure = {
      type: isSnapshot ? "assertion_failure" : "assertion_failure",
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

function normalizeSuite(result: JestTestResult): TestSuite {
  const cases = result.testResults.map(normalizeTestCase);
  return {
    name: result.testFilePath,
    timestamp: result.startTime ? new Date(result.startTime).toISOString() : null,
    durationMs: (result.endTime ?? 0) - (result.startTime ?? 0),
    properties: {},
    cases,
    systemOut: null,
    systemErr: null,
  };
}

export function normalizeJest(input: string, options?: ParseOptions): TestRun {
  const parseErrors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    if (options?.strict) throw e;
    parseErrors.push(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      id: randomUUID(),
      sourceFormat: "jest_json",
      sourceFramework: options?.framework ?? "jest",
      timestamp: null,
      durationMs: 0,
      environment: options?.environment ?? null,
      metadata: { parseErrors },
      suites: [],
      summary: { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: 0 },
    };
  }

  const data = parsed as JestJson;
  const suites = (data.testResults ?? []).map(normalizeSuite);

  return {
    id: randomUUID(),
    sourceFormat: "jest_json",
    sourceFramework: options?.framework ?? "jest",
    timestamp: null,
    durationMs: suites.reduce((sum, s) => sum + s.durationMs, 0),
    environment: options?.environment ?? null,
    metadata: { parseErrors, snapshot: data.snapshot ?? null },
    suites,
    summary: computeSummary(suites),
  };
}
