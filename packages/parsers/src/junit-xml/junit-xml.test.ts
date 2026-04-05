import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { junitXmlParser } from "./index.js";
import { computeSummary } from "@testpipe/core";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixturesDir = resolve(__dirname, "../../../../fixtures/junit-xml");

function fixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

describe("JUnit XML parser — pytest-xunit2.xml", () => {
  const input = fixture("pytest-xunit2.xml");
  const run = junitXmlParser.parse(input);

  it("detects framework as 'pytest' with score >= 0.98", () => {
    const score = junitXmlParser.detect(input, "pytest-xunit2.xml");
    assert.ok(score >= 0.98, `Expected score >= 0.98, got ${score}`);
    assert.equal(run.sourceFramework, "pytest");
  });

  it("preserves parametrized test name exactly including brackets", () => {
    const names = run.suites.flatMap(s => s.cases.map(c => c.name));
    assert.ok(
      names.includes("test_login_parametrized[admin-True]"),
      `Expected parametrized name in ${JSON.stringify(names)}`
    );
  });

  it("maps <failure> to status 'failed' and failure.type 'assertion_failure'", () => {
    const tc = run.suites[0].cases.find(c => c.name === "test_login_invalid_password");
    assert.ok(tc, "test case not found");
    assert.equal(tc.status, "failed");
    assert.equal(tc.failure?.type, "assertion_failure");
    assert.equal(tc.failure?.sourceType, "failure");
    assert.ok(tc.failure?.message.includes("Expected 401, got 200"));
  });

  it("time='0.123' → durationMs: 123", () => {
    const tc = run.suites[0].cases.find(c => c.name === "test_login_valid");
    assert.ok(tc, "test case not found");
    assert.equal(tc.durationMs, 123);
  });

  it("computeSummary returns correct counts", () => {
    const summary = computeSummary(run.suites);
    assert.equal(summary.total, 3);
    assert.equal(summary.passed, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.errored, 0);
  });
});

describe("JUnit XML parser — nested-testsuites.xml", () => {
  const input = fixture("nested-testsuites.xml");
  const run = junitXmlParser.parse(input);

  it("parses 2 suites and 3 test cases total", () => {
    assert.equal(run.suites.length, 2);
    const total = run.suites.reduce((n, s) => n + s.cases.length, 0);
    assert.equal(total, 3);
  });

  it("maps <error> to status 'errored' and failure.type 'error'", () => {
    const tc = run.suites.flatMap(s => s.cases).find(c => c.name === "test_three");
    assert.ok(tc, "test_three not found");
    assert.equal(tc.status, "errored");
    assert.equal(tc.failure?.type, "error");
    assert.equal(tc.failure?.sourceType, "error");
  });

  it("suite names are preserved", () => {
    const names = run.suites.map(s => s.name);
    assert.ok(names.includes("suite_a"), `suite_a missing from ${JSON.stringify(names)}`);
    assert.ok(names.includes("suite_b"), `suite_b missing from ${JSON.stringify(names)}`);
  });
});

describe("JUnit XML parser — edge cases", () => {
  it("empty <testsuite> with no children → 0 cases, does not crash", () => {
    const input = `<?xml version="1.0"?><testsuite name="empty" tests="0" time="0"/>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites.length, 1);
    assert.equal(run.suites[0].cases.length, 0);
  });

  it("time='' → durationMs: 0", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time=""><testcase name="x" time=""/></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].cases[0].durationMs, 0);
  });

  it("time='N/A' → durationMs: 0", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="N/A"><testcase name="x" time="N/A"/></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].cases[0].durationMs, 0);
  });

  it("non-XML input → score 0.0", () => {
    const score = junitXmlParser.detect("hello world, not xml");
    assert.equal(score, 0.0);
  });

  it("<skipped> element → status 'skipped', no failure", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1"><testcase name="skip_me" time="0"><skipped/></testcase></testsuite>`;
    const run = junitXmlParser.parse(input);
    const tc = run.suites[0].cases[0];
    assert.equal(tc.status, "skipped");
    assert.equal(tc.failure, null);
  });

  it("preserves <system-out> on test suite", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1"><system-out>suite stdout here</system-out><testcase name="x" time="0"/></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].systemOut, "suite stdout here");
  });

  it("preserves <system-out> on test case", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1"><testcase name="x" time="0"><system-out>test stdout</system-out></testcase></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].cases[0].systemOut, "test stdout");
  });

  it("preserves properties on test suite", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1"><properties><property name="env" value="staging"/></properties><testcase name="x" time="0"/></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].properties["env"], "staging");
  });

  it("preserves properties on test case", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1"><testcase name="x" time="0"><properties><property name="retried" value="true"/></properties></testcase></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].cases[0].properties["retried"], "true");
  });

  it("multiple <failure> elements on one testcase → messages concatenated with separator", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1">
      <testcase name="multi_fail" time="0">
        <failure message="First error">body one</failure>
        <failure message="Second error">body two</failure>
      </testcase>
    </testsuite>`;
    const run = junitXmlParser.parse(input);
    const tc = run.suites[0].cases[0];
    assert.equal(tc.status, "failed");
    assert.ok(tc.failure?.message.includes("First error"), `message: ${tc.failure?.message}`);
    assert.ok(tc.failure?.message.includes("Second error"), `message: ${tc.failure?.message}`);
    assert.ok(tc.failure?.message.includes("---"), "Should use separator");
  });

  it("unicode and emoji in test names are preserved", () => {
    const input = `<?xml version="1.0"?><testsuite name="t" time="1"><testcase name="test_emoji_🎉_and_中文" time="0"/></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].cases[0].name, "test_emoji_🎉_and_中文");
  });

  it("missing suite name defaults to 'unnamed'", () => {
    const input = `<?xml version="1.0"?><testsuite time="1"><testcase name="x" time="0"/></testsuite>`;
    const run = junitXmlParser.parse(input);
    assert.equal(run.suites[0].name, "unnamed");
  });

  it("XML comment with no root element → returns empty run with parseErrors", () => {
    // A comment with no element after it causes the parser to throw
    const run = junitXmlParser.parse("<!-- just a comment -->");
    assert.equal(run.suites.length, 0);
    const errors = run.metadata["parseErrors"] as string[];
    assert.ok(errors.length > 0, "Expected parseErrors to be populated");
  });
});
