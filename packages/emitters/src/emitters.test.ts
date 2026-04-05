import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { TestRun } from "@testpipe/core";
import { emitJson } from "./json.js";
import { emitNdjson } from "./ndjson.js";
import { emitSummary } from "./summary.js";
import { emitHttp } from "./http.js";

// ─── Shared fixture ────────────────────────────────────────────────────────────

function makeRun(): TestRun {
  return {
    id: "test-run-id-123",
    sourceFormat: "pytest_xml",
    sourceFramework: "pytest",
    timestamp: "2024-01-15T10:00:00Z",
    durationMs: 5000,
    environment: null,
    metadata: {},
    suites: [
      {
        name: "test_auth",
        timestamp: null,
        durationMs: 3000,
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
      {
        name: "test_db",
        timestamp: null,
        durationMs: 2000,
        properties: {},
        systemOut: null,
        systemErr: null,
        cases: [
          {
            name: "test_connection",
            classname: "TestDB",
            status: "skipped",
            durationMs: 0,
            failure: null,
            properties: {},
            attachments: [],
            systemOut: null,
            systemErr: null,
            retries: 0,
          },
        ],
      },
    ],
    summary: { total: 3, passed: 1, failed: 1, errored: 0, skipped: 1, durationMs: 5000 },
  };
}

// ─── Stdout capture helper ─────────────────────────────────────────────────────

function captureStdout(fn: () => void): string {
  let output = "";
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as NodeJS.WriteStream).write = (chunk: unknown): boolean => {
    output += String(chunk);
    return true;
  };
  try {
    fn();
  } finally {
    (process.stdout as NodeJS.WriteStream).write = orig;
  }
  return output;
}

// ─── Mock HTTP server helper ───────────────────────────────────────────────────

interface MockServer {
  server: Server;
  url: string;
  requests: Array<{ body: string; headers: Record<string, string | string[] | undefined> }>;
  close: () => Promise<void>;
}

