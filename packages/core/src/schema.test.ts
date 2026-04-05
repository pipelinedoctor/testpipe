import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSummary } from "./schema.js";
import type { TestSuite, TestStatus } from "./schema.js";

function makeSuite(
  cases: Array<{ status: TestStatus; durationMs?: number }>,
  suiteDurationMs?: number
): TestSuite {
  const caseList = cases.map((c, i) => ({
    name: `test_${i}`,
    classname: null,
    status: c.status,
    durationMs: c.durationMs ?? 100,
    failure: null,
    properties: {},
    attachments: [],
    systemOut: null,
    systemErr: null,
    retries: 0,
  }));
  return {
    name: "suite",
    timestamp: null,
    durationMs: suiteDurationMs ?? caseList.reduce((sum, c) => sum + c.durationMs, 0),
    properties: {},
    systemOut: null,
    systemErr: null,
    cases: caseList,
  };
}

describe("computeSummary", () => {
  it("empty suites array → all zeros", () => {
    const summary = computeSummary([]);
    assert.deepEqual(summary, { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: 0 });
  });

  it("counts each status correctly", () => {
    const suite = makeSuite([
      { status: "passed" },
      { status: "passed" },
      { status: "failed" },
      { status: "errored" },
      { status: "skipped" },
    ]);
    const summary = computeSummary([suite]);
    assert.equal(summary.total, 5);
    assert.equal(summary.passed, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.errored, 1);
    assert.equal(summary.skipped, 1);
  });

  it("durationMs is sum of suite durations, not individual test durations", () => {
    // Suite wall-clock time can differ from sum of case times (parallelism etc.)
    const suite1 = makeSuite([{ status: "passed", durationMs: 10 }], 1000);
    const suite2 = makeSuite([{ status: "passed", durationMs: 10 }], 500);
    const summary = computeSummary([suite1, suite2]);
    assert.equal(summary.durationMs, 1500);
  });

  it("aggregates counts correctly across multiple suites", () => {
    const s1 = makeSuite([{ status: "passed" }, { status: "failed" }]);
    const s2 = makeSuite([{ status: "passed" }, { status: "skipped" }, { status: "errored" }]);
    const summary = computeSummary([s1, s2]);
    assert.equal(summary.total, 5);
    assert.equal(summary.passed, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.errored, 1);
    assert.equal(summary.skipped, 1);
  });

  it("suite with no cases → total 0, no crash", () => {
    const summary = computeSummary([makeSuite([])]);
    assert.equal(summary.total, 0);
    assert.equal(summary.passed, 0);
  });

  it("all passed suite", () => {
    const summary = computeSummary([
      makeSuite([{ status: "passed" }, { status: "passed" }, { status: "passed" }]),
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.passed, 3);
    assert.equal(summary.failed, 0);
    assert.equal(summary.errored, 0);
    assert.equal(summary.skipped, 0);
  });
});
