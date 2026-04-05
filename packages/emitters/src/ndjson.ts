import type { TestRun, TestStatus, FailureInfo } from "@testpipe/core";

interface NdjsonLine {
  runId: string;
  suiteName: string;
  caseName: string;
  status: TestStatus;
  durationMs: number;
  failure: FailureInfo | null;
}

export function* emitNdjson(run: TestRun): Generator<string> {
  for (const suite of run.suites) {
    for (const testCase of suite.cases) {
      const line: NdjsonLine = {
        runId: run.id,
        suiteName: suite.name,
        caseName: testCase.name,
        status: testCase.status,
        durationMs: testCase.durationMs,
        failure: testCase.failure,
      };
      yield JSON.stringify(line);
    }
  }
}
