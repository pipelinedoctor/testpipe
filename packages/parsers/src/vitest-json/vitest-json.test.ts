import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { vitestJsonParser } from "./index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixturesDir = resolve(__dirname, "../../../../fixtures/vitest-json");

function fixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

describe("Vitest JSON parser — vitest-basic.json", () => {
  const input = fixture("vitest-basic.json");
  const run = vitestJsonParser.parse(input);

  it("detects vitest with score >= 0.95 when config key present", () => {
    const score = vitestJsonParser.detect(input, "vitest-basic.json");
    assert.ok(score >= 0.95, `Expected score >= 0.95, got ${score}`);
  });

  it("sets sourceFramework to 'vitest'", () => {
    assert.equal(run.sourceFramework, "vitest");
  });

  it("parses tests array (Vitest-style, not Jest-style testResults)", () => {
    assert.equal(run.suites.length, 1);
    assert.equal(run.suites[0].name, "/project/src/utils.test.ts");
  });

  it("benchmark mode tests are excluded from cases", () => {
    const names = run.suites[0].cases.map(c => c.name);
    assert.ok(!names.includes("benchmark add"), `Benchmark case should be excluded, got: ${JSON.stringify(names)}`);
  });

  it("non-benchmark tests are included", () => {
    assert.equal(run.suites[0].cases.length, 3);
  });

  it("failed test has failure info", () => {
    const tc = run.suites[0].cases.find(c => c.name === "subtract numbers");
    assert.ok(tc, "subtract numbers not found");
    assert.equal(tc.status, "failed");
    assert.ok(tc.failure?.message.includes("AssertionError"));
    assert.ok(tc.failure?.body?.includes("utils.test.ts:12"));
  });

  it("skipped test maps to status 'skipped'", () => {
    const tc = run.suites[0].cases.find(c => c.name === "multiply numbers");
    assert.ok(tc, "multiply numbers not found");
    assert.equal(tc.status, "skipped");
  });

  it("typecheck data is preserved in metadata", () => {
    assert.ok(run.metadata["typecheck"] !== null, "typecheck should be in metadata");
  });

  it("config data is preserved in metadata", () => {
    const config = run.metadata["config"] as Record<string, unknown>;
    assert.ok(config !== null);
    assert.equal(config["root"], "/project");
  });

  it("summary counts are correct (benchmark excluded)", () => {
    assert.equal(run.summary.total, 3);
    assert.equal(run.summary.passed, 1);
    assert.equal(run.summary.failed, 1);
    assert.equal(run.summary.skipped, 1);
  });
});

describe("Vitest JSON parser — detection", () => {
  it("prefers vitest over jest when config key present (score 0.95 vs 0.90)", () => {
    const vitestInput = JSON.stringify({
      numTotalTests: 1,
      testResults: [],
      config: { root: "/project" },
    });
    assert.ok(vitestJsonParser.detect(vitestInput) >= 0.95);
  });

  it("scores 0.75 when no config and no snapshot key", () => {
    const input = JSON.stringify({
      numTotalTests: 1,
      testResults: [],
    });
    const score = vitestJsonParser.detect(input);
    assert.equal(score, 0.75);
  });

  it("scores 0.0 when missing numTotalTests", () => {
    const score = vitestJsonParser.detect(JSON.stringify({ testResults: [] }));
    assert.equal(score, 0.0);
  });

  it("scores 0.0 for non-JSON input", () => {
    assert.equal(vitestJsonParser.detect("not json"), 0.0);
  });
});

describe("Vitest JSON parser — edge cases", () => {
  it("handles testResults array (Jest-style) instead of tests", () => {
    const input = JSON.stringify({
      numTotalTests: 1,
      testResults: [{
        testFilePath: "/project/foo.test.ts",
        startTime: 0,
        endTime: 100,
        testResults: [{ name: "my test", status: "passed", duration: 10 }],
      }],
      config: { root: "/project" },
    });
    const run = vitestJsonParser.parse(input);
    assert.equal(run.suites[0].cases[0].name, "my test");
  });

  it("handles malformed JSON without throwing in non-strict mode", () => {
    const run = vitestJsonParser.parse("{ bad json ]]]");
    assert.equal(run.suites.length, 0);
    const errors = run.metadata["parseErrors"] as string[];
    assert.ok(errors.length > 0);
  });

  it("throws on malformed JSON in strict mode", () => {
    assert.throws(() => vitestJsonParser.parse("{ bad json ]]]", { strict: true }));
  });
});