function startMockServer(statusCodes: number[]): Promise<MockServer> {
  const requests: MockServer["requests"] = [];
  let callCount = 0;

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      requests.push({ body, headers: req.headers as Record<string, string | string[] | undefined> });
      const code = statusCodes[callCount] ?? statusCodes[statusCodes.length - 1];
      callCount++;
      res.writeHead(code, { "Content-Type": "text/plain" });
      res.end(code >= 400 ? "error response" : "ok");
    });
  });

  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}`,
        requests,
        close: () => new Promise(res => server.close(() => res())),
      });
    });
  });
}

// ─── emitJson ─────────────────────────────────────────────────────────────────

describe("emitJson", () => {
  it("returns valid JSON string", () => {
    const run = makeRun();
    const output = emitJson(run);
    assert.doesNotThrow(() => JSON.parse(output));
  });

  it("round-trips the run id", () => {
    const run = makeRun();
    const parsed = JSON.parse(emitJson(run));
    assert.equal(parsed.id, run.id);
  });

  it("includes all suites and cases", () => {
    const run = makeRun();
    const parsed = JSON.parse(emitJson(run));
    assert.equal(parsed.suites.length, 2);
    assert.equal(parsed.suites[0].cases.length, 2);
    assert.equal(parsed.suites[1].cases.length, 1);
  });

  it("preserves failure info", () => {
    const run = makeRun();
    const parsed = JSON.parse(emitJson(run));
    const failedCase = parsed.suites[0].cases[1];
    assert.equal(failedCase.failure.message, "Expected 401, got 200");
  });

  it("is pretty-printed (contains newlines)", () => {
    const run = makeRun();
    assert.ok(emitJson(run).includes("\n"));
  });
});

// ─── emitNdjson ───────────────────────────────────────────────────────────────

describe("emitNdjson", () => {
  it("yields one line per test case", () => {
    const run = makeRun();
    const lines = [...emitNdjson(run)];
    assert.equal(lines.length, 3); // 2 cases in suite1 + 1 in suite2
  });

  it("each line is valid JSON", () => {
    const run = makeRun();
    for (const line of emitNdjson(run)) {
      assert.doesNotThrow(() => JSON.parse(line), `Invalid JSON: ${line}`);
    }
  });

  it("each line contains runId, suiteName, caseName, status, durationMs", () => {
    const run = makeRun();
    const lines = [...emitNdjson(run)].map(l => JSON.parse(l));
    for (const line of lines) {
      assert.ok("runId" in line);
      assert.ok("suiteName" in line);
      assert.ok("caseName" in line);
      assert.ok("status" in line);
      assert.ok("durationMs" in line);
    }
  });

  it("runId matches the run id on every line", () => {
    const run = makeRun();
    for (const line of emitNdjson(run)) {
      assert.equal(JSON.parse(line).runId, run.id);
    }
  });

  it("preserves failure on failed cases", () => {
    const run = makeRun();
    const lines = [...emitNdjson(run)].map(l => JSON.parse(l));
    const failed = lines.find(l => l.status === "failed");
    assert.ok(failed, "No failed line found");
    assert.equal(failed.failure.message, "Expected 401, got 200");
  });

  it("failure is null for passing cases", () => {
    const run = makeRun();
    const lines = [...emitNdjson(run)].map(l => JSON.parse(l));
    const passed = lines.find(l => l.status === "passed");
    assert.ok(passed, "No passed line found");
    assert.equal(passed.failure, null);
  });

  it("yields nothing for a run with no test cases", () => {
    const run = makeRun();
    run.suites = [];
    const lines = [...emitNdjson(run)];
    assert.equal(lines.length, 0);
  });
});

// ─── emitSummary ──────────────────────────────────────────────────────────────

describe("emitSummary", () => {
  it("outputs pass/fail/skip counts", () => {
    const output = captureStdout(() => emitSummary(makeRun()));
    assert.ok(output.includes("1"), "Should contain count 1");
    assert.ok(output.includes("Passed") || output.includes("✓"));
    assert.ok(output.includes("Failed") || output.includes("✗"));
    assert.ok(output.includes("Skipped") || output.includes("○"));
  });

  it("includes the framework name", () => {
    const output = captureStdout(() => emitSummary(makeRun()));
    assert.ok(output.includes("pytest"), `Expected 'pytest' in output: ${output}`);
  });

  it("includes the filename when provided", () => {
    const output = captureStdout(() => emitSummary(makeRun(), "results.xml"));
    assert.ok(output.includes("results.xml"), `Expected filename in output: ${output}`);
  });

  it("omits filename line when not provided", () => {
    const output = captureStdout(() => emitSummary(makeRun()));
    assert.ok(!output.includes("File:"), `Should not have File: line: ${output}`);
  });

  it("lists failure names in the Failures section", () => {
    const output = captureStdout(() => emitSummary(makeRun()));
    assert.ok(output.includes("test_login_fails"), `Expected failure name in output: ${output}`);
    assert.ok(output.includes("Expected 401, got 200"));
  });

  it("omits Failures section when all tests pass", () => {
    const run = makeRun();
    run.suites[0].cases[1].status = "passed";
    run.suites[0].cases[1].failure = null;
    run.summary.failed = 0;
    run.summary.passed = 2;
    const output = captureStdout(() => emitSummary(run));
    assert.ok(!output.includes("Failures:"), `Should not have Failures section: ${output}`);
  });

  it("does not divide by zero on empty run", () => {
    const run = makeRun();
    run.suites = [];
    run.summary = { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: 0 };
    assert.doesNotThrow(() => captureStdout(() => emitSummary(run)));
  });
});

// ─── emitHttp ─────────────────────────────────────────────────────────────────

describe("emitHttp", () => {
  it("POSTs the run as JSON to the given URL", async () => {
    const mock = await startMockServer([200]);
    const run = makeRun();
    await emitHttp(run, mock.url, "my-token");
    assert.equal(mock.requests.length, 1);
    const body = JSON.parse(mock.requests[0].body);
    assert.equal(body.id, run.id);
    await mock.close();
  });

  it("sends Authorization: Bearer token header", async () => {
    const mock = await startMockServer([200]);
    await emitHttp(makeRun(), mock.url, "secret-token");
    assert.equal(mock.requests[0].headers["authorization"], "Bearer secret-token");
    await mock.close();
  });

  it("sends Content-Type: application/json header", async () => {
    const mock = await startMockServer([200]);
    await emitHttp(makeRun(), mock.url, "token");
    assert.ok(
      mock.requests[0].headers["content-type"]?.includes("application/json"),
      "Expected application/json content-type"
    );
    await mock.close();
  });

  it("throws immediately on 4xx without retrying", async () => {
    const mock = await startMockServer([404]);
    await assert.rejects(
      () => emitHttp(makeRun(), mock.url, "token"),
      /HTTP 404/
    );
    assert.equal(mock.requests.length, 1, "Should not retry on 4xx");
    await mock.close();
  });

  it("throws on 401 with descriptive error", async () => {
    const mock = await startMockServer([401]);
    await assert.rejects(
      () => emitHttp(makeRun(), mock.url, "bad-token"),
      /HTTP 401/
    );
    await mock.close();
  });

  it("retries on 5xx and succeeds if server recovers", { timeout: 15000 }, async () => {
    // First two requests return 500, third returns 200
    const mock = await startMockServer([500, 500, 200]);
    await emitHttp(makeRun(), mock.url, "token");
    assert.equal(mock.requests.length, 3, "Should have retried twice before succeeding");
    await mock.close();
  });

  it("throws after 3 failed 5xx attempts", { timeout: 15000 }, async () => {
    const mock = await startMockServer([500, 500, 500]);
    await assert.rejects(
      () => emitHttp(makeRun(), mock.url, "token"),
      /server error|HTTP 500/
    );
    assert.equal(mock.requests.length, 3, "Should have made exactly 3 attempts");
    await mock.close();
  });
});
