import { randomUUID } from "crypto";
import type { TestRun, TestSuite, TestCase } from "@testpipe/core";
import { computeSummary } from "@testpipe/core";
import type { ParseOptions } from "@testpipe/core";

interface GoTestEvent {
  Time: string;
  Action: "run" | "pass" | "fail" | "skip" | "output" | "pause" | "cont";
  Package: string;
  Test?: string;
  Elapsed?: number;
  Output?: string;
}

export function reassembleGoTest(input: string, options?: ParseOptions): TestRun {
  const parseErrors: string[] = [];
  const lines = input.split("\n").filter(l => l.trim() !== "");
  const events: GoTestEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as GoTestEvent;
      events.push(event);
    } catch {
      parseErrors.push(`Failed to parse line: ${line}`);
    }
  }

  // Group by Package -> Map<package, Map<testName, GoTestEvent[]>>
  const packageMap = new Map<string, Map<string, GoTestEvent[]>>();

  for (const event of events) {
    if (!packageMap.has(event.Package)) {
      packageMap.set(event.Package, new Map());
    }
    const testMap = packageMap.get(event.Package)!;
    const key = event.Test ?? "__package__";
    if (!testMap.has(key)) {
      testMap.set(key, []);
    }
    testMap.get(key)!.push(event);
  }

  const raceConditions: string[] = [];
  const suites: TestSuite[] = [];

  for (const [pkg, testMap] of packageMap) {
    const cases: TestCase[] = [];
    let suiteDuration = 0;
    let suiteTimestamp: string | null = null;

    for (const [testName, testEvents] of testMap) {
      if (testName === "__package__") {
        // Package-level events
        const passEvt = testEvents.find(e => e.Action === "pass");
        const failEvt = testEvents.find(e => e.Action === "fail");
        const evt = passEvt ?? failEvt;
        if (evt?.Elapsed) suiteDuration = Math.round(evt.Elapsed * 1000);
        if (testEvents[0]?.Time) suiteTimestamp = testEvents[0].Time;
        continue;
      }

      const outputLines: string[] = [];
      let status: TestCase["status"] = "skipped";
      let durationMs = 0;

      for (const evt of testEvents) {
        if (evt.Action === "output" && evt.Output) {
          outputLines.push(evt.Output);
          if (evt.Output.includes("WARNING: DATA RACE")) {
            raceConditions.push(evt.Output);
          }
        } else if (evt.Action === "pass") {
          status = "passed";
          durationMs = Math.round((evt.Elapsed ?? 0) * 1000);
        } else if (evt.Action === "fail") {
          status = "failed";
          durationMs = Math.round((evt.Elapsed ?? 0) * 1000);
        } else if (evt.Action === "skip") {
          status = "skipped";
        }
      }

      const systemOut = outputLines.length > 0 ? outputLines.join("") : null;
      const failureLine = outputLines.find(l => l.includes("FAIL:") || l.includes("Error:"));

      cases.push({
        name: testName,
        classname: null,
        status,
        durationMs,
        failure: status === "failed" ? {
          type: "error",
          message: failureLine?.trim() ?? "Test failed",
          body: systemOut,
          sourceType: null,
        } : null,
        properties: {},
        attachments: [],
        systemOut,
        systemErr: null,
        retries: 0,
      });
    }

    suites.push({
      name: pkg,
      timestamp: suiteTimestamp,
      durationMs: suiteDuration,
      properties: {},
      cases,
      systemOut: null,
      systemErr: null,
    });
  }

  return {
    id: randomUUID(),
    sourceFormat: "go_test_json",
    sourceFramework: options?.framework ?? "go",
    timestamp: events[0]?.Time ?? null,
    durationMs: suites.reduce((sum, s) => sum + s.durationMs, 0),
    environment: options?.environment ?? null,
    metadata: { parseErrors, raceConditions },
    suites,
    summary: computeSummary(suites),
  };
}
