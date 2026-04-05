import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { goTestJsonParser } from "./index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixturesDir = resolve(__dirname, "../../../../fixtures/go-test-json");

function fixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

describe("Go test JSON parser — go-subtests.ndjson", () => {
  const input = fixture("go-subtests.ndjson");
  const run = goTestJsonParser.parse(input);

  it("auto-detects Go format with score >= 0.95", () => {
    const score = goTestJsonParser.detect(input, "go-subtests.ndjson");
    assert.ok(score >= 0.95, `Expected score >= 0.95, got ${score}`);
  });

  it("produces 1 suite (one package)", () => {
    assert.equal(run.suites.length, 1);
    assert.equal(run.suites[0].name, "github.com/example/myapp");
  });

  it("produces 3 test cases: TestAuth, TestAuth/ValidToken, TestAuth/ExpiredToken", () => {
    const names = run.suites[0].cases.map(c => c.name);
    assert.equal(names.length, 3, `Expected 3 cases, got: ${JSON.stringify(names)}`);
    assert.ok(names.includes("TestAuth"), `Missing TestAuth in ${JSON.stringify(names)}`);
    assert.ok(names.includes("TestAuth/ValidToken"), `Missing TestAuth/ValidToken in ${JSON.stringify(names)}`);
    assert.ok(names.includes("TestAuth/ExpiredToken"), `Missing TestAuth/ExpiredToken in ${JSON.stringify(names)}`);
  });

  it("TestAuth/ValidToken → status 'passed'", () => {
    const tc = run.suites[0].cases.find(c => c.name === "TestAuth/ValidToken");
    assert.ok(tc, "TestAuth/ValidToken not found");
    assert.equal(tc.status, "passed");
    assert.equal(tc.durationMs, 201);
  });

  it("TestAuth/ExpiredToken → status 'failed'", () => {
    const tc = run.suites[0].cases.find(c => c.name === "TestAuth/ExpiredToken");
    assert.ok(tc, "TestAuth/ExpiredToken not found");
    assert.equal(tc.status, "failed");
  });

  it("output lines collected into systemOut for the relevant test", () => {
    const tc = run.suites[0].cases.find(c => c.name === "TestAuth/ValidToken");
    assert.ok(tc?.systemOut?.includes("token validated"), `Expected systemOut to include 'token validated', got: ${tc?.systemOut}`);
  });

  it("package-level fail event does not create a duplicate test case", () => {
    // The __package__ level "fail" event should not appear as a TestCase
    const names = run.suites[0].cases.map(c => c.name);
    const hasPackageCase = names.some(n => n === "" || n === "__package__");
    assert.ok(!hasPackageCase, `Package-level event created a spurious case: ${JSON.stringify(names)}`);
  });
});

describe("Go test JSON parser — detection", () => {
  it("non-NDJSON → score 0.0", () => {
    assert.equal(goTestJsonParser.detect("just plain text"), 0.0);
  });

  it("JSON without Action/Package fields → score 0.0", () => {
    assert.equal(goTestJsonParser.detect('{"foo":"bar"}'), 0.0);
  });

  it("Action=run with Package → score 0.98", () => {
    const line = JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "run", Package: "github.com/foo/bar", Test: "TestFoo" });
    assert.ok(goTestJsonParser.detect(line) >= 0.98);
  });
});

describe("Go test JSON parser — edge cases", () => {
  it("skip event → status 'skipped'", () => {
    const ndjson = [
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "run", Package: "pkg", Test: "TestSkip" }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "skip", Package: "pkg", Test: "TestSkip", Elapsed: 0.001 }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg", Elapsed: 0.1 }),
    ].join("\n");
    const run = goTestJsonParser.parse(ndjson);
    const tc = run.suites[0].cases.find(c => c.name === "TestSkip");
    assert.ok(tc, "TestSkip not found");
    assert.equal(tc.status, "skipped");
  });

  it("race condition output is collected into metadata.raceConditions", () => {
    const ndjson = [
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "run", Package: "pkg", Test: "TestRace" }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "output", Package: "pkg", Test: "TestRace", Output: "WARNING: DATA RACE\n" }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "fail", Package: "pkg", Test: "TestRace", Elapsed: 0.1 }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "fail", Package: "pkg", Elapsed: 0.2 }),
    ].join("\n");
    const run = goTestJsonParser.parse(ndjson);
    const races = run.metadata["raceConditions"] as string[];
    assert.ok(Array.isArray(races), "raceConditions should be an array");
    assert.ok(races.length > 0, "Should have detected a race condition");
    assert.ok(races[0].includes("DATA RACE"));
  });

  it("malformed NDJSON lines are skipped and recorded in parseErrors", () => {
    const ndjson = [
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "run", Package: "pkg", Test: "TestOk" }),
      "{ this is not valid json !!!",
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg", Test: "TestOk", Elapsed: 0.01 }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg", Elapsed: 0.05 }),
    ].join("\n");
    const run = goTestJsonParser.parse(ndjson);
    const errors = run.metadata["parseErrors"] as string[];
    assert.ok(errors.length > 0, "Expected parseErrors for malformed line");
    // Valid test still parsed
    const tc = run.suites[0]?.cases.find(c => c.name === "TestOk");
    assert.ok(tc, "TestOk should still be parsed despite bad line");
  });

  it("multiple packages → multiple suites", () => {
    const ndjson = [
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "run", Package: "pkg/a", Test: "TestA" }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg/a", Test: "TestA", Elapsed: 0.01 }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg/a", Elapsed: 0.05 }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "run", Package: "pkg/b", Test: "TestB" }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg/b", Test: "TestB", Elapsed: 0.01 }),
      JSON.stringify({ Time: "2024-01-01T00:00:00Z", Action: "pass", Package: "pkg/b", Elapsed: 0.05 }),
    ].join("\n");
    const run = goTestJsonParser.parse(ndjson);
    assert.equal(run.suites.length, 2);
    const names = run.suites.map(s => s.name);
    assert.ok(names.includes("pkg/a"));
    assert.ok(names.includes("pkg/b"));
  });
});
