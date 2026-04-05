import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitSqlite } from "./sqlite.js";
import type { TestRun } from "@testpipe/core";

function makeRun(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: crypto.randomUUID(),
    sourceFormat: "junit_xml",
    sourceFramework: "pytest",
    timestamp: "2024-01-15T10:00:00Z",
    durationMs: 1234,
    environment: null,
    metadata: {},
    suites: [
      {
        name: "test_auth",
        timestamp: null,
        durationMs: 1234,
        properties: {},
        systemOut: null,
        systemErr: null,
        cases: [
          {
            name: "test_login_valid",
            classname: "TestAuth",
            status: "passed",
            durationMs: 100,
            failure: null,
            properties: {},
            attachments: [],
            systemOut: null,
            systemErr: null,
            retries: 0,
          },
          {
            name: "test_login_fails",
            classname: "TestAuth",
            status: "failed",
            durationMs: 200,
            failure: {
              type: "assertion_failure",
              message: "Expected 401, got 200",
              body: "AssertionError: Expected 401, got 200",
              sourceType: "failure",
            },
            properties: {},
            attachments: [],
            systemOut: null,
            systemErr: null,
            retries: 0,
          },
        ],
      },
    ],
    summary: { total: 2, passed: 1, failed: 1, errored: 0, skipped: 0, durationMs: 1234 },
    ...overrides,
  };
}

describe("SQLite emitter", () => {
  let tmpDir: string;
  let dbPath: string;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "testpipe-test-"));
    dbPath = join(tmpDir, "test.db");
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a TestRun to a temp database without throwing", () => {
    const run = makeRun();
    assert.doesNotThrow(() => emitSqlite(run, dbPath));
  });

  it("re-reads rows and verifies count matches summary.total", () => {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT COUNT(*) as count FROM test_cases").get() as { count: number };
    db.close();
    assert.equal(rows.count, 2);
  });

  it("run row exists with correct source_format", () => {
    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT * FROM runs LIMIT 1").get() as { source_format: string; source_framework: string; total: number };
    db.close();
    assert.equal(row.source_format, "junit_xml");
    assert.equal(row.source_framework, "pytest");
    assert.equal(row.total, 2);
  });

  it("multiple runs can be written to the same database without conflict", () => {
    const run2 = makeRun();
    const run3 = makeRun();
    assert.doesNotThrow(() => emitSqlite(run2, dbPath));
    assert.doesNotThrow(() => emitSqlite(run3, dbPath));

    const db = new DatabaseSync(dbPath);
    const { count } = db.prepare("SELECT COUNT(*) as count FROM runs").get() as { count: number };
    db.close();
    // Original run + 2 new runs = 3
    assert.equal(count, 3);
  });
});
