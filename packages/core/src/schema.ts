import { randomUUID } from "crypto";

export type SourceFormat =
  | "junit_xml"
  | "jest_json"
  | "vitest_json"
  | "go_test_json"
  | "pytest_xml"
  | "dotnet_trx"
  | "raw_log"
  | "unknown";

export type TestStatus = "passed" | "failed" | "errored" | "skipped";

export type FailureType = "assertion_failure" | "error" | "timeout" | "crash";

export interface FailureInfo {
  type: FailureType;
  message: string;
  body: string | null;
  /** Original XML element name, e.g. "failure" or "error". Preserved for lossless roundtrip. */
  sourceType: string | null;
}

export interface Attachment {
  filename: string | null;
  mimeType: string | null;
  /** Base64-encoded content */
  data: string;
}

export interface TestCase {
  name: string;
  /** Class name or module path. Null if not provided by framework. */
  classname: string | null;
  status: TestStatus;
  durationMs: number;
  failure: FailureInfo | null;
  properties: Record<string, string>;
  attachments: Attachment[];
  systemOut: string | null;
  systemErr: string | null;
  /**
   * Number of retry/rerun attempts before this result.
   * 0 = first attempt (no retries). Used for flaky test detection.
   */
  retries: number;
}

export interface TestSuite {
  name: string;
  timestamp: string | null;   // ISO 8601
  durationMs: number;
  properties: Record<string, string>;
  cases: TestCase[];
  systemOut: string | null;
  systemErr: string | null;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  durationMs: number;
}

export interface TestRun {
  id: string;               // UUID generated at parse time
  sourceFormat: SourceFormat;
  /** Detected framework name: "pytest", "jest", "vitest", "junit5", "go", etc. */
  sourceFramework: string | null;
  timestamp: string | null; // ISO 8601
  durationMs: number;
  /**
   * CI environment detected from process.env or passed explicitly.
   * Keys: ci_platform, branch, commit_sha, runner_os, job_name.
   */
  environment: Record<string, string> | null;
  /**
   * Framework-specific data that does not fit the canonical schema.
   * Nothing is discarded — it goes here.
   */
  metadata: Record<string, unknown>;
  suites: TestSuite[];
  summary: RunSummary;
}

export function computeSummary(suites: TestSuite[]): RunSummary {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let skipped = 0;
  let durationMs = 0;
  for (const suite of suites) {
    durationMs += suite.durationMs;
    for (const tc of suite.cases) {
      total++;
      switch (tc.status) {
        case "passed": passed++; break;
        case "failed": failed++; break;
        case "errored": errored++; break;
        case "skipped": skipped++; break;
      }
    }
  }
  return { total, passed, failed, errored, skipped, durationMs };
}
