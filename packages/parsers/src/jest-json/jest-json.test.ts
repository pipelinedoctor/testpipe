import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { jestJsonParser } from "./index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixturesDir = resolve(__dirname, "../../../../fixtures/jest-json");

function fixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

describe("Jest JSON parser — jest-basic.json", () => {
  const input = fixture("jest-basic.json");
  const run = jestJsonParser.parse(input);

  it("detects framework as 'jest' with score >= 0.90", () => {
    const score = jestJsonParser.detect(input, "jest-basic.json");
    assert.ok(score >= 0.90, `Expected score >= 0.90, got ${score}`);
    assert.equal(run.sourceFramework, "jest");
  });

  it("assembles full test name from ancestorTitles + title", () => {
    const names = run.suites.flatMap(s => s.cases.map(c => c.name));
    assert.ok(names.includes("Button > renders correctly"), `Missing 'Button > renders correctly' in ${JSON.stringify(names)}`);
    assert.ok(names.includes("Button > handles click events"), `Missing 'Button > handles click events' in ${JSON.stringify(names)}`);
    assert.ok(names.includes("Button > when disabled > does not fire onClick"), `Missing nested name in ${JSON.stringify(names)}`);
  });

  it("failureMessages → failure.body correctly", () => {
    const tc = run.suites.flatMap(s => s.cases).find(c => c.name === "Button > handles click events");
    assert.ok(tc, "failing test case not found");
    assert.equal(tc.status, "failed");
    assert.ok(tc.failure?.body?.includes("Expected: true"), `failure.body missing content: ${tc.failure?.body}`);
    assert.ok(tc.failure?.message.startsWith("Error:"), `Expected message to start with 'Error:', got: ${tc.failure?.message}`);
  });

  it("duration is already in ms — no multiplication applied", () => {
    const tc = run.suites.flatMap(s => s.cases).find(c => c.name === "Button > renders correctly");
    assert.ok(tc, "test case not found");
    assert.equal(tc.durationMs, 45);
  });

  it("summary totals are correct", () => {
    assert.equal(run.summary.total, 3);
    assert.equal(run.summary.passed, 2);
    assert.equal(run.summary.failed, 1);
  });
});

describe("Jest JSON parser — status mapping", () => {
  it("status 'pending' → 'skipped' in canonical schema", () => {
    const input = JSON.stringify({
      numTotalTests: 1,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 1,
      testResults: [{
        testFilePath: "/test/foo.test.ts",
        status: "pending",
        startTime: 0,
        endTime: 0,
        testResults: [{
          ancestorTitles: [],
          title: "pending test",
          status: "pending",
          duration: 0
        }]
      }],
      snapshot: {}
    });
    const run = jestJsonParser.parse(input);
    assert.equal(run.suites[0].cases[0].status, "skipped");
  });

  it("status 'todo' → 'skipped' in canonical schema", () => {
    const input = JSON.stringify({
      numTotalTests: 1,
      testResults: [{
        testFilePath: "/test/foo.test.ts",
        status: "todo",
        startTime: 0,
        endTime: 0,
        testResults: [{
          ancestorTitles: [],
          title: "todo test",
          status: "todo",
          duration: 0
        }]
      }],
      snapshot: {}
    });
    const run = jestJsonParser.parse(input);
    assert.equal(run.suites[0].cases[0].status, "skipped");
  });
});

describe("Jest JSON parser — detection", () => {
  it("non-JSON → score 0.0", () => {
    assert.equal(jestJsonParser.detect("not json at all"), 0.0);
  });

  it("JSON without jest keys → low score", () => {
    const score = jestJsonParser.detect(JSON.stringify({ foo: "bar" }));
    assert.ok(score <= 0.05);
  });
});
