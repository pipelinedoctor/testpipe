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
});
