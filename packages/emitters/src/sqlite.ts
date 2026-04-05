import { randomUUID } from "crypto";
import { DatabaseSync } from "node:sqlite";
import type { TestRun } from "@testpipe/core";

export function emitSqlite(run: TestRun, dbPath: string): void {
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      source_format TEXT NOT NULL,
      source_framework TEXT,
      timestamp TEXT,
      duration_ms INTEGER,
      total INTEGER,
      passed INTEGER,
      failed INTEGER,
      errored INTEGER,
      skipped INTEGER,
      environment TEXT
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      suite_name TEXT NOT NULL,
      name TEXT NOT NULL,
      classname TEXT,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      failure_type TEXT,
      failure_message TEXT,
      failure_body TEXT,
      retries INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_cases_run_id ON test_cases(run_id);
    CREATE INDEX IF NOT EXISTS idx_cases_name ON test_cases(name);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON test_cases(status);
  `);

  const insertRun = db.prepare(`
    INSERT INTO runs (id, source_format, source_framework, timestamp, duration_ms, total, passed, failed, errored, skipped, environment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCase = db.prepare(`
    INSERT INTO test_cases (id, run_id, suite_name, name, classname, status, duration_ms, failure_type, failure_message, failure_body, retries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN TRANSACTION");
  try {
    insertRun.run(
      run.id,
      run.sourceFormat,
      run.sourceFramework ?? null,
      run.timestamp ?? null,
      run.durationMs,
      run.summary.total,
      run.summary.passed,
      run.summary.failed,
      run.summary.errored,
      run.summary.skipped,
      run.environment ? JSON.stringify(run.environment) : null
    );

    for (const suite of run.suites) {
      for (const tc of suite.cases) {
        insertCase.run(
          randomUUID(),
          run.id,
          suite.name,
          tc.name,
          tc.classname ?? null,
          tc.status,
          tc.durationMs,
          tc.failure?.type ?? null,
          tc.failure?.message ?? null,
          tc.failure?.body ?? null,
          tc.retries
        );
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.close();
  }
}
